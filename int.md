# OPFS Integration Guide for container2wasm

## Overview

This document describes how to integrate all three OPFS components (S1, M1, L1) into container2wasm. These components work together to provide persistent browser storage for both the emulator and guest VM.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser Tab                                     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     Emulator WASM (TinyEMU/QEMU/Bochs)                 │ │
│  │                                                                        │ │
│  │   S1: WASI Shim ──────────────────────┐                                │ │
│  │   (emulator file I/O)                 │                                │ │
│  │                                       │                                │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                      Guest Linux VM                              │  │ │
│  │  │                                                                  │  │ │
│  │  │   /mnt/opfs ◀── mount -t 9p opfs /mnt/opfs                      │  │ │
│  │  │        │                                                         │  │ │
│  │  └────────┼─────────────────────────────────────────────────────────┘  │ │
│  │           │                                                            │ │
│  │    ┌──────┴──────┐                                                     │ │
│  │    │ Virtio-9P   │                                                     │ │
│  │    │ (built-in)  │                                                     │ │
│  │    └──────┬──────┘                                                     │ │
│  │           │                                                            │ │
│  └───────────┼────────────────────────────────────────────────────────────┘ │
│              │                                                              │
│       ┌──────┴──────┐                                                       │
│       │   Choose:   │                                                       │
│       │  M1 or L1   │                                                       │
│       └──────┬──────┘                                                       │
│              │                                                              │
│    ┌─────────┴─────────┐                                                    │
│    │                   │                                                    │
│    ▼                   ▼                                                    │
│  ┌───────────────┐   ┌───────────────┐                                      │
│  │ M1: JavaScript│   │ L1: Rust WASM │                                      │
│  │ v86 9p.js +   │   │ tokio-fs-ext  │                                      │
│  │ happy-opfs    │   │ native sync   │                                      │
│  └───────┬───────┘   └───────┬───────┘                                      │
│          │                   │                                              │
│          └─────────┬─────────┘                                              │
│                    │                                                        │
│                    ▼                                                        │
│              ┌──────────┐                                                   │
│              │   OPFS   │                                                   │
│              │ Storage  │                                                   │
│              └──────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Summary

| Component | Purpose | Technology | Location |
|-----------|---------|------------|----------|
| **S1** | Emulator WASI → OPFS | happy-opfs | `examples/wasi-browser/htdocs/` |
| **M1** | Guest 9P → OPFS (JS) | v86 9p.js + happy-opfs | `examples/wasi-browser/htdocs/` |
| **L1** | Guest 9P → OPFS (Rust) | tokio-fs-ext | `extras/opfs-9p-server/` |

---

## File Structure After Integration

```
container2wasm/
├── examples/wasi-browser/htdocs/
│   ├── index.html                    # Main page (modified)
│   ├── worker.js                     # WASM worker (modified)
│   ├── opfs-worker.js                # NEW: happy-opfs sync agent
│   ├── opfs-fs-backend.js            # NEW: S1 OPFS filesystem adapter
│   ├── 9p.js                         # NEW: v86 9P server (M1)
│   ├── marshall.js                   # NEW: v86 binary marshalling (M1)
│   ├── filesystem.js                 # NEW: v86 filesystem base (M1)
│   └── opfs-9p-server/               # NEW: Rust 9P server (L1)
│       ├── opfs_9p_server.js
│       ├── opfs_9p_server_bg.wasm
│       └── package.json
│
├── extras/opfs-9p-server/            # NEW: L1 Rust source
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs
│   │   ├── p9_protocol.rs
│   │   └── opfs_backend.rs
│   └── pkg/                          # Built WASM output
│
├── cmd/init/
│   └── main.go                       # Modified: add OPFS mount
│
├── Dockerfile                        # Modified: add Rust build stage
└── Makefile                          # Modified: add opfs targets
```

---

## Integration Steps

### Step 1: Install Dependencies

```bash
# Install happy-opfs for S1/M1
cd examples/wasi-browser/htdocs
npm install happy-opfs

# Install wasm-pack for L1 (if using Rust)
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

### Step 2: Copy v86 9P Files (M1)

```bash
# Clone v86 and extract 9P implementation
git clone --depth 1 https://github.com/copy/v86.git /tmp/v86
cp /tmp/v86/lib/9p.js examples/wasi-browser/htdocs/
cp /tmp/v86/lib/marshall.js examples/wasi-browser/htdocs/
cp /tmp/v86/lib/filesystem.js examples/wasi-browser/htdocs/
rm -rf /tmp/v86
```

### Step 3: Build Rust 9P Server (L1)

```bash
cd extras/opfs-9p-server
wasm-pack build --target web --release
cp -r pkg/* ../../examples/wasi-browser/htdocs/opfs-9p-server/
```

### Step 4: Create OPFS Worker

Create `examples/wasi-browser/htdocs/opfs-worker.js`:

```javascript
// opfs-worker.js - Sync agent for happy-opfs
import { startSyncAgent } from 'happy-opfs';
startSyncAgent();
```

### Step 5: Create OPFS Filesystem Backend (S1)

Create `examples/wasi-browser/htdocs/opfs-fs-backend.js`:

```javascript
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
 * OPFS Filesystem Backend
 * Used by both S1 (WASI shim) and M1 (v86 9p.js)
 */
export class OPFSFilesystem {
    constructor(rootPath = '/') {
        this.rootPath = rootPath;
        mkdirSync(rootPath);
    }

    resolvePath(path) {
        if (path.startsWith('/')) {
            return this.rootPath + path;
        }
        return this.rootPath + '/' + path;
    }

    // File operations
    readFile(path) {
        const result = readFileSync(this.resolvePath(path));
        if (result.isErr()) return null;
        return new Uint8Array(result.unwrap());
    }

    writeFile(path, data) {
        return writeFileSync(this.resolvePath(path), data).isOk();
    }

    readPartial(path, offset, length) {
        const data = this.readFile(path);
        if (!data) return null;
        return data.subarray(offset, offset + length);
    }

    writePartial(path, offset, data) {
        let existing = this.readFile(path) || new Uint8Array(0);
        const newSize = Math.max(existing.length, offset + data.length);
        const newData = new Uint8Array(newSize);
        newData.set(existing);
        newData.set(data, offset);
        return this.writeFile(path, newData) ? data.length : -1;
    }

    // Directory operations
    mkdir(path) {
        return mkdirSync(this.resolvePath(path)).isOk();
    }

    readdir(path) {
        const result = readDirSync(this.resolvePath(path));
        if (result.isErr()) return [];
        return Array.from(result.unwrap()).map(entry => ({
            name: entry.path.split('/').pop(),
            isDirectory: entry.handle.kind === 'directory'
        }));
    }

    // Metadata operations
    stat(path) {
        const result = statSync(this.resolvePath(path));
        if (result.isErr()) return null;
        const handle = result.unwrap();
        return {
            isDirectory: handle.kind === 'directory',
            isFile: handle.kind === 'file',
            size: handle.size || 0,
            mtime: handle.lastModified || Date.now(),
            mode: handle.kind === 'directory' ? 0o755 : 0o644
        };
    }

    exists(path) {
        const result = existsSync(this.resolvePath(path));
        return result.isOk() && result.unwrap();
    }

    // Modification operations
    unlink(path) {
        return removeSync(this.resolvePath(path)).isOk();
    }

    rename(oldPath, newPath) {
        return renameSync(
            this.resolvePath(oldPath),
            this.resolvePath(newPath)
        ).isOk();
    }

    // Truncate file
    truncate(path, size) {
        const data = this.readFile(path);
        if (!data) return false;
        const newData = new Uint8Array(size);
        newData.set(data.subarray(0, Math.min(data.length, size)));
        return this.writeFile(path, newData);
    }
}

// Singleton instances for different purposes
let s1Instance = null;  // Emulator WASI
let m1Instance = null;  // Guest 9P mount

export async function initOPFS() {
    const workerUrl = new URL('./opfs-worker.js', import.meta.url);
    await connectSyncAgent(workerUrl);

    s1Instance = new OPFSFilesystem('/emulator');
    m1Instance = new OPFSFilesystem('/shared');

    // Create root directories
    s1Instance.mkdir('/');
    m1Instance.mkdir('/');

    return { s1: s1Instance, m1: m1Instance };
}

export function getS1Filesystem() { return s1Instance; }
export function getM1Filesystem() { return m1Instance; }
```

### Step 6: Modify worker.js

Update `examples/wasi-browser/htdocs/worker.js`:

```javascript
// ============================================================
// OPFS Integration - Add at top of worker.js
// ============================================================

import { initOPFS, getS1Filesystem, getM1Filesystem } from './opfs-fs-backend.js';

// Choose backend: 'M1' (JavaScript) or 'L1' (Rust)
const OPFS_BACKEND = 'M1';  // Change to 'L1' for Rust implementation

let opfs9pServer = null;

// Initialize OPFS before anything else
async function initializeOPFS() {
    console.log('[OPFS] Initializing...');

    const { s1, m1 } = await initOPFS();
    console.log('[OPFS] S1 filesystem ready at /emulator');
    console.log('[OPFS] M1/L1 filesystem ready at /shared');

    if (OPFS_BACKEND === 'L1') {
        // Use Rust WASM 9P server
        const { default: init, Opfs9PServer } = await import('./opfs-9p-server/opfs_9p_server.js');
        await init();
        opfs9pServer = await Opfs9PServer.new();
        console.log('[OPFS] L1 Rust 9P server initialized');
    } else {
        // Use JavaScript 9P server (v86)
        const { Virtio9p } = await import('./9p.js');
        opfs9pServer = new Virtio9p(m1);
        console.log('[OPFS] M1 JavaScript 9P server initialized');
    }

    return { s1, opfs9pServer };
}

// ============================================================
// S1: OPFS-backed WASI Directory
// ============================================================

class OPFSDirectory {
    constructor(fs, path = '/') {
        this.fs = fs;
        this.path = path;
    }

    get_entry(name) {
        const entryPath = this.path + '/' + name;
        const stat = this.fs.stat(entryPath);
        if (!stat) return null;

        if (stat.isDirectory) {
            return new OPFSDirectory(this.fs, entryPath);
        } else {
            return new OPFSFile(this.fs, entryPath);
        }
    }

    create_entry_for_path(name, isDir) {
        const entryPath = this.path + '/' + name;
        if (isDir) {
            this.fs.mkdir(entryPath);
            return new OPFSDirectory(this.fs, entryPath);
        } else {
            this.fs.writeFile(entryPath, new Uint8Array(0));
            return new OPFSFile(this.fs, entryPath);
        }
    }

    *entries() {
        for (const entry of this.fs.readdir(this.path)) {
            const entryPath = this.path + '/' + entry.name;
            if (entry.isDirectory) {
                yield [entry.name, new OPFSDirectory(this.fs, entryPath)];
            } else {
                yield [entry.name, new OPFSFile(this.fs, entryPath)];
            }
        }
    }
}

class OPFSFile {
    constructor(fs, path) {
        this.fs = fs;
        this.path = path;
        this._data = null;
    }

    get data() {
        if (this._data === null) {
            this._data = this.fs.readFile(this.path) || new Uint8Array(0);
        }
        return this._data;
    }

    set data(value) {
        this._data = value;
        this.fs.writeFile(this.path, value);
    }

    get size() {
        const stat = this.fs.stat(this.path);
        return stat ? stat.size : 0;
    }
}

// ============================================================
// M1/L1: 9P Message Handler
// ============================================================

function handle9PMessage(message) {
    if (!opfs9pServer) {
        console.error('[OPFS] 9P server not initialized');
        return null;
    }

    if (OPFS_BACKEND === 'L1') {
        // Rust server expects Uint8Array, returns Uint8Array
        return opfs9pServer.handle_message(new Uint8Array(message));
    } else {
        // JavaScript server (v86)
        return opfs9pServer.handle_message(message);
    }
}

// ============================================================
// Integration with Emulator
// ============================================================

// Initialize OPFS before starting emulator
const opfsReady = initializeOPFS();

// In your existing worker code, wait for OPFS before creating WASI instance:
opfsReady.then(({ s1, opfs9pServer }) => {
    // Replace the default in-memory directory with OPFS-backed directory
    const opfsRootDir = new OPFSDirectory(s1, '/');

    // Create WASI with OPFS-backed filesystem
    // Modify your existing fds array:
    /*
    let fds = [
        new OpenFile(new File([])),           // stdin
        new OpenFile(new File([])),           // stdout
        new OpenFile(new File([])),           // stderr
        new PreopenDirectory("/", opfsRootDir), // S1: OPFS-backed root
    ];
    */

    // Hook 9P handler for guest VM OPFS mount
    // This depends on your emulator's virtio-9p implementation
    self.handle9PMessage = handle9PMessage;
});

// Export for use by emulator
self.opfsReady = opfsReady;
```

### Step 7: Modify index.html

Update `examples/wasi-browser/htdocs/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>container2wasm with OPFS</title>
    <script type="importmap">
    {
        "imports": {
            "happy-opfs": "https://esm.sh/happy-opfs@latest"
        }
    }
    </script>
</head>
<body>
    <div id="terminal"></div>

    <!-- OPFS Status Indicator -->
    <div id="opfs-status" style="position: fixed; top: 10px; right: 10px; padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
        OPFS: Initializing...
    </div>

    <script type="module">
        // Wait for OPFS to be ready before starting
        const worker = new Worker('./worker.js', { type: 'module' });

        worker.addEventListener('message', (e) => {
            if (e.data.type === 'opfs-ready') {
                document.getElementById('opfs-status').textContent = 'OPFS: Ready';
                document.getElementById('opfs-status').style.background = '#4CAF50';
                document.getElementById('opfs-status').style.color = 'white';
            } else if (e.data.type === 'opfs-error') {
                document.getElementById('opfs-status').textContent = 'OPFS: Error';
                document.getElementById('opfs-status').style.background = '#f44336';
                document.getElementById('opfs-status').style.color = 'white';
            }
            // ... handle other messages
        });
    </script>
</body>
</html>
```

### Step 8: Modify Guest Init

Update `cmd/init/main.go` to mount OPFS:

```go
package main

import (
    "log"
    "os"
    "syscall"
)

const (
    opfsFSTag = "opfs"       // Tag for OPFS virtio-9p device
    opfsMountPoint = "/mnt/opfs"
)

// mountOPFS mounts the browser OPFS as a 9p filesystem
func mountOPFS() error {
    // Create mount point
    if err := os.MkdirAll(opfsMountPoint, 0755); err != nil {
        return err
    }

    // Mount 9p filesystem
    // The "opfs" tag corresponds to the JavaScript/Rust 9P server
    err := syscall.Mount(
        opfsFSTag,           // source (virtio device tag)
        opfsMountPoint,      // target mount point
        "9p",                // filesystem type
        0,                   // mount flags
        "trans=virtio,version=9p2000.L,msize=65536,cache=loose",
    )

    if err != nil {
        return err
    }

    log.Printf("OPFS mounted at %s", opfsMountPoint)
    return nil
}

func init() {
    // Mount OPFS early in boot
    // This runs after basic system setup but before container starts
    if err := mountOPFS(); err != nil {
        // Non-fatal: container can still run without OPFS
        log.Printf("Warning: OPFS mount failed: %v", err)
        log.Printf("Browser filesystem will not be available at %s", opfsMountPoint)
    }
}
```

### Step 9: Update Dockerfile

Add Rust build stage to `Dockerfile`:

```dockerfile
# ============================================================
# OPFS L1: Rust 9P Server Build Stage
# ============================================================

FROM rust:1.74.1-bullseye AS opfs-9p-build

# Install wasm-pack
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
RUN rustup target add wasm32-unknown-unknown

# Copy and build Rust 9P server
COPY extras/opfs-9p-server /build/opfs-9p-server
WORKDIR /build/opfs-9p-server
RUN wasm-pack build --target web --release

# ============================================================
# In your existing final stage, add:
# ============================================================

# Copy OPFS components to output
COPY --from=opfs-9p-build /build/opfs-9p-server/pkg /out/htdocs/opfs-9p-server/

# Copy v86 9P files (M1)
# Note: These should be vendored or downloaded during build
COPY vendor/v86/lib/9p.js /out/htdocs/
COPY vendor/v86/lib/marshall.js /out/htdocs/
COPY vendor/v86/lib/filesystem.js /out/htdocs/
```

### Step 10: Update Makefile

Add OPFS targets to `Makefile`:

```makefile
# ============================================================
# OPFS Integration Targets
# ============================================================

OPFS_9P_DIR = extras/opfs-9p-server
V86_REPO = https://github.com/copy/v86.git
HTDOCS = examples/wasi-browser/htdocs

.PHONY: opfs-deps opfs-l1 opfs-m1 opfs-all

# Install all OPFS dependencies
opfs-deps:
	cd $(HTDOCS) && npm install happy-opfs

# Build L1 (Rust 9P server)
opfs-l1:
	cd $(OPFS_9P_DIR) && wasm-pack build --target web --release
	mkdir -p $(HTDOCS)/opfs-9p-server
	cp -r $(OPFS_9P_DIR)/pkg/* $(HTDOCS)/opfs-9p-server/

# Setup M1 (v86 9P files)
opfs-m1:
	@if [ ! -d "/tmp/v86" ]; then \
		git clone --depth 1 $(V86_REPO) /tmp/v86; \
	fi
	cp /tmp/v86/lib/9p.js $(HTDOCS)/
	cp /tmp/v86/lib/marshall.js $(HTDOCS)/
	cp /tmp/v86/lib/filesystem.js $(HTDOCS)/

# Build everything
opfs-all: opfs-deps opfs-m1 opfs-l1
	@echo "OPFS integration complete"
	@echo "  S1: happy-opfs installed"
	@echo "  M1: v86 9P files copied"
	@echo "  L1: Rust 9P server built"

# Clean OPFS artifacts
opfs-clean:
	rm -rf $(HTDOCS)/opfs-9p-server
	rm -f $(HTDOCS)/9p.js $(HTDOCS)/marshall.js $(HTDOCS)/filesystem.js
	rm -rf /tmp/v86
```

---

## Configuration

### Choosing M1 vs L1

In `worker.js`, set the backend:

```javascript
// Use JavaScript (M1) - simpler, uses SharedArrayBuffer
const OPFS_BACKEND = 'M1';

// OR use Rust (L1) - faster, truly synchronous
const OPFS_BACKEND = 'L1';
```

### OPFS Directory Layout

```
OPFS Root (browser origin storage)
├── /emulator/          # S1: Emulator's own files
│   ├── /cache/         # eStargz layer cache
│   ├── /snapshots/     # VM state snapshots
│   └── /config/        # Emulator configuration
│
└── /shared/            # M1/L1: Guest VM accessible
    ├── /home/          # Persistent home directory
    ├── /data/          # Application data
    └── /tmp/           # Temporary files (cleared on close)
```

### Required HTTP Headers

Ensure your server sends these headers (required for SharedArrayBuffer):

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

---

## Runtime Behavior

### Initialization Sequence

```
1. Browser loads index.html
2. Worker starts
3. OPFS sync agent initialized (happy-opfs)
4. S1 filesystem created at /emulator
5. M1/L1 filesystem created at /shared
6. 9P server started (JavaScript or Rust)
7. Emulator WASM loaded
8. Guest Linux boots
9. Guest mounts /mnt/opfs via virtio-9p
10. Container starts with OPFS access
```

### Data Flow

**Writing a file from guest:**

```
Guest: echo "hello" > /mnt/opfs/test.txt
    │
    ▼
Linux VFS → 9p filesystem driver
    │
    ▼
Virtio-9p transport (in emulator)
    │
    ▼
JavaScript FFI call
    │
    ▼
┌─────────────────────────────────────┐
│ M1 (JavaScript)  or  L1 (Rust)      │
│                                      │
│ Parse Twrite message                 │
│ Call OPFS writeFile()               │
│ Return Rwrite response               │
└─────────────────────────────────────┘
    │
    ▼
OPFS (persistent browser storage)
```

**Reading from emulator (S1):**

```
Emulator WASI: fd_read(file_fd, ...)
    │
    ▼
browser_wasi_shim
    │
    ▼
OPFSDirectory/OPFSFile
    │
    ▼
happy-opfs readFileSync()
    │
    ▼
OPFS (persistent browser storage)
```

---

## Verification

### Test S1 (Emulator OPFS)

```javascript
// In browser console after emulator starts:
const fs = getS1Filesystem();
fs.writeFile('/test.txt', new TextEncoder().encode('S1 works!'));
console.log(new TextDecoder().decode(fs.readFile('/test.txt')));
```

### Test M1/L1 (Guest OPFS)

```bash
# Inside the guest container:
echo "Hello from container!" > /mnt/opfs/test.txt
cat /mnt/opfs/test.txt

# Verify persistence - refresh browser, boot container, then:
cat /mnt/opfs/test.txt  # Should still contain "Hello from container!"
```

### Test 9P Protocol

```bash
# Inside guest, check mount:
mount | grep opfs
# Expected: opfs on /mnt/opfs type 9p (rw,trans=virtio,version=9p2000.L,...)

# Check filesystem stats:
df -h /mnt/opfs
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "SharedArrayBuffer is not defined" | Missing COOP/COEP headers | Add required HTTP headers |
| "OPFS not available" | Browser doesn't support OPFS | Use Chrome 102+, Firefox 111+, Safari 15.2+ |
| "9P mount fails" | Virtio device not registered | Check emulator 9P device configuration |
| "Permission denied" | OPFS security restrictions | Ensure same-origin, no file:// URLs |
| L1 WASM fails to load | MIME type issue | Serve .wasm as application/wasm |

---

## Performance Comparison

| Metric | M1 (JavaScript) | L1 (Rust) |
|--------|-----------------|-----------|
| Small file read (4KB) | ~2ms | ~0.5ms |
| Large file read (1MB) | ~50ms | ~15ms |
| Directory listing (100 files) | ~10ms | ~3ms |
| CPU usage during I/O | Higher (busy-wait) | Lower (native sync) |
| Memory overhead | ~5MB | ~2MB |
| Cold start | Faster | Slower (WASM compile) |

**Recommendation**: Start with M1 for simplicity, upgrade to L1 if performance is critical.

---

## Security Considerations

1. **Origin Isolation**: OPFS is isolated per-origin. Data from one site cannot access another's OPFS.

2. **No File:// Access**: OPFS requires HTTP/HTTPS. Local file:// URLs won't work.

3. **Quota Limits**: Browsers limit OPFS storage (~10% of disk or fixed quota). Handle quota errors gracefully.

4. **Data Persistence**: OPFS data persists until explicitly deleted or browser storage is cleared.

5. **Cross-Tab Access**: Multiple tabs can access the same OPFS. Use locking if needed (happy-opfs handles this).
