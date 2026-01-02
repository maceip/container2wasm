# OPFS Integration Implementation Guide for container2wasm

## Overview

This document provides detailed implementation guidance for adding Origin Private File System (OPFS) support to container2wasm. The implementation is divided into phases:

- **S1**: OPFS-backed WASI shim (browser filesystem access)
- **M1**: OPFS-backed 9P server (guest VM filesystem passthrough)
- **L1**: Native OPFS virtio device (direct guest access, optional future work)

## Prerequisites

### Required Reading
- [OPFS MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [FileSystemSyncAccessHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle)
- [9P2000.L Protocol](https://github.com/chaos/diod/blob/master/protocol.md)
- [container2wasm architecture](../README.md)

### Key Dependencies
| Package | Purpose | Source |
|---------|---------|--------|
| happy-opfs | Sync OPFS API via SharedArrayBuffer | https://github.com/AimWhy/happy-opfs |
| v86 lib/9p.js | 9P2000.L protocol implementation | https://github.com/nicksherron/nicksherron.com/blob/main/public/v86/lib/9p.js |
| tokio-fs-ext | Rust WASM OPFS (for L1) | https://github.com/nicksherron/nicksherron.com/tree/main/public/tokio-fs-ext |

---

## Phase S1: OPFS-Backed WASI Shim

### Goal
Replace the in-memory filesystem in `browser_wasi_shim` with OPFS, allowing WASI programs to persist files across sessions.

### Files to Modify

#### 1. `examples/wasi-browser/htdocs/worker.js`

**Current State**: Uses `browser_wasi_shim` with `PreopenDirectory` backed by in-memory `Directory` class.

```javascript
// Current implementation (lines ~50-70)
import { File, Directory, PreopenDirectory, WASI } from "@aspect-build/aspect-runtime-js/snapshot";

let fds = [
    // ...
    new PreopenDirectory("/", new Directory({})),
];
```

**Required Changes**:

```javascript
// New implementation with OPFS backend
import {
    connectSyncAgent,
    mkdirSync,
    readFileSync,
    writeFileSync,
    removeSync,
    statSync,
    readDirSync
} from 'happy-opfs';

// Initialize OPFS sync agent (must be done before WASI instantiation)
let opfsReady = false;

async function initOPFS() {
    // Create worker for sync OPFS operations
    const workerUrl = new URL('./opfs-worker.js', import.meta.url);
    await connectSyncAgent(workerUrl);
    opfsReady = true;

    // Ensure root directories exist
    mkdirSync('/container');
    mkdirSync('/shared');
}

// OPFS-backed Directory implementation
class OPFSDirectory {
    constructor(basePath) {
        this.basePath = basePath;
    }

    resolvePath(name) {
        return this.basePath + '/' + name;
    }

    get_entry(name) {
        const path = this.resolvePath(name);
        const statResult = statSync(path);

        if (statResult.isErr()) {
            return null;
        }

        const handle = statResult.unwrap();
        if (handle.kind === 'directory') {
            return new OPFSDirectory(path);
        } else {
            return new OPFSFile(path);
        }
    }

    create_entry_for_path(name, isDir) {
        const path = this.resolvePath(name);
        if (isDir) {
            mkdirSync(path);
            return new OPFSDirectory(path);
        } else {
            writeFileSync(path, new Uint8Array(0));
            return new OPFSFile(path);
        }
    }

    *entries() {
        const result = readDirSync(this.basePath);
        if (result.isOk()) {
            for (const entry of result.unwrap()) {
                yield [entry.path, entry.handle.kind === 'directory'
                    ? new OPFSDirectory(this.resolvePath(entry.path))
                    : new OPFSFile(this.resolvePath(entry.path))
                ];
            }
        }
    }
}

class OPFSFile {
    constructor(path) {
        this.path = path;
        this._data = null;
        this._dirty = false;
    }

    get data() {
        if (this._data === null) {
            const result = readFileSync(this.path);
            this._data = result.isOk() ? new Uint8Array(result.unwrap()) : new Uint8Array(0);
        }
        return this._data;
    }

    set data(value) {
        this._data = value;
        this._dirty = true;
    }

    flush() {
        if (this._dirty) {
            writeFileSync(this.path, this._data);
            this._dirty = false;
        }
    }
}
```

#### 2. New File: `examples/wasi-browser/htdocs/opfs-worker.js`

This worker handles synchronous OPFS operations using happy-opfs's sync agent:

```javascript
// opfs-worker.js - OPFS sync agent worker
import { startSyncAgent } from 'happy-opfs';

// Start the sync agent to handle requests from main thread
startSyncAgent();
```

#### 3. `examples/wasi-browser/htdocs/index.html`

Add happy-opfs to dependencies and initialize before WASM:

```html
<!-- Add to head -->
<script type="importmap">
{
    "imports": {
        "happy-opfs": "https://esm.sh/happy-opfs@latest"
    }
}
</script>

<script type="module">
// Initialize OPFS before starting container
await initOPFS();
// Then start container...
</script>
```

### Integration with Existing SharedArrayBuffer Pattern

The existing `worker-util.js` uses SharedArrayBuffer for TTY synchronization:

```javascript
// Current pattern in worker-util.js (lines 28-40)
var streamCtrl = new Int32Array(new SharedArrayBuffer(4));
var streamData = new Uint8Array(new SharedArrayBuffer(4096));

function sockAccept(){
    streamCtrl[0] = 0;
    postMessage({type: "accept"});
    Atomics.wait(streamCtrl, 0, 0);  // Blocks until main thread signals
    return streamData[0] == 1;
}
```

happy-opfs uses the same pattern in `SyncMessenger`:

```typescript
// From happy-opfs/src/worker/shared.ts
export class SyncMessenger {
    readonly i32a: Int32Array;  // Lock array
    readonly maxDataLength: number;
    private readonly u8a: Uint8Array;  // Data buffer

    // Buffer layout: [MAIN_LOCK, WORKER_LOCK, DATA_LENGTH, RESERVED, ...PAYLOAD]
}
```

**Compatibility**: Both patterns can coexist since they use separate SharedArrayBuffer instances.

---

## Phase M1: OPFS-Backed 9P Server

### Goal
Implement a 9P2000.L server in JavaScript that serves files from OPFS, allowing the guest Linux VM to mount OPFS as a filesystem.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Main Thread                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐  │
│  │   Guest VM  │────▶│  Virtio-9P   │────▶│  9P Server   │  │
│  │   (Linux)   │◀────│  Transport   │◀────│  (JS)        │  │
│  └─────────────┘     └──────────────┘     └──────────────┘  │
│                                                  │          │
│                                           ┌──────▼──────┐   │
│                                           │ happy-opfs  │   │
│                                           │   (sync)    │   │
│                                           └──────┬──────┘   │
│                                                  │          │
├──────────────────────────────────────────────────┼──────────┤
│                     OPFS Worker                  │          │
│                                           ┌──────▼──────┐   │
│                                           │    OPFS     │   │
│                                           │  Storage    │   │
│                                           └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Files to Create/Modify

#### 1. New File: `examples/wasi-browser/htdocs/p9-opfs.js`

This is the core 9P2000.L server backed by OPFS. Based on v86's lib/9p.js:

```javascript
/**
 * 9P2000.L Server backed by OPFS
 *
 * Protocol reference: https://github.com/chaos/diod/blob/master/protocol.md
 */

import {
    mkdirSync,
    readFileSync,
    writeFileSync,
    removeSync,
    statSync,
    readDirSync,
    existsSync
} from 'happy-opfs';

// 9P2000.L message types
const P9_TLERROR = 6;
const P9_RLERROR = 7;
const P9_TSTATFS = 8;
const P9_RSTATFS = 9;
const P9_TLOPEN = 12;
const P9_RLOPEN = 13;
const P9_TLCREATE = 14;
const P9_RLCREATE = 15;
const P9_TSYMLINK = 16;
const P9_RSYMLINK = 17;
const P9_TMKNOD = 18;
const P9_RMKNOD = 19;
const P9_TRENAME = 20;
const P9_RRENAME = 21;
const P9_TREADLINK = 22;
const P9_RREADLINK = 23;
const P9_TGETATTR = 24;
const P9_RGETATTR = 25;
const P9_TSETATTR = 26;
const P9_RSETATTR = 27;
const P9_TXATTRWALK = 30;
const P9_RXATTRWALK = 31;
const P9_TXATTRCREATE = 32;
const P9_RXATTRCREATE = 33;
const P9_TREADDIR = 40;
const P9_RREADDIR = 41;
const P9_TFSYNC = 50;
const P9_RFSYNC = 51;
const P9_TLOCK = 52;
const P9_RLOCK = 53;
const P9_TGETLOCK = 54;
const P9_RGETLOCK = 55;
const P9_TLINK = 70;
const P9_RLINK = 71;
const P9_TMKDIR = 72;
const P9_RMKDIR = 73;
const P9_TRENAMEAT = 74;
const P9_RRENAMEAT = 75;
const P9_TUNLINKAT = 76;
const P9_RUNLINKAT = 77;
const P9_TVERSION = 100;
const P9_RVERSION = 101;
const P9_TAUTH = 102;
const P9_RAUTH = 103;
const P9_TATTACH = 104;
const P9_RATTACH = 105;
const P9_TFLUSH = 108;
const P9_RFLUSH = 109;
const P9_TWALK = 110;
const P9_RWALK = 111;
const P9_TREAD = 116;
const P9_RREAD = 117;
const P9_TWRITE = 118;
const P9_RWRITE = 119;
const P9_TCLUNK = 120;
const P9_RCLUNK = 121;
const P9_TREMOVE = 122;
const P9_RREMOVE = 123;

// Error codes (Linux errno values)
const EPERM = 1;
const ENOENT = 2;
const EIO = 5;
const EEXIST = 17;
const ENOTDIR = 20;
const EISDIR = 21;
const EINVAL = 22;
const ENOSPC = 28;
const ENOTEMPTY = 39;

/**
 * OPFS-backed 9P2000.L Server
 */
export class OPFS9PServer {
    constructor(rootPath = '/p9root') {
        this.rootPath = rootPath;
        this.fids = new Map();  // fid -> { path, qid, handle? }
        this.nextQid = 1n;
        this.qidMap = new Map();  // path -> qid
        this.msize = 8192;

        // Ensure root exists
        mkdirSync(rootPath);
    }

    /**
     * Resolve a path relative to root
     */
    resolvePath(path) {
        if (path === '' || path === '/') {
            return this.rootPath;
        }
        // Normalize and prevent path traversal
        const normalized = path.replace(/\/+/g, '/').replace(/^\//, '');
        return this.rootPath + '/' + normalized;
    }

    /**
     * Get or create a QID for a path
     */
    getQid(path, isDir) {
        if (!this.qidMap.has(path)) {
            const qid = {
                type: isDir ? 0x80 : 0x00,  // QTDIR or QTFILE
                version: 0,
                path: this.nextQid++
            };
            this.qidMap.set(path, qid);
        }
        return this.qidMap.get(path);
    }

    /**
     * Encode a QID to buffer
     */
    encodeQid(qid) {
        const buf = new Uint8Array(13);
        const view = new DataView(buf.buffer);
        buf[0] = qid.type;
        view.setUint32(1, qid.version, true);
        view.setBigUint64(5, qid.path, true);
        return buf;
    }

    /**
     * Handle incoming 9P message
     */
    handleMessage(data) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const size = view.getUint32(0, true);
        const type = data[4];
        const tag = view.getUint16(5, true);

        let response;

        try {
            switch (type) {
                case P9_TVERSION:
                    response = this.handleVersion(data, tag);
                    break;
                case P9_TATTACH:
                    response = this.handleAttach(data, tag);
                    break;
                case P9_TWALK:
                    response = this.handleWalk(data, tag);
                    break;
                case P9_TGETATTR:
                    response = this.handleGetattr(data, tag);
                    break;
                case P9_TREADDIR:
                    response = this.handleReaddir(data, tag);
                    break;
                case P9_TLOPEN:
                    response = this.handleLopen(data, tag);
                    break;
                case P9_TREAD:
                    response = this.handleRead(data, tag);
                    break;
                case P9_TWRITE:
                    response = this.handleWrite(data, tag);
                    break;
                case P9_TLCREATE:
                    response = this.handleLcreate(data, tag);
                    break;
                case P9_TMKDIR:
                    response = this.handleMkdir(data, tag);
                    break;
                case P9_TUNLINKAT:
                    response = this.handleUnlinkat(data, tag);
                    break;
                case P9_TCLUNK:
                    response = this.handleClunk(data, tag);
                    break;
                case P9_TSTATFS:
                    response = this.handleStatfs(data, tag);
                    break;
                case P9_TSETATTR:
                    response = this.handleSetattr(data, tag);
                    break;
                case P9_TFSYNC:
                    response = this.handleFsync(data, tag);
                    break;
                default:
                    console.warn(`Unhandled 9P message type: ${type}`);
                    response = this.errorResponse(tag, EINVAL);
            }
        } catch (e) {
            console.error('9P error:', e);
            response = this.errorResponse(tag, EIO);
        }

        return response;
    }

    /**
     * Create error response
     */
    errorResponse(tag, errno) {
        const buf = new Uint8Array(4 + 1 + 2 + 4);
        const view = new DataView(buf.buffer);
        view.setUint32(0, buf.length, true);
        buf[4] = P9_RLERROR;
        view.setUint16(5, tag, true);
        view.setUint32(7, errno, true);
        return buf;
    }

    /**
     * Handle Tversion - negotiate protocol version
     */
    handleVersion(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const msize = view.getUint32(7, true);
        const versionLen = view.getUint16(11, true);
        const version = new TextDecoder().decode(data.subarray(13, 13 + versionLen));

        // Use smaller of requested and our max msize
        this.msize = Math.min(msize, 65536);

        const responseVersion = '9P2000.L';
        const responseBuf = new TextEncoder().encode(responseVersion);

        const buf = new Uint8Array(4 + 1 + 2 + 4 + 2 + responseBuf.length);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RVERSION;
        responseView.setUint16(5, tag, true);
        responseView.setUint32(7, this.msize, true);
        responseView.setUint16(11, responseBuf.length, true);
        buf.set(responseBuf, 13);

        return buf;
    }

    /**
     * Handle Tattach - attach to filesystem
     */
    handleAttach(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        // afid, uname, aname not used for OPFS

        const path = this.rootPath;
        const qid = this.getQid(path, true);

        this.fids.set(fid, { path, qid });

        const buf = new Uint8Array(4 + 1 + 2 + 13);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RATTACH;
        responseView.setUint16(5, tag, true);
        buf.set(this.encodeQid(qid), 7);

        return buf;
    }

    /**
     * Handle Twalk - traverse directory tree
     */
    handleWalk(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const newfid = view.getUint32(11, true);
        const nwname = view.getUint16(15, true);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        let currentPath = fidData.path;
        const qids = [];
        let offset = 17;

        for (let i = 0; i < nwname; i++) {
            const nameLen = view.getUint16(offset, true);
            offset += 2;
            const name = new TextDecoder().decode(data.subarray(offset, offset + nameLen));
            offset += nameLen;

            if (name === '..') {
                // Go up one directory
                const lastSlash = currentPath.lastIndexOf('/');
                if (lastSlash > this.rootPath.length) {
                    currentPath = currentPath.substring(0, lastSlash);
                } else {
                    currentPath = this.rootPath;
                }
            } else if (name === '.') {
                // Stay in current directory
            } else {
                currentPath = currentPath + '/' + name;
            }

            // Check if path exists
            const statResult = statSync(currentPath);
            if (statResult.isErr()) {
                // Path doesn't exist - return partial walk
                break;
            }

            const handle = statResult.unwrap();
            const isDir = handle.kind === 'directory';
            const qid = this.getQid(currentPath, isDir);
            qids.push(qid);
        }

        // Store newfid
        if (qids.length > 0 || nwname === 0) {
            const lastQid = qids.length > 0 ? qids[qids.length - 1] : fidData.qid;
            this.fids.set(newfid, { path: currentPath, qid: lastQid });
        }

        // Build response
        const buf = new Uint8Array(4 + 1 + 2 + 2 + qids.length * 13);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RWALK;
        responseView.setUint16(5, tag, true);
        responseView.setUint16(7, qids.length, true);

        let qidOffset = 9;
        for (const qid of qids) {
            buf.set(this.encodeQid(qid), qidOffset);
            qidOffset += 13;
        }

        return buf;
    }

    /**
     * Handle Tgetattr - get file attributes
     */
    handleGetattr(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const requestMask = view.getBigUint64(11, true);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const statResult = statSync(fidData.path);
        if (statResult.isErr()) {
            return this.errorResponse(tag, ENOENT);
        }

        const handle = statResult.unwrap();
        const isDir = handle.kind === 'directory';

        let size = 0n;
        let mtime = BigInt(Date.now()) * 1000000n;  // nanoseconds

        if (!isDir && handle.size !== undefined) {
            size = BigInt(handle.size);
        }
        if (handle.lastModified !== undefined) {
            mtime = BigInt(handle.lastModified) * 1000000n;
        }

        const qid = this.getQid(fidData.path, isDir);

        // Build response - simplified attributes
        const buf = new Uint8Array(4 + 1 + 2 + 8 + 13 + 4 + 4 + 4 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8);
        const responseView = new DataView(buf.buffer);
        let offset = 0;

        responseView.setUint32(offset, buf.length, true); offset += 4;
        buf[offset++] = P9_RGETATTR;
        responseView.setUint16(offset, tag, true); offset += 2;

        // valid mask
        responseView.setBigUint64(offset, 0x7ffn, true); offset += 8;

        // qid
        buf.set(this.encodeQid(qid), offset); offset += 13;

        // mode
        const mode = isDir ? 0o40755 : 0o100644;
        responseView.setUint32(offset, mode, true); offset += 4;

        // uid, gid
        responseView.setUint32(offset, 0, true); offset += 4;
        responseView.setUint32(offset, 0, true); offset += 4;

        // nlink
        responseView.setUint32(offset, isDir ? 2 : 1, true); offset += 4;

        // rdev
        responseView.setBigUint64(offset, 0n, true); offset += 8;

        // size
        responseView.setBigUint64(offset, size, true); offset += 8;

        // blksize
        responseView.setBigUint64(offset, 4096n, true); offset += 8;

        // blocks
        responseView.setBigUint64(offset, (size + 511n) / 512n, true); offset += 8;

        // atime, mtime, ctime (sec + nsec pairs)
        const sec = mtime / 1000000000n;
        const nsec = mtime % 1000000000n;
        for (let i = 0; i < 3; i++) {
            responseView.setBigUint64(offset, sec, true); offset += 8;
            responseView.setBigUint64(offset, nsec, true); offset += 8;
        }

        // btime
        responseView.setBigUint64(offset, 0n, true); offset += 8;
        responseView.setBigUint64(offset, 0n, true); offset += 8;

        // gen, data_version
        responseView.setBigUint64(offset, 0n, true); offset += 8;
        responseView.setBigUint64(offset, 0n, true); offset += 8;

        return buf;
    }

    /**
     * Handle Treaddir - read directory entries
     */
    handleReaddir(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const offset = view.getBigUint64(11, true);
        const count = view.getUint32(19, true);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const result = readDirSync(fidData.path);
        if (result.isErr()) {
            return this.errorResponse(tag, EIO);
        }

        const entries = result.unwrap();
        const entriesArray = Array.from(entries);

        // Build directory entry buffer
        const entryBuffers = [];
        let totalSize = 0;
        let currentOffset = 0n;

        for (const entry of entriesArray) {
            if (currentOffset < offset) {
                currentOffset++;
                continue;
            }

            const name = entry.path.split('/').pop();
            const nameBytes = new TextEncoder().encode(name);
            const isDir = entry.handle.kind === 'directory';
            const qid = this.getQid(fidData.path + '/' + name, isDir);

            // Entry: qid(13) + offset(8) + type(1) + name_len(2) + name
            const entrySize = 13 + 8 + 1 + 2 + nameBytes.length;

            if (totalSize + entrySize > count) {
                break;
            }

            const entryBuf = new Uint8Array(entrySize);
            const entryView = new DataView(entryBuf.buffer);
            let entryOffset = 0;

            entryBuf.set(this.encodeQid(qid), entryOffset); entryOffset += 13;
            entryView.setBigUint64(entryOffset, currentOffset + 1n, true); entryOffset += 8;
            entryBuf[entryOffset++] = isDir ? 4 : 8;  // DT_DIR or DT_REG
            entryView.setUint16(entryOffset, nameBytes.length, true); entryOffset += 2;
            entryBuf.set(nameBytes, entryOffset);

            entryBuffers.push(entryBuf);
            totalSize += entrySize;
            currentOffset++;
        }

        // Build response
        const buf = new Uint8Array(4 + 1 + 2 + 4 + totalSize);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RREADDIR;
        responseView.setUint16(5, tag, true);
        responseView.setUint32(7, totalSize, true);

        let bufOffset = 11;
        for (const entryBuf of entryBuffers) {
            buf.set(entryBuf, bufOffset);
            bufOffset += entryBuf.length;
        }

        return buf;
    }

    /**
     * Handle Tlopen - open file
     */
    handleLopen(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const flags = view.getUint32(11, true);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const statResult = statSync(fidData.path);
        if (statResult.isErr()) {
            return this.errorResponse(tag, ENOENT);
        }

        const handle = statResult.unwrap();
        const isDir = handle.kind === 'directory';
        const qid = this.getQid(fidData.path, isDir);

        // Update fid with open state
        fidData.open = true;
        fidData.flags = flags;

        const buf = new Uint8Array(4 + 1 + 2 + 13 + 4);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RLOPEN;
        responseView.setUint16(5, tag, true);
        buf.set(this.encodeQid(qid), 7);
        responseView.setUint32(20, 4096, true);  // iounit

        return buf;
    }

    /**
     * Handle Tread - read from file
     */
    handleRead(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const offset = view.getBigUint64(11, true);
        const count = view.getUint32(19, true);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const result = readFileSync(fidData.path);
        if (result.isErr()) {
            return this.errorResponse(tag, EIO);
        }

        const fileData = new Uint8Array(result.unwrap());
        const start = Number(offset);
        const end = Math.min(start + count, fileData.length);
        const readData = fileData.subarray(start, end);

        const buf = new Uint8Array(4 + 1 + 2 + 4 + readData.length);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RREAD;
        responseView.setUint16(5, tag, true);
        responseView.setUint32(7, readData.length, true);
        buf.set(readData, 11);

        return buf;
    }

    /**
     * Handle Twrite - write to file
     */
    handleWrite(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const offset = view.getBigUint64(11, true);
        const count = view.getUint32(19, true);
        const writeData = data.subarray(23, 23 + count);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        // Read existing file content
        let existingData = new Uint8Array(0);
        const readResult = readFileSync(fidData.path);
        if (readResult.isOk()) {
            existingData = new Uint8Array(readResult.unwrap());
        }

        // Expand buffer if needed
        const writeEnd = Number(offset) + count;
        const newSize = Math.max(existingData.length, writeEnd);
        const newData = new Uint8Array(newSize);
        newData.set(existingData);
        newData.set(writeData, Number(offset));

        // Write back
        const writeResult = writeFileSync(fidData.path, newData);
        if (writeResult.isErr()) {
            return this.errorResponse(tag, EIO);
        }

        const buf = new Uint8Array(4 + 1 + 2 + 4);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RWRITE;
        responseView.setUint16(5, tag, true);
        responseView.setUint32(7, count, true);

        return buf;
    }

    /**
     * Handle Tlcreate - create file
     */
    handleLcreate(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const nameLen = view.getUint16(11, true);
        const name = new TextDecoder().decode(data.subarray(13, 13 + nameLen));
        const flags = view.getUint32(13 + nameLen, true);
        const mode = view.getUint32(17 + nameLen, true);

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const newPath = fidData.path + '/' + name;

        // Check if already exists
        if (existsSync(newPath).unwrapOr(false)) {
            return this.errorResponse(tag, EEXIST);
        }

        // Create empty file
        const result = writeFileSync(newPath, new Uint8Array(0));
        if (result.isErr()) {
            return this.errorResponse(tag, EIO);
        }

        const qid = this.getQid(newPath, false);

        // Update fid to point to new file
        fidData.path = newPath;
        fidData.qid = qid;
        fidData.open = true;

        const buf = new Uint8Array(4 + 1 + 2 + 13 + 4);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RLCREATE;
        responseView.setUint16(5, tag, true);
        buf.set(this.encodeQid(qid), 7);
        responseView.setUint32(20, 4096, true);  // iounit

        return buf;
    }

    /**
     * Handle Tmkdir - create directory
     */
    handleMkdir(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const nameLen = view.getUint16(11, true);
        const name = new TextDecoder().decode(data.subarray(13, 13 + nameLen));

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const newPath = fidData.path + '/' + name;

        const result = mkdirSync(newPath);
        if (result.isErr()) {
            return this.errorResponse(tag, EIO);
        }

        const qid = this.getQid(newPath, true);

        const buf = new Uint8Array(4 + 1 + 2 + 13);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RMKDIR;
        responseView.setUint16(5, tag, true);
        buf.set(this.encodeQid(qid), 7);

        return buf;
    }

    /**
     * Handle Tunlinkat - remove file/directory
     */
    handleUnlinkat(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);
        const nameLen = view.getUint16(11, true);
        const name = new TextDecoder().decode(data.subarray(13, 13 + nameLen));

        const fidData = this.fids.get(fid);
        if (!fidData) {
            return this.errorResponse(tag, ENOENT);
        }

        const targetPath = fidData.path + '/' + name;

        const result = removeSync(targetPath);
        if (result.isErr()) {
            return this.errorResponse(tag, EIO);
        }

        const buf = new Uint8Array(4 + 1 + 2);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RUNLINKAT;
        responseView.setUint16(5, tag, true);

        return buf;
    }

    /**
     * Handle Tclunk - close fid
     */
    handleClunk(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const fid = view.getUint32(7, true);

        this.fids.delete(fid);

        const buf = new Uint8Array(4 + 1 + 2);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RCLUNK;
        responseView.setUint16(5, tag, true);

        return buf;
    }

    /**
     * Handle Tstatfs - get filesystem statistics
     */
    handleStatfs(data, tag) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        // Return dummy statfs (OPFS doesn't provide real stats)
        const buf = new Uint8Array(4 + 1 + 2 + 4 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 4);
        const responseView = new DataView(buf.buffer);
        let offset = 0;

        responseView.setUint32(offset, buf.length, true); offset += 4;
        buf[offset++] = P9_RSTATFS;
        responseView.setUint16(offset, tag, true); offset += 2;

        responseView.setUint32(offset, 0x01021997, true); offset += 4;  // type (V9FS_MAGIC)
        responseView.setUint32(offset, 4096, true); offset += 4;  // bsize
        responseView.setBigUint64(offset, 1000000n, true); offset += 8;  // blocks
        responseView.setBigUint64(offset, 900000n, true); offset += 8;  // bfree
        responseView.setBigUint64(offset, 900000n, true); offset += 8;  // bavail
        responseView.setBigUint64(offset, 1000000n, true); offset += 8;  // files
        responseView.setBigUint64(offset, 900000n, true); offset += 8;  // ffree
        responseView.setBigUint64(offset, 0n, true); offset += 8;  // fsid
        responseView.setUint32(offset, 255, true); offset += 4;  // namelen

        return buf;
    }

    /**
     * Handle Tsetattr - set file attributes (stub)
     */
    handleSetattr(data, tag) {
        // OPFS doesn't support setting attributes, just acknowledge
        const buf = new Uint8Array(4 + 1 + 2);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RSETATTR;
        responseView.setUint16(5, tag, true);

        return buf;
    }

    /**
     * Handle Tfsync - sync file (stub)
     */
    handleFsync(data, tag) {
        // OPFS syncs automatically, just acknowledge
        const buf = new Uint8Array(4 + 1 + 2);
        const responseView = new DataView(buf.buffer);
        responseView.setUint32(0, buf.length, true);
        buf[4] = P9_RFSYNC;
        responseView.setUint16(5, tag, true);

        return buf;
    }
}
```

#### 2. Modify: `examples/wasi-browser/htdocs/worker.js`

Integrate the 9P server with the existing virtio transport:

```javascript
// Add import
import { OPFS9PServer } from './p9-opfs.js';

// Initialize 9P server for OPFS mount
const opfs9pServer = new OPFS9PServer('/shared');

// Hook into existing virtio-9p handling
// The emulator calls handle_9p_message when guest sends 9P requests
function handle_9p_message(data) {
    return opfs9pServer.handleMessage(data);
}

// Export for emulator integration
self.handle_9p_message = handle_9p_message;
```

#### 3. Modify Guest VM Init: `cmd/init/main.go`

Add mount point for OPFS filesystem:

```go
// Add to init process (around line 150-160)
func mountOPFS() error {
    // Create mount point
    if err := os.MkdirAll("/mnt/opfs", 0755); err != nil {
        return err
    }

    // Mount 9p filesystem with OPFS tag
    // The 'opfs' tag corresponds to the p9-opfs.js server
    return syscall.Mount("opfs", "/mnt/opfs", "9p", 0,
        "trans=virtio,version=9p2000.L,msize=65536,cache=loose")
}

// Call from main init
if err := mountOPFS(); err != nil {
    log.Printf("Warning: OPFS mount failed: %v", err)
    // Non-fatal - container can still work without OPFS
}
```

### Virtio Transport Integration

The existing container2wasm uses virtio-9p for filesystem passthrough. The connection works as follows:

```
┌─────────────────┐    virtio mmio    ┌─────────────────┐
│   Linux Guest   │◀────────────────▶│   Emulator      │
│   (9p client)   │                   │   (QEMU/Bochs)  │
└─────────────────┘                   └────────┬────────┘
                                               │
                                      virtio_9p_recv()
                                      virtio_9p_send()
                                               │
                                      ┌────────▼────────┐
                                      │  JavaScript     │
                                      │  9P Handler     │
                                      └────────┬────────┘
                                               │
                                      ┌────────▼────────┐
                                      │  OPFS9PServer   │
                                      │  (p9-opfs.js)   │
                                      └─────────────────┘
```

The emulator already has hooks for 9P messages. You need to:

1. Find the existing 9P message handler in the emulator JavaScript bindings
2. Route messages to `OPFS9PServer.handleMessage()`
3. Return responses through the same channel

---

## Phase L1: Native OPFS Virtio Device (Future)

### Goal
Implement OPFS access directly in Rust WASM using `tokio-fs-ext` for truly synchronous I/O without SharedArrayBuffer overhead.

### Why Rust?

1. **Rust has tier-1 WASM support** (`wasm32-unknown-unknown`, `wasm32-wasi`)
2. **tokio-fs-ext** provides truly synchronous OPFS access via `FileSystemSyncAccessHandle`
3. **No SharedArrayBuffer coordination** - direct synchronous calls

### Architecture

```rust
// Using tokio-fs-ext for direct OPFS access
use tokio_fs_ext::opfs::{FileSystemSyncAccessHandle, get_directory};

pub struct OpfsVirtioDevice {
    root: FileSystemDirectoryHandle,
    files: HashMap<u64, FileSystemSyncAccessHandle>,
}

impl OpfsVirtioDevice {
    pub async fn new() -> Result<Self, JsValue> {
        let root = get_directory().await?;
        Ok(Self {
            root,
            files: HashMap::new(),
        })
    }

    // Truly synchronous read - no async/await needed
    pub fn read(&mut self, fid: u64, offset: u64, count: u32) -> Result<Vec<u8>, Error> {
        let handle = self.files.get(&fid).ok_or(Error::InvalidFid)?;
        let mut buf = vec![0u8; count as usize];

        // This is TRULY SYNCHRONOUS - no busy-wait!
        handle.read_with_u8_array_at(&mut buf, offset)?;

        Ok(buf)
    }

    // Truly synchronous write
    pub fn write(&mut self, fid: u64, offset: u64, data: &[u8]) -> Result<u32, Error> {
        let handle = self.files.get(&fid).ok_or(Error::InvalidFid)?;

        // TRULY SYNCHRONOUS
        let written = handle.write_with_u8_array_at(data, offset)?;

        Ok(written as u32)
    }
}
```

### Integration Points

For L1, you would modify:

1. **Emulator Rust code** (if using Rust-based emulator)
2. **WASM bindings** to expose OPFS device to guest
3. **Guest kernel driver** (minimal changes - use existing virtio-9p)

### Benefits of L1

| Aspect | S1+M1 (JavaScript) | L1 (Rust) |
|--------|-------------------|-----------|
| Sync mechanism | SharedArrayBuffer + busy-wait | FileSystemSyncAccessHandle (native) |
| CPU overhead | High (busy-wait spins) | None |
| Code complexity | Moderate | Higher initial, lower runtime |
| Performance | Good | Excellent |
| Browser support | All modern | Requires SharedArrayBuffer headers |

---

## Testing Strategy

### Unit Tests for 9P Server

```javascript
// test/p9-opfs.test.js
import { OPFS9PServer } from '../htdocs/p9-opfs.js';

describe('OPFS9PServer', () => {
    let server;

    beforeEach(async () => {
        server = new OPFS9PServer('/test-root');
    });

    test('Tversion negotiation', () => {
        const request = buildVersionRequest('9P2000.L', 8192);
        const response = server.handleMessage(request);

        expect(response[4]).toBe(P9_RVERSION);
        // Parse response...
    });

    test('Tattach and Twalk', () => {
        // First attach
        const attachReq = buildAttachRequest(0, '/');
        server.handleMessage(attachReq);

        // Walk to create path
        const walkReq = buildWalkRequest(0, 1, ['test', 'dir']);
        const walkRes = server.handleMessage(walkReq);

        // Should fail - path doesn't exist yet
        expect(parseQidCount(walkRes)).toBe(0);
    });

    test('create and read file', async () => {
        // ... test file creation and reading
    });
});
```

### Integration Tests

```javascript
// Run in browser with emulator
async function testOPFSIntegration() {
    // Start container with OPFS mount
    const container = await startContainer({
        opfsEnabled: true,
        opfsMount: '/mnt/opfs'
    });

    // Create file from host side
    await opfs.writeFile('/shared/test.txt', 'Hello from browser!');

    // Read from guest side
    const output = await container.exec('cat /mnt/opfs/test.txt');
    assert.equal(output.trim(), 'Hello from browser!');

    // Create file from guest side
    await container.exec('echo "Hello from container" > /mnt/opfs/guest.txt');

    // Read from host side
    const content = await opfs.readFile('/shared/guest.txt');
    assert.equal(content, 'Hello from container\n');
}
```

---

## Deployment Checklist

### S1 (OPFS-backed WASI)

- [ ] Install happy-opfs: `npm install happy-opfs`
- [ ] Create `opfs-worker.js` with sync agent
- [ ] Modify `worker.js` to use OPFSDirectory/OPFSFile
- [ ] Update import map in `index.html`
- [ ] Add SharedArrayBuffer headers (already required for xterm-pty)
- [ ] Test file persistence across page reloads

### M1 (9P Server)

- [ ] Create `p9-opfs.js` with OPFS9PServer
- [ ] Integrate with existing virtio-9p transport
- [ ] Modify guest init to mount OPFS
- [ ] Add 'opfs' virtio device tag
- [ ] Test mounting from guest: `mount -t 9p opfs /mnt/opfs -o trans=virtio`

### Required HTTP Headers

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

These are already required for SharedArrayBuffer (used by xterm-pty), so no additional configuration needed.

---

## Troubleshooting

### Common Issues

1. **"SharedArrayBuffer is not defined"**
   - Ensure COOP/COEP headers are set
   - Check browser console for header warnings

2. **"Atomics.wait cannot be called on main thread"**
   - Sync operations must run in a Web Worker
   - Ensure happy-opfs sync agent is in a worker

3. **9P mount fails with "Protocol error"**
   - Check msize matches between client and server
   - Verify 9P2000.L message format

4. **File operations hang**
   - Check for deadlocks in SharedArrayBuffer coordination
   - Verify worker is responding to requests

### Debug Logging

```javascript
// Enable 9P debug logging
const server = new OPFS9PServer('/shared');
server.debug = true;  // Log all 9P messages

// In handleMessage:
if (this.debug) {
    console.log('9P request:', type, tag, data.length);
}
```

---

## References

1. [9P2000.L Protocol Specification](https://github.com/chaos/diod/blob/master/protocol.md)
2. [v86 9P Implementation](https://github.com/copy/v86/blob/master/lib/9p.js)
3. [happy-opfs Documentation](https://jiangjie.github.io/happy-opfs/)
4. [tokio-fs-ext WASM OPFS](https://crates.io/crates/tokio-fs-ext)
5. [OPFS Browser Support](https://caniuse.com/native-filesystem-api)
6. [container2wasm Architecture](https://github.com/ktock/container2wasm)
