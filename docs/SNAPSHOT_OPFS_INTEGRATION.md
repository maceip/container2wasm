# Snapshot Integration on OPFS

## Overview

This document describes how to integrate the VM snapshot system (S/M/L/XL) on top of the OPFS infrastructure (S1/M1/L1). Snapshots use S1 (happy-opfs) to persist VM state to the browser's Origin Private File System.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser Tab                                     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     Emulator WASM (TinyEMU/QEMU/Bochs)                 │ │
│  │                                                                        │ │
│  │   ┌────────────────────────────────────────────────────────────────┐  │ │
│  │   │                   Snapshot Manager                              │  │ │
│  │   │                                                                 │  │ │
│  │   │   save_state() ──────────────────────┐                         │  │ │
│  │   │   restore_state() ◀──────────────────┤                         │  │ │
│  │   │                                       │                         │  │ │
│  │   │   (from v86 state.js)                │                         │  │ │
│  │   └───────────────────────────────────────┼─────────────────────────┘  │ │
│  │                                           │                            │ │
│  │   ┌───────────────────────────────────────┼────────────────────────┐  │ │
│  │   │   S1: WASI Shim (happy-opfs)         │                        │  │ │
│  │   │   /emulator/snapshots/               ◀┘                        │  │ │
│  │   │      ├── current/                                              │  │ │
│  │   │      │   ├── toc.json                                          │  │ │
│  │   │      │   ├── cpu.gz                                            │  │ │
│  │   │      │   ├── devices.gz                                        │  │ │
│  │   │      │   └── chunk_*.gz                                        │  │ │
│  │   │      └── checkpoints/                                          │  │ │
│  │   │          ├── auto-2024-01-01/                                  │  │ │
│  │   │          └── user-save-1/                                      │  │ │
│  │   └────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                    │                                                         │
│                    ▼                                                         │
│              ┌──────────┐                                                    │
│              │   OPFS   │                                                    │
│              │ Storage  │                                                    │
│              └──────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before integrating snapshots, the OPFS infrastructure (S1/M1/L1) must be in place:

1. **S1 ready**: happy-opfs installed and opfs-fs-backend.js created
2. **worker.js modified**: `initOPFS()` called at startup
3. **OPFS directories created**: `/emulator/` path available

Refer to [OPFS_INTEGRATION.md](./OPFS_INTEGRATION.md) for setup details.

---

## Drop-in Components

### v86 state.js

The v86 emulator includes a production-tested save/restore system. Key functions:

```javascript
// From v86/src/state.js
CPU.prototype.save_state = function() {
    // Serializes: registers, flags, segments, FPU, SSE, memory
    return state;
};

CPU.prototype.restore_state = function(state) {
    // Deserializes and restores all CPU state
};
```

### Compression Libraries

| Library | Size | Speed | Use Case |
|---------|------|-------|----------|
| pako | 45KB | Fast | Project S/M (gzip) |
| fflate | 29KB | Faster | Alternative to pako |
| zstd-wasm | 400KB | Fastest | Project L/XL (better ratio) |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Integration Layers                                │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Layer 4: UI Controls                                                │   │
│   │  - Save/Restore buttons                                              │   │
│   │  - Checkpoint list                                                   │   │
│   │  - Auto-save toggle                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                        │                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Layer 3: Snapshot Manager (snapshot-manager.js)                     │   │
│   │  - Coordinates save/restore                                          │   │
│   │  - Manages checkpoints                                               │   │
│   │  - Handles chunking (M/L/XL)                                         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                        │                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Layer 2: State Serializer (from v86 state.js)                       │   │
│   │  - CPU state extraction                                              │   │
│   │  - Device state extraction                                           │   │
│   │  - Memory buffer access                                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                        │                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Layer 1: S1 Storage (happy-opfs via opfs-fs-backend.js)            │   │
│   │  - writeFileSync / readFileSync                                      │   │
│   │  - mkdirSync / readDirSync                                           │   │
│   │  - Persistent OPFS storage                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure After Integration

```
container2wasm/
├── examples/wasi-browser/htdocs/
│   ├── worker.js                     # Modified: add snapshot support
│   ├── opfs-fs-backend.js            # From OPFS integration (S1)
│   ├── opfs-worker.js                # From OPFS integration
│   ├── snapshot-manager.js           # NEW: snapshot orchestration
│   ├── state-serializer.js           # NEW: v86-based state extraction
│   └── index.html                    # Modified: add snapshot UI
│
├── vendor/v86/
│   └── src/
│       └── state.js                  # Reference (adapt patterns)
│
└── docs/
    ├── OPFS_INTEGRATION.md
    ├── SNAPSHOT_IMPLEMENTATION_REPORT.md
    └── SNAPSHOT_OPFS_INTEGRATION.md  # This document
```

---

## Integration Steps

### Step 1: Create State Serializer

Create `examples/wasi-browser/htdocs/state-serializer.js`:

```javascript
/**
 * State Serializer - Adapted from v86/src/state.js
 *
 * This module extracts and restores VM state for snapshotting.
 * The approach follows v86's proven patterns.
 */

const STATE_VERSION = 1;

/**
 * State index constants (from v86)
 */
const STATE_INDEX = {
    CPU_REGISTERS: 0,
    CPU_FLAGS: 1,
    CPU_SEGMENTS: 2,
    MEMORY: 10,
    DEVICES_START: 100,
};

/**
 * Extract complete VM state from emulator
 */
export function extractState(emulator) {
    const state = {
        version: STATE_VERSION,
        timestamp: Date.now(),
        components: {}
    };

    // CPU state
    state.components.cpu = extractCPUState(emulator);

    // Memory
    state.components.memory = extractMemoryState(emulator);

    // Device state
    state.components.devices = extractDeviceState(emulator);

    return state;
}

/**
 * Extract CPU registers and flags
 */
function extractCPUState(emulator) {
    const cpu = {};

    // Access WASM exports to get CPU state
    // This depends on emulator exposing these
    const exports = emulator.wasmInstance?.exports;

    if (exports) {
        // General purpose registers
        if (exports.get_eax) {
            cpu.eax = exports.get_eax();
            cpu.ebx = exports.get_ebx();
            cpu.ecx = exports.get_ecx();
            cpu.edx = exports.get_edx();
            cpu.esp = exports.get_esp();
            cpu.ebp = exports.get_ebp();
            cpu.esi = exports.get_esi();
            cpu.edi = exports.get_edi();
            cpu.eip = exports.get_eip();
            cpu.eflags = exports.get_eflags();
        }

        // Segment registers
        if (exports.get_cs) {
            cpu.cs = exports.get_cs();
            cpu.ds = exports.get_ds();
            cpu.es = exports.get_es();
            cpu.fs = exports.get_fs();
            cpu.gs = exports.get_gs();
            cpu.ss = exports.get_ss();
        }

        // Control registers
        if (exports.get_cr0) {
            cpu.cr0 = exports.get_cr0();
            cpu.cr2 = exports.get_cr2();
            cpu.cr3 = exports.get_cr3();
            cpu.cr4 = exports.get_cr4();
        }
    }

    // Alternative: emulator may provide unified state getter
    if (emulator.getCPUState) {
        return emulator.getCPUState();
    }

    return cpu;
}

/**
 * Extract full memory buffer
 */
function extractMemoryState(emulator) {
    const memory = emulator.wasmInstance?.exports?.memory;

    if (!memory) {
        console.warn('[Snapshot] Cannot access WASM memory');
        return new Uint8Array(0);
    }

    // Return a copy (not a view) to avoid mutation issues
    return new Uint8Array(memory.buffer.slice(0));
}

/**
 * Extract device state (virtio, PCI, timers, etc.)
 */
function extractDeviceState(emulator) {
    const devices = {};

    // Emulator-specific device state extraction
    if (emulator.getDeviceState) {
        return emulator.getDeviceState();
    }

    // Try to get individual device states
    const exports = emulator.wasmInstance?.exports;

    if (exports?.get_virtio_state) {
        devices.virtio = exports.get_virtio_state();
    }

    if (exports?.get_pci_state) {
        devices.pci = exports.get_pci_state();
    }

    if (exports?.get_timer_state) {
        devices.timers = exports.get_timer_state();
    }

    return devices;
}

/**
 * Restore complete VM state to emulator
 */
export function restoreState(emulator, state) {
    if (state.version !== STATE_VERSION) {
        throw new Error(`Incompatible snapshot version: ${state.version}`);
    }

    // Restore CPU
    restoreCPUState(emulator, state.components.cpu);

    // Restore memory
    restoreMemoryState(emulator, state.components.memory);

    // Restore devices
    restoreDeviceState(emulator, state.components.devices);
}

/**
 * Restore CPU state
 */
function restoreCPUState(emulator, cpu) {
    // Use unified setter if available
    if (emulator.setCPUState) {
        emulator.setCPUState(cpu);
        return;
    }

    const exports = emulator.wasmInstance?.exports;
    if (!exports) return;

    // Set individual registers
    if (exports.set_eax && cpu.eax !== undefined) {
        exports.set_eax(cpu.eax);
        exports.set_ebx(cpu.ebx);
        exports.set_ecx(cpu.ecx);
        exports.set_edx(cpu.edx);
        exports.set_esp(cpu.esp);
        exports.set_ebp(cpu.ebp);
        exports.set_esi(cpu.esi);
        exports.set_edi(cpu.edi);
        exports.set_eip(cpu.eip);
        exports.set_eflags(cpu.eflags);
    }

    if (exports.set_cs && cpu.cs !== undefined) {
        exports.set_cs(cpu.cs);
        exports.set_ds(cpu.ds);
        exports.set_es(cpu.es);
        exports.set_fs(cpu.fs);
        exports.set_gs(cpu.gs);
        exports.set_ss(cpu.ss);
    }

    if (exports.set_cr0 && cpu.cr0 !== undefined) {
        exports.set_cr0(cpu.cr0);
        exports.set_cr2(cpu.cr2);
        exports.set_cr3(cpu.cr3);
        exports.set_cr4(cpu.cr4);
    }
}

/**
 * Restore memory state
 */
function restoreMemoryState(emulator, memoryData) {
    const memory = emulator.wasmInstance?.exports?.memory;

    if (!memory) {
        console.warn('[Snapshot] Cannot access WASM memory');
        return;
    }

    const memoryView = new Uint8Array(memory.buffer);

    if (memoryData instanceof Uint8Array) {
        memoryView.set(memoryData);
    } else if (memoryData.buffer) {
        memoryView.set(new Uint8Array(memoryData.buffer));
    }
}

/**
 * Restore device state
 */
function restoreDeviceState(emulator, devices) {
    if (emulator.setDeviceState) {
        emulator.setDeviceState(devices);
        return;
    }

    const exports = emulator.wasmInstance?.exports;
    if (!exports) return;

    if (exports.set_virtio_state && devices.virtio) {
        exports.set_virtio_state(devices.virtio);
    }

    if (exports.set_pci_state && devices.pci) {
        exports.set_pci_state(devices.pci);
    }

    if (exports.set_timer_state && devices.timers) {
        exports.set_timer_state(devices.timers);
    }
}

/**
 * Serialize state to binary format
 */
export function serializeState(state) {
    // Convert state object to JSON, then to bytes
    const json = JSON.stringify(state, (key, value) => {
        // Handle Uint8Array specially
        if (value instanceof Uint8Array) {
            return {
                __type: 'Uint8Array',
                data: Array.from(value)
            };
        }
        return value;
    });

    return new TextEncoder().encode(json);
}

/**
 * Deserialize binary format to state
 */
export function deserializeState(data) {
    const json = new TextDecoder().decode(data);

    return JSON.parse(json, (key, value) => {
        // Restore Uint8Array
        if (value && value.__type === 'Uint8Array') {
            return new Uint8Array(value.data);
        }
        return value;
    });
}
```

### Step 2: Create Snapshot Manager

Create `examples/wasi-browser/htdocs/snapshot-manager.js`:

```javascript
/**
 * Snapshot Manager - Orchestrates VM snapshot save/restore using OPFS
 *
 * Integrates with:
 * - S1 (opfs-fs-backend.js) for storage
 * - state-serializer.js for VM state extraction
 * - pako for compression (Project S/M)
 */

import { getS1Filesystem } from './opfs-fs-backend.js';
import { extractState, restoreState, serializeState, deserializeState } from './state-serializer.js';
import pako from 'pako';

// Configuration
const SNAPSHOT_BASE_PATH = '/snapshots';
const CHUNK_SIZE = 4 * 1024 * 1024;  // 4MB (for Project M)
const AUTO_SAVE_INTERVAL = 60000;    // 1 minute

/**
 * Main Snapshot Manager class
 */
export class SnapshotManager {
    constructor(emulator, options = {}) {
        this.emulator = emulator;
        this.fs = null;  // S1 filesystem - set on init
        this.projectLevel = options.projectLevel || 'S';  // S, M, L, or XL
        this.autoSaveEnabled = options.autoSave || false;
        this.autoSaveTimer = null;
        this.loadedChunks = new Set();
        this.currentTOC = null;
    }

    /**
     * Initialize snapshot manager - call after OPFS is ready
     */
    async init() {
        this.fs = getS1Filesystem();

        if (!this.fs) {
            throw new Error('S1 filesystem not initialized. Call initOPFS() first.');
        }

        // Ensure snapshot directories exist
        this.fs.mkdir(SNAPSHOT_BASE_PATH);
        this.fs.mkdir(`${SNAPSHOT_BASE_PATH}/current`);
        this.fs.mkdir(`${SNAPSHOT_BASE_PATH}/checkpoints`);

        console.log('[Snapshot] Manager initialized');

        // Start auto-save if enabled
        if (this.autoSaveEnabled) {
            this.startAutoSave();
        }

        return this;
    }

    // ================================================================
    // Project S: Basic Full Snapshot
    // ================================================================

    /**
     * Take a basic full snapshot (Project S)
     */
    async takeSnapshotS(name = 'current') {
        console.log(`[Snapshot S] Taking snapshot '${name}'...`);
        const startTime = performance.now();

        // Pause emulator during snapshot
        const wasRunning = this.emulator.is_running?.() ?? true;
        if (this.emulator.stop) this.emulator.stop();

        try {
            // Extract state
            const state = extractState(this.emulator);

            // Serialize
            const serialized = serializeState(state);

            // Compress
            const compressed = pako.gzip(serialized);

            // Save to OPFS via S1
            const path = `${SNAPSHOT_BASE_PATH}/${name}/snapshot.gz`;
            this.fs.mkdir(`${SNAPSHOT_BASE_PATH}/${name}`);
            const success = this.fs.writeFile(path, compressed);

            if (!success) {
                throw new Error('Failed to write snapshot to OPFS');
            }

            // Save metadata
            const metadata = {
                version: 1,
                project: 'S',
                timestamp: Date.now(),
                originalSize: serialized.length,
                compressedSize: compressed.length,
                compressionRatio: (serialized.length / compressed.length).toFixed(2)
            };
            this.fs.writeFile(
                `${SNAPSHOT_BASE_PATH}/${name}/metadata.json`,
                new TextEncoder().encode(JSON.stringify(metadata, null, 2))
            );

            const elapsed = performance.now() - startTime;
            console.log(`[Snapshot S] Complete: ${(compressed.length / 1024 / 1024).toFixed(2)}MB in ${elapsed.toFixed(0)}ms`);

            return { success: true, metadata };

        } finally {
            // Resume emulator
            if (wasRunning && this.emulator.run) {
                this.emulator.run();
            }
        }
    }

    /**
     * Restore from a basic snapshot (Project S)
     */
    async restoreSnapshotS(name = 'current') {
        console.log(`[Snapshot S] Restoring snapshot '${name}'...`);
        const startTime = performance.now();

        // Stop emulator
        if (this.emulator.stop) this.emulator.stop();

        try {
            // Read from OPFS via S1
            const path = `${SNAPSHOT_BASE_PATH}/${name}/snapshot.gz`;
            const compressed = this.fs.readFile(path);

            if (!compressed) {
                throw new Error(`Snapshot '${name}' not found`);
            }

            // Decompress
            const serialized = pako.ungzip(compressed);

            // Deserialize
            const state = deserializeState(serialized);

            // Restore
            restoreState(this.emulator, state);

            const elapsed = performance.now() - startTime;
            console.log(`[Snapshot S] Restored in ${elapsed.toFixed(0)}ms`);

            // Resume emulator
            if (this.emulator.run) {
                this.emulator.run();
            }

            return { success: true };

        } catch (error) {
            console.error('[Snapshot S] Restore failed:', error);
            throw error;
        }
    }

    // ================================================================
    // Project M: Chunked Snapshots with Lazy Restore
    // ================================================================

    /**
     * Take a chunked snapshot (Project M)
     */
    async takeSnapshotM(name = 'current') {
        console.log(`[Snapshot M] Taking chunked snapshot '${name}'...`);
        const startTime = performance.now();

        const wasRunning = this.emulator.is_running?.() ?? true;
        if (this.emulator.stop) this.emulator.stop();

        try {
            const snapshotPath = `${SNAPSHOT_BASE_PATH}/${name}`;
            this.fs.mkdir(snapshotPath);

            // Extract state components
            const state = extractState(this.emulator);

            // Build TOC (Table of Contents)
            const toc = {
                version: 1,
                project: 'M',
                timestamp: Date.now(),
                chunkSize: CHUNK_SIZE,
                cpu: null,
                devices: null,
                memorySize: 0,
                chunks: []
            };

            // Save CPU state
            const cpuData = serializeState({ cpu: state.components.cpu });
            const cpuCompressed = pako.gzip(cpuData);
            this.fs.writeFile(`${snapshotPath}/cpu.gz`, cpuCompressed);
            toc.cpu = {
                size: cpuData.length,
                compressedSize: cpuCompressed.length,
                hash: await this.sha256(cpuData)
            };

            // Save device state
            const deviceData = serializeState({ devices: state.components.devices });
            const deviceCompressed = pako.gzip(deviceData);
            this.fs.writeFile(`${snapshotPath}/devices.gz`, deviceCompressed);
            toc.devices = {
                size: deviceData.length,
                compressedSize: deviceCompressed.length,
                hash: await this.sha256(deviceData)
            };

            // Chunk and save memory
            const memory = state.components.memory;
            toc.memorySize = memory.length;

            let chunkIndex = 0;
            let totalCompressedSize = 0;

            for (let offset = 0; offset < memory.length; offset += CHUNK_SIZE) {
                const chunk = memory.subarray(offset, Math.min(offset + CHUNK_SIZE, memory.length));

                // Check if chunk is all zeros (sparse memory optimization)
                if (this.isZeroFilled(chunk)) {
                    toc.chunks.push({
                        index: chunkIndex,
                        offset: offset,
                        size: chunk.length,
                        zero: true
                    });
                } else {
                    const compressed = pako.gzip(chunk);
                    const hash = await this.sha256(chunk);

                    this.fs.writeFile(`${snapshotPath}/chunk_${chunkIndex}.gz`, compressed);

                    toc.chunks.push({
                        index: chunkIndex,
                        offset: offset,
                        size: chunk.length,
                        compressedSize: compressed.length,
                        hash: hash,
                        zero: false
                    });

                    totalCompressedSize += compressed.length;
                }

                chunkIndex++;
            }

            // Save TOC
            const tocJson = JSON.stringify(toc, null, 2);
            this.fs.writeFile(`${snapshotPath}/toc.json`, new TextEncoder().encode(tocJson));

            const elapsed = performance.now() - startTime;
            console.log(`[Snapshot M] Complete: ${toc.chunks.length} chunks, ${(totalCompressedSize / 1024 / 1024).toFixed(2)}MB compressed, ${elapsed.toFixed(0)}ms`);

            return { success: true, toc };

        } finally {
            if (wasRunning && this.emulator.run) {
                this.emulator.run();
            }
        }
    }

    /**
     * Restore from chunked snapshot with lazy loading (Project M)
     */
    async restoreSnapshotM(name = 'current', options = {}) {
        const lazy = options.lazy !== false;  // Default to lazy
        console.log(`[Snapshot M] Restoring snapshot '${name}' (lazy: ${lazy})...`);
        const startTime = performance.now();

        if (this.emulator.stop) this.emulator.stop();

        try {
            const snapshotPath = `${SNAPSHOT_BASE_PATH}/${name}`;

            // Load TOC (always immediate)
            const tocData = this.fs.readFile(`${snapshotPath}/toc.json`);
            if (!tocData) {
                throw new Error(`Snapshot '${name}' not found`);
            }
            this.currentTOC = JSON.parse(new TextDecoder().decode(tocData));

            // Restore CPU state (always immediate)
            const cpuCompressed = this.fs.readFile(`${snapshotPath}/cpu.gz`);
            if (cpuCompressed) {
                const cpuData = pako.ungzip(cpuCompressed);
                const cpuState = deserializeState(cpuData);
                restoreState(this.emulator, { components: { cpu: cpuState.cpu } });
            }

            // Restore device state (always immediate)
            const deviceCompressed = this.fs.readFile(`${snapshotPath}/devices.gz`);
            if (deviceCompressed) {
                const deviceData = pako.ungzip(deviceCompressed);
                const deviceState = deserializeState(deviceData);
                restoreState(this.emulator, { components: { devices: deviceState.devices } });
            }

            // Memory restore
            if (lazy) {
                // Set up lazy loading
                this.setupLazyRestore(snapshotPath);
                console.log('[Snapshot M] TOC loaded, memory will load on-demand');
            } else {
                // Full restore
                await this.restoreAllChunks(snapshotPath);
            }

            const elapsed = performance.now() - startTime;
            console.log(`[Snapshot M] Restored in ${elapsed.toFixed(0)}ms`);

            if (this.emulator.run) {
                this.emulator.run();
            }

            return { success: true };

        } catch (error) {
            console.error('[Snapshot M] Restore failed:', error);
            throw error;
        }
    }

    /**
     * Set up lazy memory restore via page fault handling
     */
    setupLazyRestore(snapshotPath) {
        const memory = this.emulator.wasmInstance?.exports?.memory;
        if (!memory) {
            console.warn('[Snapshot M] Cannot set up lazy restore - no memory access');
            return;
        }

        const memoryView = new Uint8Array(memory.buffer);

        // Zero memory initially
        memoryView.fill(0);

        // Reset loaded chunks tracking
        this.loadedChunks = new Set();

        // Hook page fault handler (requires emulator support)
        if (this.emulator.setPageFaultHandler) {
            this.emulator.setPageFaultHandler((faultAddress) => {
                return this.handlePageFault(snapshotPath, memoryView, faultAddress);
            });
        } else {
            // Fallback: load all chunks immediately
            console.warn('[Snapshot M] Emulator does not support page faults, loading all chunks');
            this.restoreAllChunks(snapshotPath);
        }
    }

    /**
     * Handle page fault by loading required chunk
     */
    handlePageFault(snapshotPath, memoryView, faultAddress) {
        const chunkIndex = Math.floor(faultAddress / CHUNK_SIZE);

        if (this.loadedChunks.has(chunkIndex)) {
            return true;  // Already loaded
        }

        const chunkInfo = this.currentTOC.chunks[chunkIndex];
        if (!chunkInfo) {
            console.error(`[Snapshot M] Invalid chunk index: ${chunkIndex}`);
            return false;
        }

        if (chunkInfo.zero) {
            // Zero-filled chunk, already zeroed
            this.loadedChunks.add(chunkIndex);
            return true;
        }

        // Load and decompress chunk
        const compressed = this.fs.readFile(`${snapshotPath}/chunk_${chunkIndex}.gz`);
        if (!compressed) {
            console.error(`[Snapshot M] Failed to load chunk ${chunkIndex}`);
            return false;
        }

        const decompressed = pako.ungzip(compressed);
        memoryView.set(decompressed, chunkInfo.offset);

        this.loadedChunks.add(chunkIndex);
        console.log(`[Snapshot M] Lazy-loaded chunk ${chunkIndex} (${decompressed.length} bytes)`);

        return true;
    }

    /**
     * Restore all memory chunks (non-lazy)
     */
    async restoreAllChunks(snapshotPath) {
        const memory = this.emulator.wasmInstance?.exports?.memory;
        if (!memory) return;

        const memoryView = new Uint8Array(memory.buffer);

        for (const chunkInfo of this.currentTOC.chunks) {
            if (chunkInfo.zero) {
                memoryView.fill(0, chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
            } else {
                const compressed = this.fs.readFile(`${snapshotPath}/chunk_${chunkInfo.index}.gz`);
                if (compressed) {
                    const decompressed = pako.ungzip(compressed);
                    memoryView.set(decompressed, chunkInfo.offset);
                }
            }
            this.loadedChunks.add(chunkInfo.index);
        }

        console.log(`[Snapshot M] All ${this.currentTOC.chunks.length} chunks restored`);
    }

    // ================================================================
    // Checkpoint Management
    // ================================================================

    /**
     * Create a named checkpoint
     */
    async createCheckpoint(name) {
        const checkpointName = `checkpoint-${name}-${Date.now()}`;
        const method = this.projectLevel === 'S' ? 'takeSnapshotS' : 'takeSnapshotM';
        await this[method](`checkpoints/${checkpointName}`);
        return checkpointName;
    }

    /**
     * List all checkpoints
     */
    listCheckpoints() {
        const entries = this.fs.readdir(`${SNAPSHOT_BASE_PATH}/checkpoints`);
        return entries
            .filter(e => e.isDirectory)
            .map(e => {
                const metaPath = `${SNAPSHOT_BASE_PATH}/checkpoints/${e.name}/toc.json`;
                const meta = this.fs.readFile(metaPath);
                if (meta) {
                    const toc = JSON.parse(new TextDecoder().decode(meta));
                    return {
                        name: e.name,
                        timestamp: toc.timestamp,
                        project: toc.project
                    };
                }
                return { name: e.name };
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    /**
     * Delete a checkpoint
     */
    deleteCheckpoint(name) {
        const path = `${SNAPSHOT_BASE_PATH}/checkpoints/${name}`;
        // Delete all files in checkpoint directory
        const entries = this.fs.readdir(path);
        for (const entry of entries) {
            this.fs.unlink(`${path}/${entry.name}`);
        }
        // Note: OPFS doesn't have rmdir, directory remains empty
        return true;
    }

    // ================================================================
    // Auto-save
    // ================================================================

    startAutoSave() {
        if (this.autoSaveTimer) return;

        this.autoSaveTimer = setInterval(async () => {
            try {
                console.log('[Snapshot] Auto-saving...');
                const method = this.projectLevel === 'S' ? 'takeSnapshotS' : 'takeSnapshotM';
                await this[method]('current');
            } catch (error) {
                console.error('[Snapshot] Auto-save failed:', error);
            }
        }, AUTO_SAVE_INTERVAL);

        console.log(`[Snapshot] Auto-save enabled (every ${AUTO_SAVE_INTERVAL / 1000}s)`);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
            console.log('[Snapshot] Auto-save disabled');
        }
    }

    // ================================================================
    // Utilities
    // ================================================================

    isZeroFilled(data) {
        // Fast check: sample every 64 bytes first
        for (let i = 0; i < data.length; i += 64) {
            if (data[i] !== 0) return false;
        }
        // Full check if sampling passed
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

    /**
     * Check if a snapshot exists
     */
    hasSnapshot(name = 'current') {
        const tocPath = `${SNAPSHOT_BASE_PATH}/${name}/toc.json`;
        const snapshotPath = `${SNAPSHOT_BASE_PATH}/${name}/snapshot.gz`;
        return this.fs.exists(tocPath) || this.fs.exists(snapshotPath);
    }

    /**
     * Get snapshot info
     */
    getSnapshotInfo(name = 'current') {
        // Try Project M format (TOC)
        const tocPath = `${SNAPSHOT_BASE_PATH}/${name}/toc.json`;
        let tocData = this.fs.readFile(tocPath);
        if (tocData) {
            return JSON.parse(new TextDecoder().decode(tocData));
        }

        // Try Project S format (metadata)
        const metaPath = `${SNAPSHOT_BASE_PATH}/${name}/metadata.json`;
        const metaData = this.fs.readFile(metaPath);
        if (metaData) {
            return JSON.parse(new TextDecoder().decode(metaData));
        }

        return null;
    }
}

// ================================================================
// Factory function for easy creation
// ================================================================

let snapshotManagerInstance = null;

export async function initSnapshotManager(emulator, options = {}) {
    snapshotManagerInstance = new SnapshotManager(emulator, options);
    await snapshotManagerInstance.init();
    return snapshotManagerInstance;
}

export function getSnapshotManager() {
    return snapshotManagerInstance;
}
```

### Step 3: Update worker.js

Add snapshot integration to `examples/wasi-browser/htdocs/worker.js`:

```javascript
// ============================================================
// Snapshot Integration - Add after OPFS initialization
// ============================================================

import { initSnapshotManager, getSnapshotManager } from './snapshot-manager.js';

let snapshotManager = null;

// After OPFS is ready and emulator is created:
opfsReady.then(async ({ s1, opfs9pServer }) => {
    // ... existing OPFS setup code ...

    // Initialize snapshot manager
    // Wait for emulator to be ready first
    emulatorReady.then(async (emulator) => {
        snapshotManager = await initSnapshotManager(emulator, {
            projectLevel: 'M',      // Use chunked snapshots
            autoSave: false         // Disable auto-save by default
        });

        // Check for existing snapshot to restore
        if (snapshotManager.hasSnapshot('current')) {
            console.log('[Worker] Found existing snapshot, restoring...');
            try {
                await snapshotManager.restoreSnapshotM('current', { lazy: true });
                self.postMessage({ type: 'snapshot-restored' });
            } catch (error) {
                console.error('[Worker] Snapshot restore failed:', error);
                // Continue with fresh boot
            }
        }

        self.postMessage({ type: 'snapshot-ready' });
    });
});

// Handle snapshot messages from main thread
self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'snapshot-save':
            if (snapshotManager) {
                try {
                    const result = await snapshotManager.takeSnapshotM(data?.name || 'current');
                    self.postMessage({ type: 'snapshot-saved', data: result });
                } catch (error) {
                    self.postMessage({ type: 'snapshot-error', data: error.message });
                }
            }
            break;

        case 'snapshot-restore':
            if (snapshotManager) {
                try {
                    await snapshotManager.restoreSnapshotM(data?.name || 'current');
                    self.postMessage({ type: 'snapshot-restored' });
                } catch (error) {
                    self.postMessage({ type: 'snapshot-error', data: error.message });
                }
            }
            break;

        case 'snapshot-create-checkpoint':
            if (snapshotManager) {
                try {
                    const name = await snapshotManager.createCheckpoint(data?.name || 'manual');
                    self.postMessage({ type: 'checkpoint-created', data: { name } });
                } catch (error) {
                    self.postMessage({ type: 'snapshot-error', data: error.message });
                }
            }
            break;

        case 'snapshot-list-checkpoints':
            if (snapshotManager) {
                const checkpoints = snapshotManager.listCheckpoints();
                self.postMessage({ type: 'checkpoints-list', data: checkpoints });
            }
            break;

        case 'snapshot-toggle-autosave':
            if (snapshotManager) {
                if (data?.enabled) {
                    snapshotManager.startAutoSave();
                } else {
                    snapshotManager.stopAutoSave();
                }
            }
            break;
    }
});

// Expose for debugging
self.snapshotManager = () => snapshotManager;
```

### Step 4: Update index.html

Add snapshot UI controls to `examples/wasi-browser/htdocs/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>container2wasm with OPFS + Snapshots</title>
    <script type="importmap">
    {
        "imports": {
            "happy-opfs": "https://esm.sh/happy-opfs@latest",
            "pako": "https://esm.sh/pako@latest"
        }
    }
    </script>
    <style>
        .snapshot-controls {
            position: fixed;
            top: 50px;
            right: 10px;
            background: #333;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            color: white;
            z-index: 1000;
        }
        .snapshot-controls button {
            display: block;
            width: 100%;
            margin: 5px 0;
            padding: 5px 10px;
            cursor: pointer;
        }
        .snapshot-controls .status {
            padding: 5px;
            margin-top: 10px;
            border-top: 1px solid #555;
        }
        .checkpoint-list {
            max-height: 150px;
            overflow-y: auto;
            margin-top: 10px;
        }
        .checkpoint-item {
            padding: 5px;
            cursor: pointer;
            border-bottom: 1px solid #444;
        }
        .checkpoint-item:hover {
            background: #444;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>

    <!-- OPFS Status -->
    <div id="opfs-status" style="position: fixed; top: 10px; right: 10px; padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
        OPFS: Initializing...
    </div>

    <!-- Snapshot Controls -->
    <div class="snapshot-controls" id="snapshot-controls" style="display: none;">
        <strong>Snapshots</strong>
        <button id="save-btn">💾 Save State</button>
        <button id="restore-btn">📂 Restore State</button>
        <button id="checkpoint-btn">📍 Create Checkpoint</button>

        <label style="display: block; margin-top: 10px;">
            <input type="checkbox" id="autosave-toggle"> Auto-save
        </label>

        <div class="status" id="snapshot-status">Ready</div>

        <div class="checkpoint-list" id="checkpoint-list">
            <strong>Checkpoints:</strong>
            <div id="checkpoints"></div>
        </div>
    </div>

    <script type="module">
        const worker = new Worker('./worker.js', { type: 'module' });

        // Snapshot UI elements
        const snapshotControls = document.getElementById('snapshot-controls');
        const snapshotStatus = document.getElementById('snapshot-status');
        const checkpointsDiv = document.getElementById('checkpoints');

        // Handle messages from worker
        worker.addEventListener('message', (e) => {
            const { type, data } = e.data;

            switch (type) {
                case 'opfs-ready':
                    document.getElementById('opfs-status').textContent = 'OPFS: Ready';
                    document.getElementById('opfs-status').style.background = '#4CAF50';
                    document.getElementById('opfs-status').style.color = 'white';
                    break;

                case 'snapshot-ready':
                    snapshotControls.style.display = 'block';
                    snapshotStatus.textContent = 'Ready';
                    // Load checkpoint list
                    worker.postMessage({ type: 'snapshot-list-checkpoints' });
                    break;

                case 'snapshot-saved':
                    snapshotStatus.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
                    snapshotStatus.style.color = '#4CAF50';
                    break;

                case 'snapshot-restored':
                    snapshotStatus.textContent = 'Restored';
                    snapshotStatus.style.color = '#2196F3';
                    break;

                case 'snapshot-error':
                    snapshotStatus.textContent = `Error: ${data}`;
                    snapshotStatus.style.color = '#f44336';
                    break;

                case 'checkpoint-created':
                    snapshotStatus.textContent = `Checkpoint: ${data.name}`;
                    worker.postMessage({ type: 'snapshot-list-checkpoints' });
                    break;

                case 'checkpoints-list':
                    renderCheckpoints(data);
                    break;
            }
        });

        // Render checkpoint list
        function renderCheckpoints(checkpoints) {
            checkpointsDiv.innerHTML = '';
            if (checkpoints.length === 0) {
                checkpointsDiv.innerHTML = '<em>No checkpoints</em>';
                return;
            }
            for (const cp of checkpoints) {
                const div = document.createElement('div');
                div.className = 'checkpoint-item';
                div.textContent = cp.name.replace('checkpoint-', '');
                if (cp.timestamp) {
                    div.title = new Date(cp.timestamp).toLocaleString();
                }
                div.onclick = () => {
                    worker.postMessage({
                        type: 'snapshot-restore',
                        data: { name: `checkpoints/${cp.name}` }
                    });
                };
                checkpointsDiv.appendChild(div);
            }
        }

        // Button handlers
        document.getElementById('save-btn').onclick = () => {
            snapshotStatus.textContent = 'Saving...';
            snapshotStatus.style.color = 'white';
            worker.postMessage({ type: 'snapshot-save' });
        };

        document.getElementById('restore-btn').onclick = () => {
            snapshotStatus.textContent = 'Restoring...';
            snapshotStatus.style.color = 'white';
            worker.postMessage({ type: 'snapshot-restore' });
        };

        document.getElementById('checkpoint-btn').onclick = () => {
            const name = prompt('Checkpoint name:', 'save-' + Date.now());
            if (name) {
                snapshotStatus.textContent = 'Creating checkpoint...';
                worker.postMessage({
                    type: 'snapshot-create-checkpoint',
                    data: { name }
                });
            }
        };

        document.getElementById('autosave-toggle').onchange = (e) => {
            worker.postMessage({
                type: 'snapshot-toggle-autosave',
                data: { enabled: e.target.checked }
            });
            snapshotStatus.textContent = e.target.checked ? 'Auto-save ON' : 'Auto-save OFF';
        };
    </script>
</body>
</html>
```

---

## OPFS Storage Layout with Snapshots

After integration, the OPFS structure includes snapshot storage:

```
OPFS Root (browser origin storage)
├── /emulator/                  # S1: Emulator's own files
│   ├── /cache/                 # eStargz layer cache
│   ├── /config/                # Emulator configuration
│   └── /snapshots/             # VM snapshots <-- NEW
│       ├── /current/           # Active snapshot
│       │   ├── toc.json        # Table of contents (M/L/XL)
│       │   ├── cpu.gz          # CPU state
│       │   ├── devices.gz      # Device state
│       │   ├── chunk_0.gz      # Memory chunk 0
│       │   ├── chunk_1.gz      # Memory chunk 1
│       │   └── ...
│       └── /checkpoints/       # Named checkpoints
│           ├── /auto-1704067200000/
│           ├── /user-save-1/
│           └── ...
│
└── /shared/                    # M1/L1: Guest VM accessible
    ├── /home/
    ├── /data/
    └── /tmp/
```

---

## Data Flow

### Save Snapshot

```
User clicks "Save" button
         │
         ▼
Main Thread: worker.postMessage({ type: 'snapshot-save' })
         │
         ▼
Worker: snapshotManager.takeSnapshotM('current')
         │
         ├──► extractState(emulator)
         │         │
         │         ├──► CPU registers, flags
         │         ├──► Memory buffer (256MB+)
         │         └──► Device state
         │
         ├──► pako.gzip(chunk) for each 4MB block
         │
         └──► S1 fs.writeFile() ──► happy-opfs ──► OPFS
                                                      │
                                                      ▼
                                              Persistent storage
```

### Restore Snapshot (Lazy)

```
User clicks "Restore" or page loads with existing snapshot
         │
         ▼
Worker: snapshotManager.restoreSnapshotM('current', { lazy: true })
         │
         ├──► Load toc.json (small, fast)
         │
         ├──► Load cpu.gz ──► pako.ungzip ──► restoreCPUState
         │
         ├──► Load devices.gz ──► restoreDeviceState
         │
         └──► setupLazyRestore()
                    │
                    └──► Zero memory, set page fault handler
                              │
                              ▼
                         Resume VM
                              │
                              ▼
                    VM accesses memory page
                              │
                              ▼
                    handlePageFault(address)
                              │
                              ├──► Find chunk index
                              ├──► Load chunk_N.gz from OPFS
                              ├──► pako.ungzip
                              └──► Copy to memory at offset
```

---

## Project Level Selection

Choose the snapshot project level based on your needs:

| Level | Description | When to Use |
|-------|-------------|-------------|
| **S** | Full snapshot, single file | Quick prototype, small VMs (<64MB) |
| **M** | Chunked with lazy restore | Production default, good UX |
| **L** | eStargz format | Registry distribution, tooling reuse |
| **XL** | Incremental + migration | Multi-device, continuous saving |

Set in worker.js:

```javascript
snapshotManager = await initSnapshotManager(emulator, {
    projectLevel: 'M',  // Change to 'S', 'L', or 'XL'
    autoSave: false
});
```

---

## Verification

### Test Snapshot Save

```javascript
// In browser console
const mgr = snapshotManager();
await mgr.takeSnapshotM('test');
console.log(mgr.getSnapshotInfo('test'));
```

### Test Snapshot Restore

```javascript
// Modify something in VM, then:
await mgr.restoreSnapshotM('test');
// Verify VM state reverted
```

### Test Lazy Loading

```javascript
// Restore with lazy loading
await mgr.restoreSnapshotM('test', { lazy: true });
// Check how many chunks loaded initially
console.log(`Loaded chunks: ${mgr.loadedChunks.size}`);
// Use VM, then check again
console.log(`Loaded chunks after use: ${mgr.loadedChunks.size}`);
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "S1 filesystem not initialized" | OPFS not ready | Ensure `initOPFS()` completes before `initSnapshotManager()` |
| Snapshot too slow | Large VM memory | Use Project M with chunking |
| Lazy restore not working | Emulator lacks page fault support | Falls back to full restore |
| Memory corruption after restore | Incomplete state serialization | Verify CPU/device state extraction |
| OPFS quota exceeded | Too many snapshots | Delete old checkpoints |

---

## Performance Expectations

| Metric | Project S | Project M |
|--------|-----------|-----------|
| Save time (256MB) | 3-5s | 5-8s (chunking overhead) |
| Restore time (full) | 3-5s | 5-8s |
| Restore time (lazy) | N/A | <500ms to interactive |
| Snapshot size | 256MB raw | ~100MB compressed |
| First page load | N/A | ~50ms per fault |

---

## Next Steps

After basic snapshot integration:

1. **Add compression selection**: Allow user to choose pako vs zstd
2. **Implement prefetch lists**: Predict hot pages for faster restore
3. **Add Project L**: eStargz format for registry storage
4. **Add Project XL**: Incremental snapshots with dirty page tracking
5. **Add Service Worker**: Offline snapshot access

See [SNAPSHOT_IMPLEMENTATION_REPORT.md](./SNAPSHOT_IMPLEMENTATION_REPORT.md) for L and XL implementation details.
