# OPFS Integration Implementation Guide for container2wasm

## Overview

This document provides detailed implementation guidance for adding Origin Private File System (OPFS) support to container2wasm. The implementation is divided into phases:

- **S1**: OPFS-backed WASI shim (browser filesystem access)
- **M1**: OPFS-backed 9P server (guest VM filesystem passthrough)
- **L1**: Native OPFS virtio device (direct guest access, **DEFERRED** - see note below)

> **📋 REVISED ARCHITECTURE (2024)**
>
> Based on analysis of drop-in components (see [XL_LITE_DESIGN.md](./XL_LITE_DESIGN.md#impact-on-opfs-s1m1l1-projects)), this guide now recommends using **ZenFS** for both S1 and M1:
>
> | Phase | Original Approach | Revised Approach | LOC Reduction |
> |-------|------------------|------------------|---------------|
> | S1 | Custom happy-opfs integration | ZenFS OPFS backend | 200 → 30 (85%) |
> | M1 | Custom OPFSFilesystem adapter | ZenFS OverlayFS | 580 → 50 (91%) |
> | L1 | Rust 9P server | **DEFERRED** | 1,500 → 0 |
>
> Total: **96% code reduction** (~2,280 LOC → ~80 LOC)

## Prerequisites

### Required Reading
- [OPFS MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [FileSystemSyncAccessHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle)
- [9P2000.L Protocol](https://github.com/chaos/diod/blob/master/protocol.md)
- [container2wasm architecture](../README.md)
- [XL-Lite Design (Drop-in Components)](./XL_LITE_DESIGN.md)

### Key Dependencies (Revised)
| Package | Purpose | Source |
|---------|---------|--------|
| @zenfs/core | Overlay filesystem, Node.js fs API | https://github.com/zen-fs/core |
| @zenfs/opfs | OPFS backend for ZenFS | https://github.com/zen-fs/opfs |
| v86 lib/9p.js | 9P2000.L protocol implementation | https://github.com/copy/v86/blob/master/lib/9p.js |
| fflate | Fast compression (8KB) | https://github.com/101arrowz/fflate |

### Legacy Dependencies (No Longer Recommended)
| Package | Purpose | Status |
|---------|---------|--------|
| happy-opfs | Sync OPFS via SharedArrayBuffer | **Replaced by ZenFS** |
| tokio-fs-ext | Rust WASM OPFS (for L1) | **Deferred** |

---

## Phase S1: OPFS-Backed WASI Shim

### Goal
Replace the in-memory filesystem in `browser_wasi_shim` with OPFS, allowing WASI programs to persist files across sessions.

### Revised Approach: ZenFS

Instead of custom happy-opfs integration, use **ZenFS** with its OPFS backend:

```javascript
// worker.js - ZenFS-based OPFS integration (~30 LOC)
import { configure, fs } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';

// Initialize ZenFS with OPFS backend
async function initOPFS() {
    const opfsRoot = await navigator.storage.getDirectory();

    await configure({
        mounts: {
            '/': {
                backend: OPFS,
                handle: opfsRoot
            }
        }
    });

    // Ensure root directories exist
    await fs.promises.mkdir('/container', { recursive: true });
    await fs.promises.mkdir('/shared', { recursive: true });

    console.log('[S1] OPFS initialized with ZenFS');
}

// ZenFS provides Node.js-compatible fs API
// Use fs.readFileSync, fs.writeFileSync, etc. directly
```

### Files to Modify

#### 1. `examples/wasi-browser/htdocs/worker.js`

**Current State**: Uses `browser_wasi_shim` with `PreopenDirectory` backed by in-memory `Directory` class.

**Revised Implementation**:

```javascript
import { configure, fs } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';
import { File, Directory, PreopenDirectory, WASI } from "@aspect-build/aspect-runtime-js/snapshot";

// Initialize ZenFS with OPFS
const opfsRoot = await navigator.storage.getDirectory();
await configure({
    mounts: {
        '/': { backend: OPFS, handle: opfsRoot }
    }
});

// ZenFS-backed Directory implementation (much simpler than custom)
class ZenFSDirectory {
    constructor(basePath) {
        this.basePath = basePath;
    }

    resolvePath(name) {
        return this.basePath + '/' + name;
    }

    get_entry(name) {
        const path = this.resolvePath(name);
        try {
            const stat = fs.statSync(path);
            return stat.isDirectory()
                ? new ZenFSDirectory(path)
                : new ZenFSFile(path);
        } catch {
            return null;
        }
    }

    create_entry_for_path(name, isDir) {
        const path = this.resolvePath(name);
        if (isDir) {
            fs.mkdirSync(path, { recursive: true });
            return new ZenFSDirectory(path);
        } else {
            fs.writeFileSync(path, new Uint8Array(0));
            return new ZenFSFile(path);
        }
    }

    *entries() {
        const entries = fs.readdirSync(this.basePath, { withFileTypes: true });
        for (const entry of entries) {
            const path = this.resolvePath(entry.name);
            yield [entry.name, entry.isDirectory()
                ? new ZenFSDirectory(path)
                : new ZenFSFile(path)];
        }
    }
}

class ZenFSFile {
    constructor(path) {
        this.path = path;
        this._data = null;
        this._dirty = false;
    }

    get data() {
        if (this._data === null) {
            try {
                this._data = fs.readFileSync(this.path);
            } catch {
                this._data = new Uint8Array(0);
            }
        }
        return this._data;
    }

    set data(value) {
        this._data = value;
        this._dirty = true;
    }

    flush() {
        if (this._dirty) {
            fs.writeFileSync(this.path, this._data);
            this._dirty = false;
        }
    }
}
```

#### 2. `examples/wasi-browser/htdocs/index.html`

Add ZenFS dependencies:

```html
<!-- Add to head -->
<script type="importmap">
{
    "imports": {
        "@zenfs/core": "https://esm.sh/@zenfs/core",
        "@zenfs/opfs": "https://esm.sh/@zenfs/opfs"
    }
}
</script>
```

### Legacy Approach: happy-opfs (Not Recommended)

<details>
<summary>Click to expand legacy happy-opfs implementation</summary>

The original approach used happy-opfs with custom OPFSDirectory/OPFSFile classes (~200 LOC).
This is preserved here for reference but **ZenFS is now the recommended approach**.

```javascript
// Legacy: happy-opfs integration
import {
    connectSyncAgent,
    mkdirSync,
    readFileSync,
    writeFileSync,
    removeSync,
    statSync,
    readDirSync
} from 'happy-opfs';

// ... (see git history for full implementation)
```

</details>

### Integration with Existing SharedArrayBuffer Pattern

The existing `worker-util.js` uses SharedArrayBuffer for TTY synchronization. ZenFS is compatible with this pattern since it uses native OPFS APIs (FileSystemSyncAccessHandle) rather than SharedArrayBuffer for sync operations.

---

## Phase M1: OPFS-Backed 9P Server

### Goal
Implement a 9P2000.L server in JavaScript that serves files from OPFS, allowing the guest Linux VM to mount OPFS as a filesystem.

### Revised Architecture (with ZenFS OverlayFS)

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Worker Thread                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐  │
│  │   Guest VM  │────▶│  Virtio-9P   │────▶│  v86 9p.js   │  │
│  │   (Linux)   │◀────│  Transport   │◀────│  (drop-in)   │  │
│  └─────────────┘     └──────────────┘     └──────────────┘  │
│                                                  │          │
│                                           ┌──────▼──────┐   │
│                                           │ ZenFS       │   │
│                                           │ OverlayFS   │   │
│                                           └──────┬──────┘   │
│                                                  │          │
│                              ┌───────────────────┼──────────┤
│                              │                   │          │
│                       ┌──────▼──────┐     ┌──────▼──────┐   │
│                       │  Readable   │     │  Writable   │   │
│                       │  (eStargz)  │     │   (OPFS)    │   │
│                       └─────────────┘     └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key Insight: ZenFS Provides OverlayFS

Instead of custom COW layer implementation, use **ZenFS OverlayFS**:

```javascript
// Unified filesystem configuration (~50 LOC total)
import { configure, fs, OverlayFS, InMemory } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';

const opfsHandle = await navigator.storage.getDirectory();

await configure({
    mounts: {
        // Guest VM overlay: immutable base + mutable workspace
        '/guest': {
            backend: OverlayFS,
            readable: eStargzBaseLayer,   // Read-only base image
            writable: {
                backend: OPFS,
                handle: await opfsHandle.getDirectoryHandle('workspace', { create: true })
            }
        },

        // Emulator's own storage
        '/emulator': {
            backend: OPFS,
            handle: await opfsHandle.getDirectoryHandle('emulator', { create: true })
        }
    }
});

console.log('[M1] ZenFS OverlayFS configured');
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

#### Step 2: Create ZenFS Backend Adapter

v86's 9p.js expects a filesystem interface. ZenFS provides Node.js-compatible fs API:

```javascript
// zenfs-9p-backend.js - ZenFS backend for v86's 9p.js (~50 LOC)
import { fs } from '@zenfs/core';

/**
 * ZenFS Filesystem Backend for v86's 9p.js
 *
 * Much simpler than custom implementation since ZenFS provides
 * full Node.js fs API compatibility.
 */
export class ZenFS9PBackend {
    constructor(basePath = '/guest') {
        this.basePath = basePath;
    }

    _path(path) {
        return this.basePath + path;
    }

    read(path, offset, length) {
        try {
            const buffer = Buffer.alloc(length);
            const fd = fs.openSync(this._path(path), 'r');
            fs.readSync(fd, buffer, 0, length, offset);
            fs.closeSync(fd);
            return buffer;
        } catch {
            return null;
        }
    }

    write(path, offset, data) {
        try {
            const fd = fs.openSync(this._path(path), 'r+');
            fs.writeSync(fd, data, 0, data.length, offset);
            fs.closeSync(fd);
            return data.length;
        } catch {
            return 0;
        }
    }

    stat(path) {
        try {
            const stat = fs.statSync(this._path(path));
            return {
                is_directory: stat.isDirectory(),
                size: stat.size,
                mtime: stat.mtimeMs
            };
        } catch {
            return null;
        }
    }

    readdir(path) {
        try {
            return fs.readdirSync(this._path(path), { withFileTypes: true })
                .map(entry => ({
                    name: entry.name,
                    is_directory: entry.isDirectory()
                }));
        } catch {
            return [];
        }
    }

    mkdir(path) {
        try {
            fs.mkdirSync(this._path(path), { recursive: true });
            return true;
        } catch {
            return false;
        }
    }

    unlink(path) {
        try {
            fs.unlinkSync(this._path(path));
            return true;
        } catch {
            return false;
        }
    }

    rename(oldPath, newPath) {
        try {
            fs.renameSync(this._path(oldPath), this._path(newPath));
            return true;
        } catch {
            return false;
        }
    }

    exists(path) {
        try {
            fs.accessSync(this._path(path));
            return true;
        } catch {
            return false;
        }
    }
}
```

#### Step 3: Integrate v86's 9p.js with ZenFS

```javascript
// worker.js - Wire up v86's 9p.js with ZenFS backend
import { Virtio9p } from './9p.js';
import { ZenFS9PBackend } from './zenfs-9p-backend.js';
import { configure, fs, OverlayFS } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';

// Initialize ZenFS with OverlayFS
await configure({
    mounts: {
        '/guest': {
            backend: OverlayFS,
            readable: eStargzBaseLayer,
            writable: { backend: OPFS }
        }
    }
});

// Create ZenFS-backed filesystem for 9P
const zenFs = new ZenFS9PBackend('/guest');

// Create v86 9P server with ZenFS backend
const virtio9p = new Virtio9p(zenFs, emulator.bus);

console.log('[M1] 9P server ready with ZenFS OverlayFS');
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

### Legacy Approach: happy-opfs (Not Recommended)

<details>
<summary>Click to expand legacy OPFSFilesystem implementation</summary>

The original approach used happy-opfs with custom OPFSFilesystem class (~80 LOC).
This is preserved here for reference but **ZenFS is now the recommended approach**.

```javascript
// Legacy: happy-opfs OPFSFilesystem adapter
import { readFileSync, writeFileSync, statSync } from 'happy-opfs';

export class OPFSFilesystem {
    constructor(rootPath = '/p9root') {
        this.rootPath = rootPath;
    }
    // ... (see git history for full implementation)
}
```

</details>

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

## Phase L1: Native OPFS Virtio Device (DEFERRED)

> **⚠️ STATUS: DEFERRED**
>
> Based on the drop-in component analysis, L1 is now **deferred** until M1 + ZenFS is proven insufficient for performance requirements. The rationale:
>
> 1. **ZenFS uses native OPFS APIs** - similar performance characteristics to Rust
> 2. **M1 with ZenFS OverlayFS** may be fast enough for dev workloads
> 3. **Rust WASM adds build complexity** (wasm-pack, separate build pipeline)
> 4. **~1,500 LOC saved** by deferring this phase
>
> **Decision criteria for implementing L1:**
> - If M1 I/O latency > 100ms on typical operations
> - If heavy I/O workloads (large builds, git operations) are too slow
> - If users report performance issues with M1

### When to Reconsider L1

```
Decision tree:
1. Implement M1 with ZenFS OverlayFS
2. Benchmark: file reads/writes, npm install, git operations
3. If <100ms latency on typical ops → Keep M1, skip L1 ✓
4. If >100ms latency → Implement L1 for hot paths only
```

### Archived: Original L1 Design

<details>
<summary>Click to expand original L1 design (for future reference)</summary>

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

</details>

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

### Revised Checklist (with ZenFS Drop-ins)

#### S1 (OPFS-backed WASI)

- [ ] Install ZenFS: `npm install @zenfs/core @zenfs/opfs`
- [ ] Initialize ZenFS with OPFS backend in `worker.js`
- [ ] Create `ZenFSDirectory` and `ZenFSFile` wrapper classes
- [ ] Update import map in `index.html`
- [ ] Test file persistence across page reloads

#### M1 (9P Server with OverlayFS)

- [ ] Install ZenFS (if not already): `npm install @zenfs/core @zenfs/opfs`
- [ ] Copy v86's `lib/9p.js`, `lib/marshall.js`, `lib/filesystem.js`
- [ ] Create `zenfs-9p-backend.js` adapter (~50 LOC)
- [ ] Configure ZenFS OverlayFS mount
- [ ] Modify guest init to mount 9P filesystem
- [ ] Test mounting from guest: `mount -t 9p opfs /mnt/opfs -o trans=virtio`

#### L1 (DEFERRED)

- [ ] ~~Rust 9P server~~ - Evaluate after M1 benchmarks
- [ ] ~~tokio-fs-ext integration~~ - Only if M1 < 100ms latency requirement

### Quick Start

```bash
# 1. Install dependencies
npm install @zenfs/core @zenfs/opfs fflate

# 2. Copy v86 9P files
git clone --depth 1 https://github.com/copy/v86.git /tmp/v86
cp /tmp/v86/lib/9p.js examples/wasi-browser/htdocs/
cp /tmp/v86/lib/marshall.js examples/wasi-browser/htdocs/

# 3. Create zenfs-9p-backend.js (see M1 section above)

# 4. Update worker.js with ZenFS initialization
```

### Required HTTP Headers

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

These are already required for SharedArrayBuffer (used by xterm-pty), so no additional configuration needed.

### Legacy Checklist (Not Recommended)

<details>
<summary>Original checklist with happy-opfs</summary>

#### S1 (Legacy)
- [ ] Install happy-opfs: `npm install happy-opfs`
- [ ] Create `opfs-worker.js` with sync agent
- [ ] Modify `worker.js` to use OPFSDirectory/OPFSFile
- [ ] Update import map in `index.html`

#### M1 (Legacy)
- [ ] Create custom `OPFSFilesystem` adapter
- [ ] Implement COW layer manually

</details>

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

### Core
1. [9P2000.L Protocol Specification](https://github.com/chaos/diod/blob/master/protocol.md)
2. [v86 9P Implementation](https://github.com/copy/v86/blob/master/lib/9p.js)
3. [OPFS Browser Support](https://caniuse.com/native-filesystem-api)
4. [container2wasm Architecture](https://github.com/ktock/container2wasm)

### Drop-in Libraries (Recommended)
5. [ZenFS Core](https://github.com/zen-fs/core) - OverlayFS, Node.js fs API
6. [ZenFS OPFS Backend](https://github.com/zen-fs/opfs) - OPFS backend for ZenFS
7. [fflate Compression](https://github.com/101arrowz/fflate) - Fast gzip (8KB)
8. [modern-tar](https://github.com/nicolo-ribaudo/nicolo-ribaudo.com/tree/main/packages/modern-tar) - Zero-dep streaming tar

### Legacy (For Reference)
9. [happy-opfs Documentation](https://jiangjie.github.io/happy-opfs/) - Replaced by ZenFS
10. [tokio-fs-ext WASM OPFS](https://crates.io/crates/tokio-fs-ext) - Deferred (L1)

### Related Projects
11. [XL-Lite Design Document](./XL_LITE_DESIGN.md) - Reduced-scope snapshot architecture
12. [OPFS Integration Overview](./OPFS_INTEGRATION.md) - High-level integration guide
