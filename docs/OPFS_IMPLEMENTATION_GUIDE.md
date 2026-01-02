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

### Drop-In: v86's lib/9p.js

**Instead of writing a 9P server from scratch, use v86's production-tested implementation.**

v86 ([github.com/copy/v86](https://github.com/copy/v86)) includes a complete 9P2000.L server in `lib/9p.js` (~1,200 lines). This is the same code that powers v86's filesystem passthrough for running Linux in the browser.

#### Step 1: Copy v86's 9P Files

```bash
# Clone v86 and copy the 9P implementation
git clone --depth 1 https://github.com/copy/v86.git /tmp/v86

# Copy required files
cp /tmp/v86/lib/9p.js examples/wasi-browser/htdocs/
cp /tmp/v86/lib/marshall.js examples/wasi-browser/htdocs/
cp /tmp/v86/lib/filesystem.js examples/wasi-browser/htdocs/
```

#### Step 2: Create OPFS Filesystem Backend

v86's 9p.js uses a `FS` object for filesystem operations. Create an OPFS-backed implementation:

```javascript
// opfs-fs-backend.js - OPFS backend for v86's 9p.js
import {
    connectSyncAgent,
    mkdirSync,
    readFileSync,
    writeFileSync,
    removeSync,
    statSync,
    readDirSync,
    existsSync,
    renameSync
} from 'happy-opfs';

/**
 * OPFS Filesystem Backend for v86's 9p.js
 *
 * v86's 9p.js expects a FS object with these methods.
 * This adapter translates them to happy-opfs sync operations.
 */
export class OPFSFilesystem {
    constructor(rootPath = '/p9root') {
        this.rootPath = rootPath;
        mkdirSync(rootPath);
    }

    // v86 FS interface methods - adapt to happy-opfs

    read(path, offset, length) {
        const fullPath = this.rootPath + path;
        const result = readFileSync(fullPath);
        if (result.isErr()) return null;
        const data = new Uint8Array(result.unwrap());
        return data.subarray(offset, offset + length);
    }

    write(path, offset, data) {
        const fullPath = this.rootPath + path;
        // Read existing, expand if needed, write back
        let existing = new Uint8Array(0);
        const readResult = readFileSync(fullPath);
        if (readResult.isOk()) {
            existing = new Uint8Array(readResult.unwrap());
        }
        const newSize = Math.max(existing.length, offset + data.length);
        const newData = new Uint8Array(newSize);
        newData.set(existing);
        newData.set(data, offset);
        writeFileSync(fullPath, newData);
        return data.length;
    }

    stat(path) {
        const fullPath = this.rootPath + path;
        const result = statSync(fullPath);
        if (result.isErr()) return null;
        const handle = result.unwrap();
        return {
            is_directory: handle.kind === 'directory',
            size: handle.size || 0,
            mtime: handle.lastModified || Date.now()
        };
    }

    readdir(path) {
        const fullPath = this.rootPath + path;
        const result = readDirSync(fullPath);
        if (result.isErr()) return [];
        return Array.from(result.unwrap()).map(entry => ({
            name: entry.path.split('/').pop(),
            is_directory: entry.handle.kind === 'directory'
        }));
    }

    mkdir(path) {
        const fullPath = this.rootPath + path;
        return mkdirSync(fullPath).isOk();
    }

    unlink(path) {
        const fullPath = this.rootPath + path;
        return removeSync(fullPath).isOk();
    }

    rename(oldPath, newPath) {
        const fullOld = this.rootPath + oldPath;
        const fullNew = this.rootPath + newPath;
        return renameSync(fullOld, fullNew).isOk();
    }

    exists(path) {
        const fullPath = this.rootPath + path;
        const result = existsSync(fullPath);
        return result.isOk() && result.unwrap();
    }
}
```

#### Step 3: Integrate v86's 9p.js with OPFS Backend

```javascript
// worker.js - Wire up v86's 9p.js with OPFS backend
import { Virtio9p } from './9p.js';
import { OPFSFilesystem } from './opfs-fs-backend.js';
import { connectSyncAgent } from 'happy-opfs';

// Initialize OPFS sync agent
const opfsWorkerUrl = new URL('./opfs-worker.js', import.meta.url);
await connectSyncAgent(opfsWorkerUrl);

// Create OPFS-backed filesystem
const opfsFs = new OPFSFilesystem('/shared');

// Create v86 9P server with OPFS backend
const virtio9p = new Virtio9p(opfsFs, /* bus */ emulator.bus);

// The 9P server is now ready - v86's lib/9p.js handles all protocol details
```

#### Step 4: What v86's lib/9p.js Provides (No Need to Reimplement)

v86's `lib/9p.js` already implements:

| 9P2000.L Message | Function | Status |
|-----------------|----------|--------|
| Tversion/Rversion | Protocol negotiation | ✓ Implemented |
| Tattach/Rattach | Mount filesystem | ✓ Implemented |
| Twalk/Rwalk | Traverse paths | ✓ Implemented |
| Topen/Ropen | Open files | ✓ Implemented |
| Tcreate/Rcreate | Create files | ✓ Implemented |
| Tread/Rread | Read data | ✓ Implemented |
| Twrite/Rwrite | Write data | ✓ Implemented |
| Tclunk/Rclunk | Close handles | ✓ Implemented |
| Tremove/Rremove | Delete files | ✓ Implemented |
| Tstat/Rstat | Get attributes | ✓ Implemented |
| Twstat/Rwstat | Set attributes | ✓ Implemented |
| Treaddir/Rreaddir | List directory | ✓ Implemented |
| ... | ~20 more operations | ✓ Implemented |

**You don't need to write any 9P protocol code** - just provide the filesystem backend.

### Alternative: Minimal Custom Backend

If you need a lighter-weight solution without all of v86's dependencies, here's a minimal approach. Create `p9-opfs-minimal.js`:

```javascript
// p9-opfs-minimal.js - Minimal 9P2000.L server (~200 lines vs ~1200 in v86)
// Only implements the subset needed for basic file operations

import { mkdirSync, readFileSync, writeFileSync, statSync, readDirSync, removeSync } from 'happy-opfs';

const MESSAGES = {
    Tversion: 100, Rversion: 101,
    Tattach: 104, Rattach: 105,
    Twalk: 110, Rwalk: 111,
    Topen: 112, Ropen: 113,
    Tread: 116, Rread: 117,
    Twrite: 118, Rwrite: 119,
    Tclunk: 120, Rclunk: 121,
    Tstat: 124, Rstat: 125,
    Treaddir: 40, Rreaddir: 41,
    Rlerror: 7
};

export class Minimal9PServer {
    constructor(rootPath) {
        this.root = rootPath;
        this.fids = new Map();
        mkdirSync(rootPath);
    }

    handle(msg) {
        const type = msg[4];
        const tag = (msg[6] << 8) | msg[5];

        switch(type) {
            case MESSAGES.Tversion: return this.version(tag, msg);
            case MESSAGES.Tattach: return this.attach(tag, msg);
            case MESSAGES.Twalk: return this.walk(tag, msg);
            case MESSAGES.Tread: return this.read(tag, msg);
            case MESSAGES.Twrite: return this.write(tag, msg);
            case MESSAGES.Tclunk: return this.clunk(tag, msg);
            case MESSAGES.Treaddir: return this.readdir(tag, msg);
            default: return this.error(tag, 22); // EINVAL
        }
    }

    // ... implement each method using happy-opfs
    // See v86's lib/9p.js for protocol details
}
```

### Modify Guest VM Init

Add mount point for OPFS filesystem in `cmd/init/main.go`:

```go
// Add to init process (around line 150-160)
func mountOPFS() error {
    // Create mount point
    if err := os.MkdirAll("/mnt/opfs", 0755); err != nil {
        return err
    }

    // Mount 9p filesystem with OPFS tag
    // The 'opfs' tag corresponds to the v86 9P server with OPFS backend
    return syscall.Mount("opfs", "/mnt/opfs", "9p", 0,
        "trans=virtio,version=9p2000.L,msize=65536,cache=loose")
}

// Call from main init
if err := mountOPFS(); err != nil {
    log.Printf("Warning: OPFS mount failed: %v", err)
    // Non-fatal - container can still work without OPFS
}
```

### Summary: M1 Implementation with v86 Drop-In

| Step | Action | Files |
|------|--------|-------|
| 1 | Copy v86's 9P files | `lib/9p.js`, `lib/marshall.js`, `lib/filesystem.js` |
| 2 | Create OPFS backend | `opfs-fs-backend.js` (~80 lines) |
| 3 | Wire up in worker | Modify `worker.js` (~10 lines) |
| 4 | Update guest init | Modify `cmd/init/main.go` (~15 lines) |

**Total new code: ~100 lines** (vs. ~800 lines if writing 9P from scratch)

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
