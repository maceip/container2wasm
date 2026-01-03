# VM/WASM Snapshot Implementation Report

## Executive Summary

This report outlines four implementation tiers (S, M, L, XL) for enabling runtime snapshots of container2wasm VMs in the browser, with potential eStargz format integration for lazy loading.

### Current State

| Mechanism | When | How | Limitation |
|-----------|------|-----|------------|
| **Wizer** | Build-time | Snapshots WASM linear memory after init | Cannot snapshot at runtime |
| **QEMU migrate** | Build-time | `migrate file:vm.state` via monitor | Not exposed to browser JS |
| **Runtime** | N/A | Not implemented | **Gap to fill** |

### What Gets Snapshotted

```
┌─────────────────────────────────────────────────────────────┐
│                    VM Snapshot Components                   │
├─────────────────────────────────────────────────────────────┤
│  CPU State          │  ~1 KB    │  Registers, flags, IP     │
│  RAM                │  256MB+   │  Guest physical memory    │
│  Device State       │  ~100 KB  │  Virtio, PCI, timers      │
│  Disk Dirty Blocks  │  Variable │  Modified sectors         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Total: 256MB - 1GB+
```

---

## eStargz Format Applicability

[eStargz](https://github.com/containerd/stargz-snapshotter/blob/main/docs/estargz.md) is designed for container image layers (filesystem content), but its core principles can apply to VM snapshots:

### eStargz Principles

| Principle | Container Images | VM Snapshots |
|-----------|-----------------|--------------|
| **Chunking** | Files/4MB blocks | Memory pages (4KB/2MB) |
| **TOC (Table of Contents)** | File metadata + offsets | Page table + offsets |
| **Separate compression** | Each chunk gzipped independently | Each page/region compressed |
| **Lazy loading** | Fetch files on filesystem access | Fetch pages on memory access |
| **Verification** | SHA256 per chunk | SHA256 per page |

### Proposed: VM-Stargz Format

```
┌─────────────────────────────────────────────────────────────┐
│                    vm-snapshot.vmsgz                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Chunk 0: CPU State (gzip)                          │   │
│  │  Chunk 1: Device State (gzip)                       │   │
│  │  Chunk 2: RAM Page 0x00000000-0x00000FFF (gzip)     │   │
│  │  Chunk 3: RAM Page 0x00001000-0x00001FFF (gzip)     │   │
│  │  ...                                                 │   │
│  │  Chunk N: RAM Page 0xXXXXX000-0xXXXXXFFF (gzip)     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TOC (stargz.index.json) - last entry               │   │
│  │  {                                                   │   │
│  │    "version": 1,                                     │   │
│  │    "cpu": { "offset": 0, "size": 1024 },            │   │
│  │    "devices": { "offset": 1024, "size": 102400 },   │   │
│  │    "pages": [                                        │   │
│  │      { "addr": "0x0", "offset": 103424, "size": 4096, "hash": "sha256:..." },
│  │      { "addr": "0x1000", "offset": 107520, "size": 4096, "hash": "sha256:..." },
│  │      ...                                             │   │
│  │    ]                                                 │   │
│  │  }                                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Footer (51 bytes) - TOC offset                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Project S: Basic WASM Memory Snapshot

### Goal
Export/import raw WASM linear memory to OPFS for basic persistence.

### Complexity
- **Effort**: 1-2 weeks
- **Lines of code**: ~300
- **Dependencies**: happy-opfs (from OPFS guide)

### What It Does
- Captures entire WASM memory buffer
- Saves to OPFS as single file
- Restores by copying back to memory
- No lazy loading, no compression

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Worker                          │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Emulator   │                                            │
│  │   WASM      │                                            │
│  │  Instance   │                                            │
│  └──────┬──────┘                                            │
│         │                                                   │
│    wasmInstance.exports.memory.buffer                       │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  new Uint8Array(memory.buffer)  // 256MB+            │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  opfs.writeFile('/snapshots/vm.bin', memoryData)     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

#### 1. Add to `worker.js`:

```javascript
import { writeFileSync, readFileSync, mkdirSync } from 'happy-opfs';

// Ensure snapshot directory exists
mkdirSync('/snapshots');

// Take snapshot
function takeSnapshot() {
    const memory = wasmInstance.exports.memory;
    const memoryData = new Uint8Array(memory.buffer);

    // Also need to capture CPU/device state from emulator
    const cpuState = emulator.getCPUState?.() || new Uint8Array(0);

    // Simple format: [cpuStateLen(4)] [cpuState] [memory]
    const snapshot = new Uint8Array(4 + cpuState.length + memoryData.length);
    const view = new DataView(snapshot.buffer);
    view.setUint32(0, cpuState.length, true);
    snapshot.set(cpuState, 4);
    snapshot.set(memoryData, 4 + cpuState.length);

    const result = writeFileSync('/snapshots/vm.bin', snapshot);
    if (result.isErr()) {
        console.error('Snapshot failed:', result.error);
        return false;
    }

    console.log(`Snapshot saved: ${snapshot.length} bytes`);
    return true;
}

// Restore snapshot
function restoreSnapshot() {
    const result = readFileSync('/snapshots/vm.bin');
    if (result.isErr()) {
        console.error('No snapshot found');
        return false;
    }

    const snapshot = new Uint8Array(result.unwrap());
    const view = new DataView(snapshot.buffer);
    const cpuStateLen = view.getUint32(0, true);

    const cpuState = snapshot.subarray(4, 4 + cpuStateLen);
    const memoryData = snapshot.subarray(4 + cpuStateLen);

    // Restore CPU state if emulator supports it
    if (emulator.setCPUState) {
        emulator.setCPUState(cpuState);
    }

    // Restore memory
    const memory = wasmInstance.exports.memory;
    const memoryView = new Uint8Array(memory.buffer);
    memoryView.set(memoryData);

    console.log(`Snapshot restored: ${snapshot.length} bytes`);
    return true;
}

// Expose to main thread
self.takeSnapshot = takeSnapshot;
self.restoreSnapshot = restoreSnapshot;
```

#### 2. Add UI controls in `index.html`:

```html
<button id="snapshot-btn">Take Snapshot</button>
<button id="restore-btn">Restore Snapshot</button>

<script>
document.getElementById('snapshot-btn').onclick = () => {
    worker.postMessage({ type: 'snapshot' });
};
document.getElementById('restore-btn').onclick = () => {
    worker.postMessage({ type: 'restore' });
};
</script>
```

### Limitations

| Limitation | Impact |
|------------|--------|
| No compression | 256MB+ snapshot files |
| Full restore only | Must load entire snapshot before resume |
| No verification | Corrupt snapshots not detected |
| Single snapshot | Can't maintain multiple checkpoints |

### When to Use
- Quick proof-of-concept
- Small VM memory (<64MB)
- Infrequent snapshots (manual user action)

---

## Project M: Chunked Snapshots with TOC

### Goal
Implement chunked snapshots with lazy restore, reducing time-to-interactive.

### Complexity
- **Effort**: 3-4 weeks
- **Lines of code**: ~1,500
- **Dependencies**: happy-opfs, pako (gzip)

### What It Does
- Chunks memory into 4KB-4MB pages
- Compresses each chunk independently
- Creates TOC with chunk metadata
- Lazy restore: loads pages on-demand via page fault simulation

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Snapshot Flow                          │
│                                                             │
│  Memory                  Chunker               Storage      │
│  ┌─────┐               ┌─────────┐           ┌─────────┐   │
│  │Page0│──┐            │         │           │chunk0.gz│   │
│  │Page1│──┼──────────▶│ Compress │─────────▶│chunk1.gz│   │
│  │Page2│──┤            │ + Hash  │           │chunk2.gz│   │
│  │ ... │──┘            │         │           │   ...   │   │
│  └─────┘               └────┬────┘           │ toc.json│   │
│                             │                └─────────┘   │
│                             ▼                     │        │
│                    ┌─────────────┐                │        │
│                    │    TOC      │◀───────────────┘        │
│                    │ (metadata)  │                         │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Restore Flow                           │
│                                                             │
│  1. Load TOC only (fast)                                    │
│  2. Resume VM execution                                     │
│  3. On page fault → fetch chunk from OPFS → decompress      │
│  4. Continue execution                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

#### 1. Snapshot Manager (`snapshot-manager.js`):

```javascript
import pako from 'pako';
import { writeFileSync, readFileSync, mkdirSync, readDirSync } from 'happy-opfs';

const CHUNK_SIZE = 4 * 1024 * 1024;  // 4MB chunks (like eStargz default)
const PAGE_SIZE = 4096;  // 4KB for page-level tracking

export class SnapshotManager {
    constructor(snapshotDir = '/snapshots') {
        this.snapshotDir = snapshotDir;
        this.loadedPages = new Set();
        this.toc = null;
        mkdirSync(snapshotDir);
    }

    /**
     * Take a snapshot of VM state
     */
    async takeSnapshot(name, emulator) {
        const snapshotPath = `${this.snapshotDir}/${name}`;
        mkdirSync(snapshotPath);

        const memory = emulator.wasmInstance.exports.memory;
        const memoryData = new Uint8Array(memory.buffer);

        // Get CPU and device state
        const cpuState = this.serializeCPUState(emulator);
        const deviceState = this.serializeDeviceState(emulator);

        // Build TOC
        const toc = {
            version: 1,
            created: Date.now(),
            memorySize: memoryData.length,
            chunkSize: CHUNK_SIZE,
            cpu: null,
            devices: null,
            chunks: []
        };

        // Save CPU state
        const cpuCompressed = pako.gzip(cpuState);
        writeFileSync(`${snapshotPath}/cpu.gz`, cpuCompressed);
        toc.cpu = {
            size: cpuState.length,
            compressedSize: cpuCompressed.length,
            hash: await this.sha256(cpuState)
        };

        // Save device state
        const deviceCompressed = pako.gzip(deviceState);
        writeFileSync(`${snapshotPath}/devices.gz`, deviceCompressed);
        toc.devices = {
            size: deviceState.length,
            compressedSize: deviceCompressed.length,
            hash: await this.sha256(deviceState)
        };

        // Chunk and save memory
        let chunkIndex = 0;
        for (let offset = 0; offset < memoryData.length; offset += CHUNK_SIZE) {
            const chunk = memoryData.subarray(offset, Math.min(offset + CHUNK_SIZE, memoryData.length));

            // Skip zero-filled chunks (common in sparse memory)
            if (this.isZeroFilled(chunk)) {
                toc.chunks.push({
                    index: chunkIndex,
                    offset: offset,
                    size: chunk.length,
                    compressedSize: 0,
                    zero: true
                });
            } else {
                const compressed = pako.gzip(chunk);
                const hash = await this.sha256(chunk);

                writeFileSync(`${snapshotPath}/chunk_${chunkIndex}.gz`, compressed);

                toc.chunks.push({
                    index: chunkIndex,
                    offset: offset,
                    size: chunk.length,
                    compressedSize: compressed.length,
                    hash: hash,
                    zero: false
                });
            }

            chunkIndex++;

            // Progress callback
            if (chunkIndex % 10 === 0) {
                console.log(`Snapshot progress: ${Math.round(offset / memoryData.length * 100)}%`);
            }
        }

        // Save TOC
        const tocJson = JSON.stringify(toc, null, 2);
        writeFileSync(`${snapshotPath}/toc.json`, new TextEncoder().encode(tocJson));

        console.log(`Snapshot '${name}' complete: ${toc.chunks.length} chunks`);
        return toc;
    }

    /**
     * Restore snapshot with lazy loading
     */
    async restoreSnapshot(name, emulator, options = {}) {
        const snapshotPath = `${this.snapshotDir}/${name}`;
        const lazy = options.lazy !== false;  // Default to lazy loading

        // Load TOC
        const tocResult = readFileSync(`${snapshotPath}/toc.json`);
        if (tocResult.isErr()) {
            throw new Error(`Snapshot '${name}' not found`);
        }
        this.toc = JSON.parse(new TextDecoder().decode(tocResult.unwrap()));

        // Restore CPU state (always immediate)
        const cpuResult = readFileSync(`${snapshotPath}/cpu.gz`);
        if (cpuResult.isOk()) {
            const cpuState = pako.ungzip(new Uint8Array(cpuResult.unwrap()));
            this.deserializeCPUState(emulator, cpuState);
        }

        // Restore device state (always immediate)
        const deviceResult = readFileSync(`${snapshotPath}/devices.gz`);
        if (deviceResult.isOk()) {
            const deviceState = pako.ungzip(new Uint8Array(deviceResult.unwrap()));
            this.deserializeDeviceState(emulator, deviceState);
        }

        if (lazy) {
            // Set up lazy page fault handler
            this.setupLazyRestore(snapshotPath, emulator);
            console.log(`Snapshot '${name}' TOC loaded, memory will load on-demand`);
        } else {
            // Full restore
            await this.restoreAllChunks(snapshotPath, emulator);
            console.log(`Snapshot '${name}' fully restored`);
        }

        return this.toc;
    }

    /**
     * Set up lazy memory restore via page fault simulation
     */
    setupLazyRestore(snapshotPath, emulator) {
        const memory = emulator.wasmInstance.exports.memory;
        const memoryView = new Uint8Array(memory.buffer);

        // Zero out memory initially
        memoryView.fill(0);

        // Track which chunks are loaded
        this.loadedChunks = new Set();

        // Hook into emulator's memory access
        // This requires emulator support - see "Emulator Integration" below
        emulator.setPageFaultHandler((faultAddress) => {
            return this.handlePageFault(snapshotPath, memoryView, faultAddress);
        });
    }

    /**
     * Handle page fault by loading the required chunk
     */
    handlePageFault(snapshotPath, memoryView, faultAddress) {
        // Find which chunk contains this address
        const chunkIndex = Math.floor(faultAddress / CHUNK_SIZE);

        if (this.loadedChunks.has(chunkIndex)) {
            return true;  // Already loaded
        }

        const chunkInfo = this.toc.chunks[chunkIndex];
        if (!chunkInfo) {
            console.error(`Invalid chunk index: ${chunkIndex}`);
            return false;
        }

        if (chunkInfo.zero) {
            // Zero-filled chunk, nothing to load
            this.loadedChunks.add(chunkIndex);
            return true;
        }

        // Load and decompress chunk
        const chunkResult = readFileSync(`${snapshotPath}/chunk_${chunkIndex}.gz`);
        if (chunkResult.isErr()) {
            console.error(`Failed to load chunk ${chunkIndex}`);
            return false;
        }

        const decompressed = pako.ungzip(new Uint8Array(chunkResult.unwrap()));

        // Verify hash
        // (async verification would need to be handled differently)

        // Copy to memory
        memoryView.set(decompressed, chunkInfo.offset);

        this.loadedChunks.add(chunkIndex);
        console.log(`Loaded chunk ${chunkIndex} (${decompressed.length} bytes)`);

        return true;
    }

    /**
     * Restore all chunks (non-lazy)
     */
    async restoreAllChunks(snapshotPath, emulator) {
        const memory = emulator.wasmInstance.exports.memory;
        const memoryView = new Uint8Array(memory.buffer);

        for (const chunkInfo of this.toc.chunks) {
            if (chunkInfo.zero) {
                // Zero-fill this region
                memoryView.fill(0, chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
            } else {
                const chunkResult = readFileSync(`${snapshotPath}/chunk_${chunkInfo.index}.gz`);
                if (chunkResult.isOk()) {
                    const decompressed = pako.ungzip(new Uint8Array(chunkResult.unwrap()));
                    memoryView.set(decompressed, chunkInfo.offset);
                }
            }
        }
    }

    // Helper methods
    isZeroFilled(data) {
        for (let i = 0; i < data.length; i += 64) {
            if (data[i] !== 0) return false;
        }
        for (let i = 0; i < data.length; i++) {
            if (data[i] !== 0) return false;
        }
        return true;
    }

    async sha256(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    serializeCPUState(emulator) {
        // Emulator-specific - needs to expose CPU state
        if (emulator.getCPUState) {
            return emulator.getCPUState();
        }
        return new Uint8Array(0);
    }

    deserializeCPUState(emulator, data) {
        if (emulator.setCPUState) {
            emulator.setCPUState(data);
        }
    }

    serializeDeviceState(emulator) {
        if (emulator.getDeviceState) {
            return emulator.getDeviceState();
        }
        return new Uint8Array(0);
    }

    deserializeDeviceState(emulator, data) {
        if (emulator.setDeviceState) {
            emulator.setDeviceState(data);
        }
    }
}
```

### Emulator Integration Required

For lazy loading to work, the emulator needs to support page fault handling:

```c
// In emulator C code (TinyEMU/QEMU)
// Export function to set page fault handler

typedef int (*page_fault_handler_t)(uint64_t address);
static page_fault_handler_t js_page_fault_handler = NULL;

EMSCRIPTEN_KEEPALIVE
void set_page_fault_handler(page_fault_handler_t handler) {
    js_page_fault_handler = handler;
}

// In memory access code
static inline uint8_t* get_ram_ptr(uint64_t paddr) {
    if (!page_loaded[paddr / PAGE_SIZE]) {
        if (js_page_fault_handler) {
            js_page_fault_handler(paddr);
        }
    }
    return ram + paddr;
}
```

### Benefits Over Project S

| Aspect | Project S | Project M |
|--------|-----------|-----------|
| Snapshot size | 256MB raw | ~50-100MB compressed |
| Restore time | Load entire file | Load TOC only (~100KB) |
| Time-to-interactive | 5-10 seconds | <1 second |
| Memory pages | All at once | On-demand |

---

## Project L: eStargz-Compatible Format

### Goal
Use actual eStargz format for VM snapshots, enabling tooling reuse and registry storage.

### Complexity
- **Effort**: 6-8 weeks
- **Lines of code**: ~4,000
- **Dependencies**: estargz-js (new), pako, happy-opfs

### What It Does
- Produces actual eStargz-formatted archives
- Can be stored in OCI registries alongside container images
- Reuses containerd/stargz-snapshotter tooling for verification
- Supports prefetch lists (predict which pages needed first)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    eStargz VM Snapshot                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  vm-snapshot.esgz (OCI-compatible layer)            │   │
│  │                                                      │   │
│  │  ├── cpu.state.tar (gzip member)                    │   │
│  │  ├── devices.state.tar (gzip member)                │   │
│  │  ├── memory/                                         │   │
│  │  │   ├── 0x00000000.page (gzip member)              │   │
│  │  │   ├── 0x00001000.page (gzip member)              │   │
│  │  │   └── ...                                         │   │
│  │  └── stargz.index.json (TOC - last entry)           │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Annotations:                                               │
│  - containerd.io/snapshot/stargz/toc.digest: sha256:...    │
│  - io.container2wasm.snapshot/type: vm-state               │
│  - io.container2wasm.snapshot/arch: x86_64                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### TOC Format (stargz.index.json)

```json
{
  "version": 1,
  "entries": [
    {
      "name": "cpu.state",
      "type": "reg",
      "size": 1024,
      "offset": 0,
      "chunkOffset": 0,
      "chunkSize": 1024,
      "chunkDigest": "sha256:abc123..."
    },
    {
      "name": "devices.state",
      "type": "reg",
      "size": 102400,
      "offset": 1024,
      "chunkOffset": 0,
      "chunkSize": 102400,
      "chunkDigest": "sha256:def456..."
    },
    {
      "name": "memory/0x00000000.page",
      "type": "reg",
      "size": 4096,
      "offset": 103424,
      "chunkOffset": 0,
      "chunkSize": 4096,
      "chunkDigest": "sha256:789abc..."
    }
    // ... more memory pages
  ],
  "prefetch": [
    "cpu.state",
    "devices.state",
    "memory/0x00100000.page",  // Kernel entry point
    "memory/0x00101000.page"
  ]
}
```

### Registry Integration

```javascript
// Push VM snapshot to registry as OCI artifact
async function pushSnapshotToRegistry(snapshotPath, registryUrl, tag) {
    const manifest = {
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        config: {
            mediaType: "application/vnd.container2wasm.snapshot.config.v1+json",
            digest: configDigest,
            size: configSize
        },
        layers: [
            {
                mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
                digest: snapshotDigest,
                size: snapshotSize,
                annotations: {
                    "containerd.io/snapshot/stargz/toc.digest": tocDigest,
                    "io.container2wasm.snapshot/type": "vm-state"
                }
            }
        ]
    };

    // Push to registry using fetch API
    await pushBlob(registryUrl, snapshotBlob);
    await pushManifest(registryUrl, tag, manifest);
}

// Pull and lazy-load from registry
async function restoreFromRegistry(registryUrl, tag) {
    const manifest = await fetchManifest(registryUrl, tag);
    const layer = manifest.layers[0];

    // Fetch just the footer to find TOC offset
    const footer = await fetchRange(registryUrl, layer.digest, -51);
    const tocOffset = parseTocOffset(footer);

    // Fetch TOC
    const toc = await fetchRange(registryUrl, layer.digest, tocOffset);

    // Set up lazy loader that fetches pages via HTTP Range requests
    return new LazyRegistryLoader(registryUrl, layer.digest, toc);
}
```

### Benefits

| Feature | Value |
|---------|-------|
| Registry storage | Snapshots alongside images |
| HTTP Range requests | True lazy loading from CDN |
| Tooling reuse | stargz-snapshotter verification |
| Deduplication | Same pages across snapshots deduplicated |
| Prefetch optimization | Predict hot pages, pre-fetch |

---

## Project XL: Incremental Snapshots + Live Migration

### Goal
Full snapshot ecosystem with incremental saves, streaming restore, and cross-tab/cross-device migration.

### Complexity
- **Effort**: 3-6 months
- **Lines of code**: ~15,000+
- **Dependencies**: Full stack (estargz-js, WebRTC/WebSocket, OPFS, Service Worker)

### Features

#### 1. Incremental Snapshots

Only save changed pages since last snapshot:

```
Snapshot 0 (base):     [Page0] [Page1] [Page2] [Page3] ...
Snapshot 1 (delta):    [Page1'] [Page3']  (only changed pages)
Snapshot 2 (delta):    [Page0'] [Page2']
...

Restore: Apply base + deltas in order
```

```javascript
class IncrementalSnapshotManager {
    constructor() {
        this.baseSnapshot = null;
        this.deltas = [];
        this.dirtyPages = new Set();
    }

    // Track page writes
    markPageDirty(pageAddress) {
        this.dirtyPages.add(pageAddress);
    }

    // Save only dirty pages
    async saveIncremental(name) {
        const delta = {
            parent: this.baseSnapshot,
            timestamp: Date.now(),
            pages: []
        };

        for (const pageAddr of this.dirtyPages) {
            const pageData = this.getPage(pageAddr);
            delta.pages.push({
                address: pageAddr,
                data: await compress(pageData),
                hash: await sha256(pageData)
            });
        }

        this.deltas.push(delta);
        this.dirtyPages.clear();

        return delta;
    }

    // Compact: merge deltas into new base
    async compact() {
        const newBase = await this.materialize();
        this.baseSnapshot = newBase;
        this.deltas = [];
    }
}
```

#### 2. Streaming Restore

Start VM before full restore completes:

```
Time ──────────────────────────────────────────────────────▶

     │ TOC    │ CPU+Dev │ Hot Pages │ Background Pages │
     │ loaded │ restore │ prefetch  │ lazy load        │
     │        │         │           │                  │
     └────────┴─────────┴───────────┴──────────────────┘
              │         │
              │         └── VM starts executing here
              │
              └── Interactive UI ready
```

#### 3. Live Migration

Move running VM between browser tabs or devices:

```
┌─────────────────┐         WebRTC/WebSocket         ┌─────────────────┐
│   Tab A         │◀────────────────────────────────▶│   Tab B         │
│   (source)      │                                   │   (target)      │
│                 │  1. Pause VM                      │                 │
│  ┌───────────┐  │  2. Send dirty pages              │  ┌───────────┐  │
│  │    VM     │  │  3. Send CPU/device state         │  │    VM     │  │
│  └───────────┘  │  4. Resume on target              │  └───────────┘  │
│                 │                                   │                 │
└─────────────────┘                                   └─────────────────┘
```

```javascript
class LiveMigration {
    constructor(sourceEmulator) {
        this.source = sourceEmulator;
        this.dirtyPageTracker = new DirtyPageTracker(sourceEmulator);
    }

    async migrateTo(targetConnection) {
        // Phase 1: Pre-copy (send pages while VM runs)
        console.log('Starting pre-copy phase...');
        while (this.dirtyPageTracker.dirtyCount > threshold) {
            const pages = this.dirtyPageTracker.getDirtyPages();
            await targetConnection.send({ type: 'pages', data: pages });
            this.dirtyPageTracker.clear();

            // Wait for more dirty pages to accumulate
            await sleep(100);
        }

        // Phase 2: Stop-and-copy
        console.log('Stopping VM for final transfer...');
        this.source.pause();

        // Send final dirty pages + CPU state
        const finalState = {
            cpu: this.source.getCPUState(),
            devices: this.source.getDeviceState(),
            dirtyPages: this.dirtyPageTracker.getDirtyPages()
        };
        await targetConnection.send({ type: 'final', data: finalState });

        // Phase 3: Resume on target
        await targetConnection.send({ type: 'resume' });
        console.log('Migration complete');
    }
}
```

#### 4. Service Worker Caching

Use Service Worker to cache snapshots for offline:

```javascript
// service-worker.js
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/snapshots/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;

                return fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open('snapshots-v1').then((cache) => {
                        cache.put(event.request, clone);
                    });
                    return response;
                });
            })
        );
    }
});
```

### Full Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Browser Environment                            │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                         Main Thread                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │  │
│  │  │  UI/xterm   │  │  Controls   │  │  Migration WebRTC Channel  │ │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘ │  │
│  └─────────┼────────────────┼────────────────────────┼────────────────┘  │
│            │                │                        │                   │
│  ┌─────────┼────────────────┼────────────────────────┼────────────────┐  │
│  │         │           Worker Thread                 │                │  │
│  │  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────────▼──────────────┐ │  │
│  │  │  Emulator   │◀▶│  Snapshot   │◀▶│      Migration Manager      │ │  │
│  │  │   (WASM)    │  │   Manager   │  │   (incremental, streaming)  │ │  │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────────────────────┘ │  │
│  │         │                │                                         │  │
│  │         │         ┌──────▼──────┐                                  │  │
│  │         │         │  eStargz    │                                  │  │
│  │         │         │  Encoder    │                                  │  │
│  │         │         └──────┬──────┘                                  │  │
│  └─────────┼────────────────┼─────────────────────────────────────────┘  │
│            │                │                                            │
│  ┌─────────┼────────────────┼─────────────────────────────────────────┐  │
│  │         │         Service Worker                                   │  │
│  │  ┌──────▼──────────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │        Cache Manager        │  │    Registry Proxy           │ │  │
│  │  │  (offline snapshot access)  │  │  (lazy range fetching)      │ │  │
│  │  └──────┬──────────────────────┘  └──────────────┬──────────────┘ │  │
│  └─────────┼────────────────────────────────────────┼────────────────┘  │
│            │                                        │                   │
│            ▼                                        ▼                   │
│  ┌──────────────────┐                    ┌──────────────────────────┐   │
│  │       OPFS       │                    │     OCI Registry         │   │
│  │  (local storage) │                    │  (remote snapshots)      │   │
│  └──────────────────┘                    └──────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Comparison Matrix

| Feature | S | M | L | XL |
|---------|---|---|---|----|
| **Snapshot size** | Raw (256MB+) | Compressed (~100MB) | Compressed + dedupe | Incremental (KB-MB) |
| **Restore time** | 5-10s | <1s (lazy) | <1s (lazy + prefetch) | <100ms (streaming) |
| **Storage** | OPFS only | OPFS only | OPFS + Registry | OPFS + Registry + Cache |
| **Verification** | None | SHA256 per chunk | eStargz verification | Full chain verification |
| **Incremental** | No | No | Possible | Yes |
| **Live migration** | No | No | No | Yes |
| **Offline support** | Basic | Basic | Via Service Worker | Full |
| **Effort** | 1-2 weeks | 3-4 weeks | 6-8 weeks | 3-6 months |
| **Lines of code** | ~300 | ~1,500 | ~4,000 | ~15,000+ |

---

## Recommended Path

```
                    ┌─────┐
                    │  S  │  ◀── Start here (proof of concept)
                    └──┬──┘
                       │
                    ┌──▼──┐
                    │  M  │  ◀── Production MVP (lazy loading)
                    └──┬──┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
      ┌──▼──┐                     ┌──▼──┐
      │  L  │                     │ XL  │
      └─────┘                     └─────┘
   (registry)               (incremental +
                             migration)
```

1. **Start with S** - Validate that WASM memory can be captured and restored
2. **Move to M** - Add chunking and lazy restore for acceptable UX
3. **L or XL** - Choose based on needs:
   - **L** if you want registry distribution
   - **XL** if you need incremental saves or live migration

---

## References

- [Wizer - WebAssembly Pre-Initializer](https://github.com/bytecodealliance/wizer)
- [eStargz Specification](https://github.com/containerd/stargz-snapshotter/blob/main/docs/estargz.md)
- [QEMU WASM Port](https://github.com/ktock/qemu-wasm)
- [QEMU 10.1 WASM Support](https://www.phoronix.com/news/QEMU-10.1-Released)
- [KVM Forum 2025 - State of QEMU WASM](https://pretalx.com/kvm-forum-2025/talk/EVRL9V/)
- [FOSDEM 2025 - Running QEMU in Browser](https://archive.fosdem.org/2025/events/attachments/fosdem-2025-6290-running-qemu-inside-browser/slides/238760/slides_1dDtpcS.pdf)
- [container2wasm eStargz Support](https://github.com/ktock/container2wasm/tree/main/extras/imagemounter)
- [CRIU - Checkpoint/Restore](https://criu.org/)
