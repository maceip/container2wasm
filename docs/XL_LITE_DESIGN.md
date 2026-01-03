# XL-Lite: Reduced-Scope Snapshot Design for Codex

## Goal

Fast snapshot/restore for **code execution environments** (Codex), not full desktop VMs. We don't need WebVM's full x86 JIT - we need:

1. **Instant cold start** - Pre-initialized container ready to execute code
2. **Persistent workspace** - Code and dependencies survive page refresh
3. **Minimal footprint** - Only load what's needed for code execution

## Codex vs Desktop VM

Codex needs a **full development environment** (Python, C++, Node, Rust, etc.) but optimized for code work, not desktop use:

| Aspect | Desktop VM (WebVM) | Codex Dev Environment |
|--------|-------------------|----------------------|
| Use case | General desktop Linux | Development/build/test |
| Languages | Whatever's installed | Python, C++, Node, Rust, Go, etc. |
| Memory | 256MB-1GB | 128-256MB (no GUI overhead) |
| Disk | Full Linux distro | Dev tools + workspace |
| Boot | Full cold boot | Pre-booted snapshot |
| Interactive | GUI + terminal | Terminal only (faster) |
| Startup target | 5-10s acceptable | **<1s required** |
| Persistence | Optional | **Required** (workspace survives refresh) |

**Key difference**: We don't know what Codex will work on (could be Python one minute, C++ the next), so we need a complete dev environment - but without the desktop overhead.

## Codex-Optimized Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Codex Execution Flow                                 │
│                                                                              │
│   User Request: "run python script.py"                                       │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  1. Check for pre-booted snapshot                                    │   │
│   │     └── /snapshots/codex-python-ready.manifest                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼ (<100ms)                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  2. Restore pre-initialized container                                │   │
│   │     - Python runtime loaded                                          │   │
│   │     - Common packages installed                                      │   │
│   │     - Shell ready at /workspace                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼ (<50ms)                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  3. Mount user workspace from OPFS                                   │   │
│   │     - /workspace/script.py (from previous session)                   │   │
│   │     - /workspace/venv/ (cached deps)                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼ (immediate)                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  4. Execute code                                                     │   │
│   │     $ python script.py                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Insight: Separate Immutable Base from Mutable Workspace

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   IMMUTABLE (snapshot once, reuse forever)        MUTABLE (persist to OPFS) │
│   ─────────────────────────────────────────       ──────────────────────────│
│                                                                              │
│   ┌────────────────────────────────────┐         ┌────────────────────────┐ │
│   │  Pre-booted Dev Environment        │         │  User Workspace        │ │
│   │                                    │         │                        │ │
│   │  • Linux kernel + init             │         │  • /workspace/*        │ │
│   │  • Build essentials (gcc, make)    │         │  • User code files     │ │
│   │  • Python 3.x + pip                │         │  • Virtual envs        │ │
│   │  • Node.js + npm                   │         │  • node_modules/       │ │
│   │  • Rust toolchain                  │         │  • Cargo cache         │ │
│   │  • Go toolchain                    │         │  • Build artifacts     │ │
│   │  • Common libs (openssl, etc)      │         │  • .git directories    │ │
│   │  • Shell + utils (vim, git, curl)  │         │  • Config files        │ │
│   │                                    │         │                        │ │
│   │  Size: 200-400MB compressed        │         │  Size: Variable        │ │
│   │  Source: CDN / eStargz             │         │  Source: OPFS (M1/L1)  │ │
│   │                                    │         │                        │ │
│   └────────────────────────────────────┘         └────────────────────────┘ │
│                                                                              │
│   Load once per browser ───────────────────────── Persist always            │
│   (cached in OPFS)                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Multi-Language Dev Environment

Since Codex could work on anything:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Base Image Layers (eStargz)                          │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Layer 0: Alpine/Debian minimal (10MB)                               │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  Layer 1: Build essentials - gcc, g++, make, cmake (50MB)           │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  Layer 2: Python 3.11 + pip + common packages (80MB)                │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  Layer 3: Node.js 20 LTS + npm (60MB)                                │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  Layer 4: Rust toolchain (100MB)                                     │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  Layer 5: Go toolchain (80MB)                                        │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │  Layer 6: Dev utilities - git, vim, curl, jq, ripgrep (20MB)        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Total: ~400MB compressed                                                   │
│   eStargz lazy loading: Only fetch layers as needed                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Strategy**:
1. Pre-boot snapshot includes all runtimes (eliminates install time)
2. eStargz lazy loads layers - C++ project only pulls layers 0-1
3. Workspace deps (node_modules, venv) persist in OPFS

## XL-Lite vs Full XL

| Feature | Full XL | XL-Lite | Complexity Saved |
|---------|---------|---------|------------------|
| Incremental snapshots | Dirty page tracking | Content-addressed delta | 60% less code |
| Live migration | WebRTC streaming | **Removed** | 40% less code |
| Prefetch | ML-based prediction | LRU + boot profile | 70% less code |
| Service Worker | Full offline + caching | Basic snapshot cache | 50% less code |

**Result**: ~3,000 LOC instead of ~15,000 LOC

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            XL-Lite Architecture                              │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Snapshot Manager                               │ │
│  │                                                                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │ │
│  │  │  Content-       │  │   Prefetch      │  │    Delta               │ │ │
│  │  │  Addressed      │  │   Engine        │  │    Computer            │ │ │
│  │  │  Store (CAS)    │  │                 │  │                        │ │ │
│  │  └────────┬────────┘  └────────┬────────┘  └───────────┬────────────┘ │ │
│  │           │                    │                       │              │ │
│  └───────────┼────────────────────┼───────────────────────┼──────────────┘ │
│              │                    │                       │                │
│              ▼                    ▼                       ▼                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         S1 OPFS Layer                                   │ │
│  │                                                                         │ │
│  │  /snapshots/                                                            │ │
│  │  ├── /cas/                    # Content-addressed chunks                │ │
│  │  │   ├── ab/cd1234...gz       # Stored by SHA256 prefix                │ │
│  │  │   └── ef/gh5678...gz                                                │ │
│  │  ├── /manifests/              # Snapshot metadata                       │ │
│  │  │   ├── current.json                                                  │ │
│  │  │   └── checkpoint-1.json                                             │ │
│  │  ├── /profiles/               # Access pattern data                     │ │
│  │  │   └── boot.json            # Hot chunks during boot                 │ │
│  │  └── /prefetch/               # Prefetch queue                          │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Content-Addressed Store (CAS)

Instead of tracking dirty pages at runtime (complex), we use content addressing:

```javascript
/**
 * Content-Addressed Store
 *
 * Chunks are stored by their SHA256 hash. This gives us:
 * - Automatic deduplication across snapshots
 * - Incremental saves (only new chunks written)
 * - Simple integrity verification
 */
class ContentAddressedStore {
    constructor(fs, basePath = '/snapshots/cas') {
        this.fs = fs;
        this.basePath = basePath;
        this.cache = new Map();  // hash -> data (in-memory LRU)
        this.maxCacheSize = 50 * 1024 * 1024;  // 50MB
        this.currentCacheSize = 0;
    }

    /**
     * Store chunk, return its hash
     */
    async put(data) {
        const hash = await this.sha256(data);

        // Check if already exists (dedup)
        if (this.exists(hash)) {
            return hash;
        }

        // Compress and store
        const compressed = pako.gzip(data);
        const dir = `${this.basePath}/${hash.slice(0, 2)}`;
        this.fs.mkdir(dir);
        this.fs.writeFile(`${dir}/${hash}.gz`, compressed);

        return hash;
    }

    /**
     * Retrieve chunk by hash
     */
    get(hash) {
        // Check memory cache first
        if (this.cache.has(hash)) {
            return this.cache.get(hash);
        }

        // Load from OPFS
        const path = `${this.basePath}/${hash.slice(0, 2)}/${hash}.gz`;
        const compressed = this.fs.readFile(path);
        if (!compressed) return null;

        const data = pako.ungzip(compressed);
        this.addToCache(hash, data);
        return data;
    }

    exists(hash) {
        if (this.cache.has(hash)) return true;
        const path = `${this.basePath}/${hash.slice(0, 2)}/${hash}.gz`;
        return this.fs.exists(path);
    }

    addToCache(hash, data) {
        // LRU eviction if needed
        while (this.currentCacheSize + data.length > this.maxCacheSize && this.cache.size > 0) {
            const oldest = this.cache.keys().next().value;
            this.currentCacheSize -= this.cache.get(oldest).length;
            this.cache.delete(oldest);
        }
        this.cache.set(hash, data);
        this.currentCacheSize += data.length;
    }

    async sha256(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}
```

### 2. Delta Snapshots (Simplified)

Instead of dirty page tracking, compare current state to last manifest:

```javascript
/**
 * Delta Snapshot Computer
 *
 * Computes which chunks changed between snapshots by comparing
 * content hashes. No runtime tracking needed.
 */
class DeltaComputer {
    constructor(cas) {
        this.cas = cas;
    }

    /**
     * Save snapshot, only writing new chunks
     */
    async saveSnapshot(name, memory, cpuState, deviceState) {
        const manifest = {
            version: 2,
            timestamp: Date.now(),
            parent: null,
            chunks: [],
            cpu: null,
            devices: null,
            stats: { total: 0, new: 0, reused: 0, zero: 0 }
        };

        // Find parent manifest for stats
        const parentManifest = this.loadManifest('current');
        const parentChunks = new Set(parentManifest?.chunks.map(c => c.hash) || []);

        // Save CPU state
        const cpuData = this.serialize(cpuState);
        manifest.cpu = await this.cas.put(cpuData);

        // Save device state
        const deviceData = this.serialize(deviceState);
        manifest.devices = await this.cas.put(deviceData);

        // Chunk memory
        const CHUNK_SIZE = 4 * 1024 * 1024;
        for (let offset = 0; offset < memory.length; offset += CHUNK_SIZE) {
            const chunk = memory.subarray(offset, Math.min(offset + CHUNK_SIZE, memory.length));
            manifest.stats.total++;

            if (this.isZeroFilled(chunk)) {
                manifest.chunks.push({ offset, zero: true });
                manifest.stats.zero++;
            } else {
                const hash = await this.cas.put(chunk);
                manifest.chunks.push({ offset, hash, size: chunk.length });

                if (parentChunks.has(hash)) {
                    manifest.stats.reused++;
                } else {
                    manifest.stats.new++;
                }
            }
        }

        // Save manifest
        this.saveManifest(name, manifest);

        console.log(`[Delta] Saved: ${manifest.stats.new} new, ${manifest.stats.reused} reused, ${manifest.stats.zero} zero`);
        return manifest;
    }

    loadManifest(name) {
        const data = this.fs.readFile(`/snapshots/manifests/${name}.json`);
        if (!data) return null;
        return JSON.parse(new TextDecoder().decode(data));
    }

    saveManifest(name, manifest) {
        this.fs.writeFile(
            `/snapshots/manifests/${name}.json`,
            new TextEncoder().encode(JSON.stringify(manifest, null, 2))
        );
    }

    serialize(obj) {
        return new TextEncoder().encode(JSON.stringify(obj));
    }

    isZeroFilled(data) {
        for (let i = 0; i < data.length; i += 64) {
            if (data[i] !== 0) return false;
        }
        return true;
    }
}
```

### 3. Prefetch Engine (Simple Profile-Based)

Instead of ML prediction, use recorded boot profiles:

```javascript
/**
 * Prefetch Engine
 *
 * Records which chunks are accessed during boot, then prefetches
 * them on subsequent restores. Simple but effective.
 */
class PrefetchEngine {
    constructor(cas, fs) {
        this.cas = cas;
        this.fs = fs;
        this.accessLog = [];
        this.isRecording = false;
    }

    /**
     * Start recording access patterns (during first boot)
     */
    startRecording() {
        this.accessLog = [];
        this.isRecording = true;
        console.log('[Prefetch] Recording started');
    }

    /**
     * Record a chunk access
     */
    recordAccess(hash, accessType = 'read') {
        if (!this.isRecording) return;
        this.accessLog.push({
            hash,
            time: performance.now(),
            type: accessType
        });
    }

    /**
     * Stop recording and save profile
     */
    stopRecording(profileName = 'boot') {
        if (!this.isRecording) return;
        this.isRecording = false;

        // Deduplicate and order by first access time
        const seen = new Set();
        const profile = this.accessLog
            .filter(entry => {
                if (seen.has(entry.hash)) return false;
                seen.add(entry.hash);
                return true;
            })
            .map(entry => entry.hash);

        this.saveProfile(profileName, profile);
        console.log(`[Prefetch] Saved profile '${profileName}': ${profile.length} chunks`);
    }

    /**
     * Prefetch chunks based on profile
     */
    async prefetch(profileName = 'boot') {
        const profile = this.loadProfile(profileName);
        if (!profile || profile.length === 0) {
            console.log('[Prefetch] No profile found, skipping');
            return;
        }

        console.log(`[Prefetch] Loading ${profile.length} chunks from profile '${profileName}'`);

        // Prefetch in batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < profile.length; i += BATCH_SIZE) {
            const batch = profile.slice(i, i + BATCH_SIZE);

            // Load batch in parallel (but don't block)
            await Promise.all(batch.map(hash => {
                // This populates the CAS cache
                return new Promise(resolve => {
                    this.cas.get(hash);
                    resolve();
                });
            }));

            // Yield to allow other work
            await new Promise(r => setTimeout(r, 0));
        }

        console.log('[Prefetch] Complete');
    }

    /**
     * Background prefetch during idle time
     */
    startIdlePrefetch(profile) {
        if (!('requestIdleCallback' in self)) {
            // Fallback for workers
            setTimeout(() => this.prefetch(profile), 100);
            return;
        }

        const prefetchNext = (deadline) => {
            if (this.prefetchQueue.length === 0) return;

            while (deadline.timeRemaining() > 5 && this.prefetchQueue.length > 0) {
                const hash = this.prefetchQueue.shift();
                this.cas.get(hash);  // Populate cache
            }

            if (this.prefetchQueue.length > 0) {
                requestIdleCallback(prefetchNext);
            }
        };

        this.prefetchQueue = [...(this.loadProfile(profile) || [])];
        requestIdleCallback(prefetchNext);
    }

    loadProfile(name) {
        const data = this.fs.readFile(`/snapshots/profiles/${name}.json`);
        if (!data) return null;
        return JSON.parse(new TextDecoder().decode(data));
    }

    saveProfile(name, hashes) {
        this.fs.mkdir('/snapshots/profiles');
        this.fs.writeFile(
            `/snapshots/profiles/${name}.json`,
            new TextEncoder().encode(JSON.stringify(hashes))
        );
    }
}
```

### 4. XL-Lite Manager

Combines all components:

```javascript
/**
 * XL-Lite Snapshot Manager
 *
 * Simplified XL with:
 * - Content-addressed storage (deduplication)
 * - Profile-based prefetch (fast restore)
 * - Delta computation (efficient saves)
 *
 * Excludes:
 * - Live migration
 * - Real-time dirty page tracking
 * - ML-based prediction
 */
export class XLLiteManager {
    constructor(emulator, options = {}) {
        this.emulator = emulator;
        this.fs = null;
        this.cas = null;
        this.delta = null;
        this.prefetch = null;
        this.isFirstBoot = true;
    }

    async init() {
        this.fs = getS1Filesystem();

        // Create directories
        this.fs.mkdir('/snapshots');
        this.fs.mkdir('/snapshots/cas');
        this.fs.mkdir('/snapshots/manifests');
        this.fs.mkdir('/snapshots/profiles');

        // Initialize components
        this.cas = new ContentAddressedStore(this.fs);
        this.delta = new DeltaComputer(this.cas);
        this.prefetch = new PrefetchEngine(this.cas, this.fs);

        console.log('[XL-Lite] Initialized');
    }

    /**
     * Save snapshot with deduplication
     */
    async save(name = 'current') {
        console.log(`[XL-Lite] Saving '${name}'...`);
        const start = performance.now();

        const wasRunning = this.emulator.is_running?.() ?? true;
        if (this.emulator.stop) this.emulator.stop();

        try {
            const state = extractState(this.emulator);
            const manifest = await this.delta.saveSnapshot(
                name,
                state.components.memory,
                state.components.cpu,
                state.components.devices
            );

            const elapsed = performance.now() - start;
            console.log(`[XL-Lite] Saved in ${elapsed.toFixed(0)}ms`);

            return manifest;
        } finally {
            if (wasRunning && this.emulator.run) {
                this.emulator.run();
            }
        }
    }

    /**
     * Restore with prefetch
     */
    async restore(name = 'current') {
        console.log(`[XL-Lite] Restoring '${name}'...`);
        const start = performance.now();

        if (this.emulator.stop) this.emulator.stop();

        try {
            const manifest = this.delta.loadManifest(name);
            if (!manifest) {
                throw new Error(`Snapshot '${name}' not found`);
            }

            // Start prefetch in background
            this.prefetch.prefetch('boot');

            // Restore CPU (always immediate)
            const cpuData = this.cas.get(manifest.cpu);
            if (cpuData) {
                const cpu = JSON.parse(new TextDecoder().decode(cpuData));
                restoreState(this.emulator, { components: { cpu } });
            }

            // Restore devices (always immediate)
            const deviceData = this.cas.get(manifest.devices);
            if (deviceData) {
                const devices = JSON.parse(new TextDecoder().decode(deviceData));
                restoreState(this.emulator, { components: { devices } });
            }

            // Set up lazy memory restore
            this.setupLazyRestore(manifest);

            // Start recording if first boot (to build profile)
            if (this.isFirstBoot && !this.prefetch.loadProfile('boot')) {
                this.prefetch.startRecording();
                // Stop recording after 10 seconds
                setTimeout(() => this.prefetch.stopRecording('boot'), 10000);
            }
            this.isFirstBoot = false;

            const elapsed = performance.now() - start;
            console.log(`[XL-Lite] Restored in ${elapsed.toFixed(0)}ms (memory loading lazily)`);

            if (this.emulator.run) this.emulator.run();

        } catch (error) {
            console.error('[XL-Lite] Restore failed:', error);
            throw error;
        }
    }

    setupLazyRestore(manifest) {
        const memory = this.emulator.wasmInstance?.exports?.memory;
        if (!memory) return;

        const memoryView = new Uint8Array(memory.buffer);
        memoryView.fill(0);

        this.loadedChunks = new Set();
        this.currentManifest = manifest;

        if (this.emulator.setPageFaultHandler) {
            this.emulator.setPageFaultHandler((addr) => this.handleFault(memoryView, addr));
        } else {
            // Fallback: load all
            this.loadAllChunks(memoryView, manifest);
        }
    }

    handleFault(memoryView, address) {
        const CHUNK_SIZE = 4 * 1024 * 1024;
        const chunkIndex = Math.floor(address / CHUNK_SIZE);

        if (this.loadedChunks.has(chunkIndex)) return true;

        const chunkInfo = this.currentManifest.chunks[chunkIndex];
        if (!chunkInfo) return false;

        if (chunkInfo.zero) {
            this.loadedChunks.add(chunkIndex);
            return true;
        }

        const data = this.cas.get(chunkInfo.hash);
        if (!data) return false;

        memoryView.set(data, chunkInfo.offset);
        this.loadedChunks.add(chunkIndex);

        // Record for prefetch profile
        this.prefetch.recordAccess(chunkInfo.hash);

        return true;
    }

    loadAllChunks(memoryView, manifest) {
        for (const chunk of manifest.chunks) {
            if (chunk.zero) continue;
            const data = this.cas.get(chunk.hash);
            if (data) {
                memoryView.set(data, chunk.offset);
            }
        }
    }
}
```

---

## Performance Comparison

### Cold Start (First Visit)

| Step | WebVM | XL-Lite | Advantage |
|------|-------|---------|-----------|
| Load HTML/JS | 500ms | 500ms | Same |
| Initialize VM | 2-3s (JIT) | 500ms (WASM) | **4-6x faster** |
| First disk access | 128KB fetch | Prefetch 4MB batch | **Less latency** |
| Interactive | 5-10s | 1-2s | **5x faster** |

### Warm Start (Return Visit with Snapshot)

| Step | WebVM | XL-Lite | Advantage |
|------|-------|---------|-----------|
| Check storage | IndexedDB async | OPFS sync | **Sync = faster** |
| Load state | N/A (no snapshots) | CPU+devices only | **Instant** |
| Memory ready | Full load | Lazy + prefetch | **<500ms to use** |
| Full interactive | N/A | 1s | **New capability** |

### Incremental Saves

| Metric | Full XL | XL-Lite | WebVM |
|--------|---------|---------|-------|
| Tracking method | Dirty pages (runtime) | Hash compare (save-time) | N/A |
| Save time | ~100ms | ~500ms | N/A |
| Storage efficiency | Best | Very good | N/A |
| Complexity | High | Low | N/A |

---

## What We Skip (Complexity Reduction)

### 1. Live Migration (Removed)
- **Full XL**: WebRTC/WebSocket streaming, pre-copy iteration, stop-and-copy
- **XL-Lite**: Export snapshot file, import on other device
- **Savings**: ~5,000 LOC removed

### 2. Runtime Dirty Tracking (Simplified)
- **Full XL**: Hook every memory write, bitmap tracking
- **XL-Lite**: Compare hashes at save time
- **Savings**: ~3,000 LOC removed, no emulator modifications

### 3. ML Prediction (Simplified)
- **Full XL**: TensorFlow.js model, training pipeline
- **XL-Lite**: Record first boot, replay on subsequent boots
- **Savings**: ~4,000 LOC removed, no external deps

### 4. Service Worker (Basic)
- **Full XL**: Full offline support, sync queue, conflict resolution
- **XL-Lite**: Simple cache for CAS chunks
- **Savings**: ~3,000 LOC removed

---

## Implementation Effort

| Component | Lines of Code | Time |
|-----------|---------------|------|
| ContentAddressedStore | ~150 | 2 days |
| DeltaComputer | ~100 | 1 day |
| PrefetchEngine | ~150 | 2 days |
| XLLiteManager | ~200 | 2 days |
| Integration + testing | ~400 | 3 days |
| **Total** | **~1,000** | **2 weeks** |

Compare to Full XL: ~15,000 LOC, 3-6 months

---

## How It Beats WebVM

1. **Faster restore**: True VM snapshots vs JIT recompilation each time
2. **Sync I/O**: OPFS FileSystemSyncAccessHandle vs async IndexedDB
3. **Smarter prefetch**: Boot profile prediction vs pure on-demand
4. **Deduplication**: Content-addressed chunks reduce storage
5. **Larger chunks**: 4MB vs 128KB = fewer round trips
6. **Memory efficiency**: Lazy loading keeps only hot pages in RAM

---

## Migration Path to Full XL

XL-Lite is designed to upgrade gracefully:

```
XL-Lite                          Full XL
────────────────────────────────────────────
CAS (same)            ────────>  CAS (same)
Hash-based delta      ────────>  + Dirty tracking
Boot profiles         ────────>  + ML prediction
Manual export         ────────>  + Live migration
Basic caching         ────────>  + Full offline
```

The CAS and manifest format are compatible, so snapshots created with XL-Lite work with Full XL.

---

## Deep Dive: Overlay Filesystem Architecture

The key insight for Codex is separating **immutable base** (runtimes, tools) from **mutable workspace** (user code, deps). This enables:

1. **Shared base across sessions** - Download once, reuse forever
2. **Fast workspace sync** - Only user changes need persistence
3. **Instant rollback** - Discard workspace changes, keep base
4. **Efficient snapshots** - Base chunks never change, always deduplicated

### OverlayFS-like Design in Browser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Guest Linux Filesystem View                          │
│                                                                              │
│   /                                                                          │
│   ├── bin/         ─┐                                                        │
│   ├── lib/          │                                                        │
│   ├── usr/          ├── Immutable Base Layer (read-only)                    │
│   ├── etc/          │   From: eStargz CDN → cached in OPFS                  │
│   ├── opt/         ─┘                                                        │
│   │                                                                          │
│   └── workspace/   ─── Mutable Overlay (read-write)                         │
│       ├── .git/        From: OPFS via 9P mount                              │
│       ├── src/                                                               │
│       └── node_modules/                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Physical Storage Layout                              │
│                                                                              │
│   CDN (eStargz)                    OPFS (Browser)                           │
│   ─────────────                    ──────────────                           │
│                                                                              │
│   ┌─────────────────┐              ┌─────────────────────────────────────┐  │
│   │ codex-base.esgz │   ────────>  │ /base-cache/                        │  │
│   │                 │   (lazy)     │   ├── layers/                       │  │
│   │ • Layer 0-6    │              │   │   ├── 0-alpine.tar              │  │
│   │ • 400MB total  │              │   │   ├── 1-buildtools.tar          │  │
│   │ • TOC at end   │              │   │   └── ...                        │  │
│   │                 │              │   └── manifest.json                 │  │
│   └─────────────────┘              └─────────────────────────────────────┘  │
│                                                                              │
│                                    ┌─────────────────────────────────────┐  │
│                                    │ /workspace/                         │  │
│                                    │   ├── project-a/                    │  │
│                                    │   │   ├── src/                      │  │
│                                    │   │   └── package.json              │  │
│                                    │   └── project-b/                    │  │
│                                    │       └── main.py                   │  │
│                                    └─────────────────────────────────────┘  │
│                                                                              │
│                                    ┌─────────────────────────────────────┐  │
│                                    │ /snapshots/                         │  │
│                                    │   ├── cas/                          │  │
│                                    │   ├── manifests/                    │  │
│                                    │   └── profiles/                     │  │
│                                    └─────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Two 9P Mounts Strategy

```javascript
/**
 * Dual 9P Mount Configuration
 *
 * The guest sees a unified filesystem, but underneath:
 * - /base is read-only from eStargz cache
 * - /workspace is read-write to OPFS
 */

// In guest init (Go)
const MOUNTS = `
# Read-only base (eStargz cached layers)
mount -t 9p base /mnt/base -o ro,trans=virtio,version=9p2000.L

# Read-write workspace (OPFS persistence)
mount -t 9p workspace /mnt/workspace -o rw,trans=virtio,version=9p2000.L

# Bind mounts to create unified view
mount --bind /mnt/base/bin /bin
mount --bind /mnt/base/lib /lib
mount --bind /mnt/base/usr /usr
mount --bind /mnt/workspace /workspace
`;

// In JavaScript worker
class DualMount9PServer {
    constructor(baseFS, workspaceFS) {
        this.base = baseFS;      // Read-only, from eStargz cache
        this.workspace = workspaceFS;  // Read-write, to OPFS
    }

    handle9PMessage(tag, message) {
        // Route based on mount tag
        if (tag === 'base') {
            return this.base.handle(message);
        } else if (tag === 'workspace') {
            return this.workspace.handle(message);
        }
    }
}
```

### Copy-on-Write for System Files

When Codex needs to modify a system file (e.g., `/etc/hosts`):

```javascript
/**
 * COW Layer Manager
 *
 * Handles writes to "read-only" base files by copying to overlay.
 */
class COWLayerManager {
    constructor(baseFS, overlayFS) {
        this.base = baseFS;
        this.overlay = overlayFS;
        this.cowPaths = new Set();  // Paths that have been copied
    }

    read(path) {
        // Check overlay first (COW'd files)
        if (this.cowPaths.has(path)) {
            return this.overlay.readFile(path);
        }
        // Fall back to base
        return this.base.readFile(path);
    }

    write(path, data) {
        // If writing to base path, copy-on-write
        if (this.base.exists(path) && !this.cowPaths.has(path)) {
            // File exists in base, needs COW
            this.cowPaths.add(path);
        }
        // Always write to overlay
        return this.overlay.writeFile(path, data);
    }

    delete(path) {
        // Mark as deleted in overlay (whiteout)
        this.overlay.writeFile(path + '.whiteout', new Uint8Array(0));
        this.cowPaths.add(path);
    }

    listdir(path) {
        const baseEntries = this.base.readdir(path) || [];
        const overlayEntries = this.overlay.readdir(path) || [];

        // Merge, with overlay taking precedence
        const merged = new Map();
        for (const entry of baseEntries) {
            if (!this.overlay.exists(entry.path + '.whiteout')) {
                merged.set(entry.name, entry);
            }
        }
        for (const entry of overlayEntries) {
            if (!entry.name.endsWith('.whiteout')) {
                merged.set(entry.name, entry);
            }
        }

        return Array.from(merged.values());
    }
}
```

---

## Deep Dive: eStargz Integration

### Pre-built Codex Base Image

```dockerfile
# Dockerfile.codex-base
FROM debian:bookworm-slim

# Layer 0: Base system (already in debian:bookworm-slim)

# Layer 1: Build essentials
RUN apt-get update && apt-get install -y \
    build-essential cmake ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: Python
RUN apt-get update && apt-get install -y \
    python3.11 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Layer 3: Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Layer 4: Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Layer 5: Go
RUN curl -LO https://go.dev/dl/go1.22.0.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz \
    && rm go1.22.0.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

# Layer 6: Dev utilities
RUN apt-get update && apt-get install -y \
    git vim curl wget jq ripgrep fd-find \
    && rm -rf /var/lib/apt/lists/*

# Create workspace
RUN mkdir -p /workspace
WORKDIR /workspace
```

### Convert to eStargz

```bash
# Build and convert to eStargz format
docker build -t codex-base -f Dockerfile.codex-base .

# Convert with prioritization file (hot files first)
ctr-remote images optimize \
    --oci \
    --period=10 \
    codex-base \
    registry.example.com/codex-base:estargz

# The prioritization traces which files are accessed first during boot
# These go at the beginning of the archive for faster lazy load
```

### Lazy Layer Fetching

```javascript
/**
 * eStargz Layer Manager
 *
 * Lazy-loads container image layers from CDN.
 * Only fetches what's actually accessed.
 */
class EStargzLayerManager {
    constructor(baseUrl, cacheFS) {
        this.baseUrl = baseUrl;
        this.cache = cacheFS;
        this.toc = null;
        this.loadedChunks = new Set();
    }

    async init() {
        // Fetch TOC (last 51 bytes has offset, then fetch TOC)
        const footer = await this.fetchRange(-51, 51);
        const tocOffset = this.parseTocOffset(footer);
        const tocData = await this.fetchRange(tocOffset, -1);
        this.toc = JSON.parse(new TextDecoder().decode(tocData));

        console.log(`[eStargz] Loaded TOC: ${this.toc.entries.length} entries`);
    }

    async fetchRange(start, length) {
        const headers = {};
        if (start < 0) {
            // Negative = from end
            headers['Range'] = `bytes=${start}`;
        } else if (length < 0) {
            // To end
            headers['Range'] = `bytes=${start}-`;
        } else {
            headers['Range'] = `bytes=${start}-${start + length - 1}`;
        }

        const response = await fetch(this.baseUrl, { headers });
        return new Uint8Array(await response.arrayBuffer());
    }

    /**
     * Get file content by path
     */
    async getFile(path) {
        // Check cache first
        const cached = this.cache.readFile(`/base-cache/files${path}`);
        if (cached) return cached;

        // Find in TOC
        const entry = this.toc.entries.find(e => e.name === path.slice(1));
        if (!entry) return null;

        // Fetch and decompress chunk
        const compressed = await this.fetchRange(entry.offset, entry.chunkSize);
        const data = pako.ungzip(compressed);

        // Cache for next time
        this.cache.mkdir(`/base-cache/files${path.substring(0, path.lastIndexOf('/'))}`);
        this.cache.writeFile(`/base-cache/files${path}`, data);

        return data;
    }

    /**
     * Prefetch critical files for faster boot
     */
    async prefetchCritical() {
        // Files needed for shell startup
        const criticalPaths = [
            '/bin/sh', '/bin/bash',
            '/lib/x86_64-linux-gnu/libc.so.6',
            '/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
            '/usr/bin/python3',
            '/usr/bin/node',
        ];

        // Batch fetch in parallel
        await Promise.all(criticalPaths.map(p => this.getFile(p)));
        console.log('[eStargz] Critical files prefetched');
    }
}
```

---

## Deep Dive: Workspace Sync Strategy

### Real-time Sync vs Batch Sync

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Workspace Sync Strategies                            │
│                                                                              │
│   Option A: Real-time Sync                Option B: Batch Sync              │
│   ─────────────────────                   ────────────────────              │
│                                                                              │
│   File write in VM                        File write in VM                  │
│         │                                       │                            │
│         ▼                                       ▼                            │
│   9P Twrite message                       Memory buffer                     │
│         │                                       │                            │
│         ▼                                       │ (batch)                    │
│   OPFS writeFileSync                            ▼                            │
│         │                                  Periodic flush                    │
│         ▼                                  (every 5s or on idle)            │
│   Persistent immediately                        │                            │
│                                                 ▼                            │
│   ✓ No data loss                          OPFS batch write                  │
│   ✗ Slower writes                               │                            │
│                                                 ▼                            │
│                                           ✓ Faster writes                   │
│                                           ✗ Potential data loss             │
│                                                                              │
│   Recommendation: Hybrid                                                     │
│   - Real-time for small files (<1MB)                                         │
│   - Batch for large writes (builds, npm install)                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hybrid Sync Implementation

```javascript
/**
 * Hybrid Workspace Sync
 *
 * Balances durability vs performance:
 * - Small files: sync immediately
 * - Large files: buffer and batch
 * - Critical paths: always sync
 */
class HybridWorkspaceSync {
    constructor(fs) {
        this.fs = fs;
        this.writeBuffer = new Map();  // path -> { data, timestamp }
        this.SMALL_FILE_THRESHOLD = 64 * 1024;  // 64KB
        this.BATCH_INTERVAL = 5000;  // 5 seconds
        this.CRITICAL_PATHS = ['.git/', 'package.json', 'Cargo.toml', 'pyproject.toml'];

        // Start batch flush timer
        this.startBatchFlush();
    }

    write(path, data, offset = 0) {
        const isSmall = data.length < this.SMALL_FILE_THRESHOLD;
        const isCritical = this.CRITICAL_PATHS.some(p => path.includes(p));

        if (isSmall || isCritical) {
            // Sync immediately
            return this.syncWrite(path, data, offset);
        } else {
            // Buffer for batch
            return this.bufferWrite(path, data, offset);
        }
    }

    syncWrite(path, data, offset) {
        // Clear any buffered data for this path
        this.writeBuffer.delete(path);

        // Write immediately to OPFS
        if (offset === 0) {
            return this.fs.writeFile(path, data);
        } else {
            return this.fs.writePartial(path, offset, data);
        }
    }

    bufferWrite(path, data, offset) {
        // Add to buffer
        let existing = this.writeBuffer.get(path) || { data: new Uint8Array(0), offset: 0 };

        if (offset === 0) {
            existing = { data, timestamp: Date.now() };
        } else {
            // Merge with existing buffer
            const newSize = Math.max(existing.data.length, offset + data.length);
            const merged = new Uint8Array(newSize);
            merged.set(existing.data);
            merged.set(data, offset);
            existing = { data: merged, timestamp: Date.now() };
        }

        this.writeBuffer.set(path, existing);
        return data.length;  // Return immediately
    }

    async flush() {
        if (this.writeBuffer.size === 0) return;

        console.log(`[Sync] Flushing ${this.writeBuffer.size} buffered files`);

        for (const [path, { data }] of this.writeBuffer) {
            this.fs.writeFile(path, data);
        }

        this.writeBuffer.clear();
    }

    startBatchFlush() {
        setInterval(() => this.flush(), this.BATCH_INTERVAL);

        // Also flush on page visibility change
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.flush();
                }
            });
        }

        // Flush before unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                this.flush();
            });
        }
    }
}
```

---

## Deep Dive: Build Artifact Caching

### Dependency Cache Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Dependency Caching                                   │
│                                                                              │
│   Language        Cache Location           Strategy                          │
│   ────────        ──────────────           ────────                          │
│   Node.js         /workspace/.npm-cache    Hash package-lock.json           │
│   Python          /workspace/.venv         Hash requirements.txt            │
│   Rust            /workspace/.cargo        Hash Cargo.lock                  │
│   Go              /workspace/.go-cache     Hash go.sum                      │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Cache Deduplication                               │   │
│   │                                                                      │   │
│   │   Project A: package-lock.json → hash: abc123                       │   │
│   │   Project B: package-lock.json → hash: abc123  (same!)              │   │
│   │                                                                      │   │
│   │   Cache: /dep-cache/npm/abc123/ ──┬──> Project A: node_modules/     │   │
│   │                                   └──> Project B: node_modules/     │   │
│   │                                                                      │   │
│   │   Storage: Only one copy in OPFS                                     │   │
│   │   Restore: Symlink or fast copy to workspace                        │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```javascript
/**
 * Dependency Cache Manager
 *
 * Content-addressed caching for package dependencies.
 * Dramatically speeds up project switching.
 */
class DependencyCache {
    constructor(fs) {
        this.fs = fs;
        this.cacheBase = '/dep-cache';
        this.fs.mkdir(this.cacheBase);
    }

    /**
     * Get cache key from lockfile
     */
    async getCacheKey(lockfilePath) {
        const content = this.fs.readFile(lockfilePath);
        if (!content) return null;

        // Hash first 1MB (lockfiles can be large)
        const toHash = content.subarray(0, 1024 * 1024);
        const hashBuffer = await crypto.subtle.digest('SHA-256', toHash);
        return Array.from(new Uint8Array(hashBuffer).subarray(0, 8))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Restore cached dependencies
     */
    async restore(projectPath, type) {
        const lockfiles = {
            'npm': 'package-lock.json',
            'yarn': 'yarn.lock',
            'pip': 'requirements.txt',
            'cargo': 'Cargo.lock',
            'go': 'go.sum'
        };

        const lockfile = lockfiles[type];
        if (!lockfile) return false;

        const lockfilePath = `${projectPath}/${lockfile}`;
        const cacheKey = await this.getCacheKey(lockfilePath);
        if (!cacheKey) return false;

        const cachePath = `${this.cacheBase}/${type}/${cacheKey}`;
        if (!this.fs.exists(cachePath)) {
            console.log(`[DepCache] No cache for ${type}:${cacheKey}`);
            return false;
        }

        // Copy cached deps to project
        const targetDirs = {
            'npm': 'node_modules',
            'yarn': 'node_modules',
            'pip': '.venv',
            'cargo': 'target',
            'go': 'vendor'
        };

        const targetDir = `${projectPath}/${targetDirs[type]}`;
        await this.copyDir(cachePath, targetDir);

        console.log(`[DepCache] Restored ${type} deps from cache`);
        return true;
    }

    /**
     * Save dependencies to cache
     */
    async save(projectPath, type) {
        const lockfiles = {
            'npm': 'package-lock.json',
            'pip': 'requirements.txt',
            'cargo': 'Cargo.lock',
            'go': 'go.sum'
        };

        const depDirs = {
            'npm': 'node_modules',
            'pip': '.venv',
            'cargo': 'target',
            'go': 'vendor'
        };

        const lockfilePath = `${projectPath}/${lockfiles[type]}`;
        const cacheKey = await this.getCacheKey(lockfilePath);
        if (!cacheKey) return false;

        const cachePath = `${this.cacheBase}/${type}/${cacheKey}`;
        const depPath = `${projectPath}/${depDirs[type]}`;

        if (this.fs.exists(cachePath)) {
            console.log(`[DepCache] Cache already exists for ${type}:${cacheKey}`);
            return true;
        }

        // Save to cache
        await this.copyDir(depPath, cachePath);
        console.log(`[DepCache] Saved ${type} deps to cache`);
        return true;
    }

    async copyDir(src, dst) {
        this.fs.mkdir(dst);
        const entries = this.fs.readdir(src);

        for (const entry of entries) {
            const srcPath = `${src}/${entry.name}`;
            const dstPath = `${dst}/${entry.name}`;

            if (entry.isDirectory) {
                await this.copyDir(srcPath, dstPath);
            } else {
                const data = this.fs.readFile(srcPath);
                if (data) {
                    this.fs.writeFile(dstPath, data);
                }
            }
        }
    }
}
```

---

## Deep Dive: Timing Breakdown

### Target: <1s to Interactive

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Startup Timing Breakdown                             │
│                                                                              │
│   Phase                          Target     Technique                        │
│   ─────                          ──────     ─────────                        │
│                                                                              │
│   1. Page load                   200ms      Service Worker cache             │
│   2. Worker init                  50ms      Minimal JS, defer non-critical   │
│   3. OPFS connect                 20ms      happy-opfs sync agent            │
│   4. Check snapshot               10ms      manifest.json exists?            │
│   5. Load TOC + CPU + devices    100ms      Always immediate                 │
│   6. Start VM execution           50ms      Lazy memory, prefetch in bg      │
│   7. Shell ready                 200ms      Pre-booted to shell prompt       │
│   ─────────────────────────────────────                                      │
│   Total                          630ms      ✓ Under 1s target                │
│                                                                              │
│   Background (non-blocking):                                                 │
│   - Memory prefetch             1-3s        Based on boot profile            │
│   - eStargz layer fetch         2-5s        Only if cache miss               │
│   - Workspace sync check         50ms       Verify OPFS state                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Optimization Techniques

```javascript
/**
 * Startup Optimizer
 *
 * Coordinates all initialization for minimum time-to-interactive.
 */
class StartupOptimizer {
    constructor() {
        this.timings = {};
    }

    async optimizedStartup(options = {}) {
        const t0 = performance.now();

        // Phase 1-3: Parallel initialization
        const [opfs, worker] = await Promise.all([
            this.time('opfs_connect', () => initOPFS()),
            this.time('worker_init', () => initWorker())
        ]);

        // Phase 4: Quick snapshot check
        const hasSnapshot = await this.time('snapshot_check', () =>
            opfs.s1.exists('/snapshots/manifests/current.json')
        );

        if (hasSnapshot) {
            // Phase 5: Load critical state
            const [toc, cpu, devices] = await this.time('load_state', () =>
                Promise.all([
                    this.loadTOC(opfs.s1),
                    this.loadCPU(opfs.s1),
                    this.loadDevices(opfs.s1)
                ])
            );

            // Phase 6: Start VM with lazy memory
            await this.time('vm_start', () =>
                this.startVMWithLazyMemory(worker, { toc, cpu, devices })
            );

            // Background: Prefetch
            this.prefetchInBackground(opfs.s1, toc);

        } else {
            // Cold start: boot from eStargz
            await this.time('cold_boot', () =>
                this.coldBootFromEStargz(worker, opfs)
            );
        }

        // Phase 7: Wait for shell ready
        await this.time('shell_ready', () =>
            this.waitForShellPrompt(worker)
        );

        const total = performance.now() - t0;
        console.log(`[Startup] Complete in ${total.toFixed(0)}ms`);
        console.table(this.timings);

        return total;
    }

    async time(name, fn) {
        const start = performance.now();
        const result = await fn();
        this.timings[name] = performance.now() - start;
        return result;
    }

    startVMWithLazyMemory(worker, state) {
        // Don't wait for full memory load
        // Just restore CPU + devices and start
        worker.postMessage({
            type: 'restore-lazy',
            cpu: state.cpu,
            devices: state.devices,
            toc: state.toc
        });

        // Memory pages load on-demand via page faults
        return Promise.resolve();
    }

    prefetchInBackground(fs, toc) {
        // Non-blocking prefetch using idle callback
        if ('requestIdleCallback' in self) {
            requestIdleCallback(() => {
                const profile = fs.readFile('/snapshots/profiles/boot.json');
                if (profile) {
                    const hashes = JSON.parse(new TextDecoder().decode(profile));
                    this.prefetchChunks(fs, hashes);
                }
            });
        }
    }

    async prefetchChunks(fs, hashes) {
        for (const hash of hashes) {
            // Load into CAS cache
            const path = `/snapshots/cas/${hash.slice(0, 2)}/${hash}.gz`;
            fs.readFile(path);  // Side effect: populates cache

            // Yield to main thread
            await new Promise(r => setTimeout(r, 0));
        }
    }

    waitForShellPrompt(worker) {
        return new Promise(resolve => {
            const handler = (e) => {
                if (e.data.type === 'shell-ready') {
                    worker.removeEventListener('message', handler);
                    resolve();
                }
            };
            worker.addEventListener('message', handler);
        });
    }
}
```

---

## Complete XL-Lite File Structure

```
container2wasm/
├── examples/wasi-browser/htdocs/
│   ├── index.html                     # UI with snapshot controls
│   ├── worker.js                      # Main emulator worker
│   ├── xl-lite/                       # XL-Lite module
│   │   ├── index.js                   # Main exports
│   │   ├── cas.js                     # Content-Addressed Store
│   │   ├── delta.js                   # Delta snapshot computer
│   │   ├── prefetch.js                # Prefetch engine
│   │   ├── manager.js                 # XL-Lite manager
│   │   ├── overlay-fs.js              # COW overlay filesystem
│   │   ├── estargz.js                 # eStargz layer manager
│   │   ├── workspace-sync.js          # Hybrid sync strategy
│   │   ├── dep-cache.js               # Dependency caching
│   │   └── startup.js                 # Startup optimizer
│   │
│   ├── opfs-fs-backend.js             # S1 OPFS layer
│   ├── opfs-worker.js                 # happy-opfs sync agent
│   ├── 9p.js                          # v86 9P server (M1)
│   └── ...
│
├── extras/
│   └── codex-base/                    # Codex base image
│       ├── Dockerfile                 # Multi-language dev environment
│       └── build-estargz.sh           # Convert to eStargz
│
└── docs/
    ├── XL_LITE_DESIGN.md              # This document
    ├── OPFS_INTEGRATION.md
    └── SNAPSHOT_OPFS_INTEGRATION.md
```

---

## Implementation Roadmap

```
Week 1-2: Core Infrastructure
├── [ ] ContentAddressedStore
├── [ ] DeltaComputer
├── [ ] Basic manifest format
└── [ ] Integration tests

Week 3-4: Snapshot Restore
├── [ ] Lazy memory loading
├── [ ] Boot profile recording
├── [ ] Prefetch engine
└── [ ] Startup optimizer

Week 5-6: Overlay Filesystem
├── [ ] Dual 9P mount
├── [ ] COW layer manager
├── [ ] eStargz integration
└── [ ] Base image creation

Week 7-8: Workspace Persistence
├── [ ] Hybrid sync strategy
├── [ ] Dependency cache
├── [ ] Project switching
└── [ ] End-to-end testing

Total: ~8 weeks, ~3,000 LOC
```

---

## Benchmark Targets

| Metric | WebVM | XL-Lite Target | Method |
|--------|-------|----------------|--------|
| Cold start | 5-10s | 2-3s | eStargz + prefetch |
| Warm start | 5-10s | <1s | Snapshot restore |
| Shell ready | 5-10s | <1s | Pre-booted snapshot |
| `npm install` (cached) | Full time | <5s | Dependency cache |
| `python script.py` | 2-3s | <500ms | Interpreter in memory |
| Page refresh | Full reload | <1s | Snapshot + workspace persist |
| Storage (256MB VM) | N/A | 100-150MB | Deduplication + compression |

---

## Drop-in Components from GitHub

These existing projects can be used as drop-in replacements to reduce implementation effort:

### Filesystem Layer

| Component | Project | Stars | Use For |
|-----------|---------|-------|---------|
| **Overlay/Union FS** | [BrowserFS/ZenFS](https://github.com/jvilk/BrowserFS) | 3k+ | `MountableFileSystem` + `OverlayFS` for COW layer |
| **OPFS + unionfs** | [memfs](https://github.com/streamich/memfs) | 1.5k+ | In-memory fs + OPFS adapter + unionfs |
| **OPFS wrapper** | [@componentor/fs](https://www.npmjs.com/package/@componentor/fs) | - | Node.js-compatible OPFS, isomorphic-git ready |
| **Sync OPFS** | [happy-opfs](https://github.com/aspect-build/aspect-cli) | - | Synchronous OPFS via SharedArrayBuffer |

**Recommendation**: Use **memfs** for unionfs + OPFS adapter, or **ZenFS** (BrowserFS successor) for overlay support.

```javascript
// ZenFS OverlayFS example
import { configure, OverlayFS, InMemory } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';

await configure({
    mounts: {
        '/': {
            backend: OverlayFS,
            readable: { backend: OPFS, handle: await navigator.storage.getDirectory() },
            writable: { backend: InMemory }
        }
    }
});
```

### Compression

| Component | Project | Size | Speed | Use For |
|-----------|---------|------|-------|---------|
| **fflate** | [101arrowz/fflate](https://github.com/101arrowz/fflate) | 8-29KB | Fastest JS | Default compression |
| **pako** | [nodeca/pako](https://github.com/nodeca/pako) | 45KB | Good | Compatible fallback |
| **zstd-wasm** | [bokuweb/zstd-wasm](https://github.com/bokuweb/zstd-wasm) | 400KB | Best ratio | Large snapshots (XL) |
| **wasm-flate** | [drbh/wasm-flate](https://github.com/drbh/wasm-flate) | WASM | 7x pako | High-performance |

**Recommendation**: Start with **fflate** (smallest, fastest pure JS). Move to **zstd-wasm** for better compression ratios on large snapshots.

```javascript
// fflate example - 8KB gzipped
import { gzip, gunzip } from 'fflate';

const compressed = gzip(data);
const decompressed = gunzip(compressed);
```

### Content-Addressed Storage / Deduplication

| Component | Project | Use For |
|-----------|---------|---------|
| **Chunking** | [ronomon/deduplication](https://github.com/ronomon/deduplication) | Content-dependent chunking (1.5GB/s) |
| **Rolling hash** | [loveencounterflow/buzhash-demo](https://github.com/loveencounterflow/buzhash-demo) | Variable-size chunk boundaries |

**Note**: For XL-Lite's fixed-size chunks (4MB), we don't need rolling hash. Simple SHA-256 + fixed chunking is sufficient.

### WASM State Serialization

| Component | Project | Use For |
|-----------|---------|---------|
| **wasm-persist** | [dfinity-side-projects/wasm-persist](https://github.com/dfinity-side-projects/wasm-persist) | Orthogonally persistent WASM instances |
| **wasmbox** | [jamsocket/wasmbox](https://github.com/jamsocket/wasmbox) | Serializable WASM state snapshots |
| **v86 state.js** | [copy/v86](https://github.com/copy/v86/blob/master/src/state.js) | Production-tested VM state save/restore |

**Recommendation**: Use **v86's state.js patterns** - already production-tested for x86 emulator state.

```javascript
// v86 pattern - already handles CPU, memory, devices
CPU.prototype.save_state = function() {
    return {
        regs: this.reg32,
        flags: this.flags,
        memory: new Uint8Array(this.memory.buffer),
        // ... device state
    };
};
```

### Tar/Archive Handling

| Component | Project | Use For |
|-----------|---------|---------|
| **modern-tar** | [ayuhito/modern-tar](https://github.com/ayuhito/modern-tar) | Zero-dep streaming tar, Web Streams API |
| **js-untar** | [InvokIT/js-untar](https://github.com/InvokIT/js-untar) | Browser tar extraction (Web Worker) |
| **tar-stream** | [mafintosh/tar-stream](https://www.npmjs.com/package/tar-stream) | Node.js streaming tar |

**Recommendation**: Use **modern-tar** for browser (zero-dep, Web Streams) or **js-untar** for simple extraction.

```javascript
// modern-tar example
import { Untar } from 'modern-tar';
import { gunzip } from 'fflate';

const response = await fetch('layer.tar.gz');
const decompressed = gunzip(new Uint8Array(await response.arrayBuffer()));
const untar = new Untar(decompressed);

for await (const entry of untar) {
    console.log(entry.name, entry.size);
    const content = await entry.read();
}
```

### Git in Browser

| Component | Project | Use For |
|-----------|---------|---------|
| **isomorphic-git** | [isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) | Full git implementation |
| **lightning-fs** | [isomorphic-git/lightning-fs](https://github.com/isomorphic-git/lightning-fs) | IndexedDB filesystem for git |

**Recommendation**: Use **isomorphic-git** with **@componentor/fs** for OPFS-backed git repos in workspace.

### Related: WebContainers

StackBlitz's [WebContainers](https://github.com/stackblitz/webcontainer-core) provides a full browser-based Node.js runtime with:
- Virtual file system in memory
- Virtualized TCP network stack
- Native npm/pnpm/yarn in browser
- Security sandbox

**Note**: WebContainers is proprietary (not open source core). But their architecture validates XL-Lite's approach:
- OPFS for persistence
- Virtual FS with overlay
- SharedArrayBuffer for sync I/O

---

## Recommended Stack

Based on the drop-in analysis, here's the recommended technology stack:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         XL-Lite Technology Stack                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Application Layer                                                   │    │
│  │  • XL-Lite Manager (custom)                                          │    │
│  │  • Startup Optimizer (custom)                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Snapshot Layer                                                      │    │
│  │  • CAS: SHA-256 + fixed 4MB chunks (custom, simple)                 │    │
│  │  • Compression: fflate (drop-in)                                     │    │
│  │  • State serialization: v86 patterns (reference)                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Filesystem Layer                                                    │    │
│  │  • Overlay: ZenFS OverlayFS (drop-in)                               │    │
│  │  • OPFS: happy-opfs or @componentor/fs (drop-in)                    │    │
│  │  • 9P server: v86 lib/9p.js (drop-in)                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  eStargz Layer                                                       │    │
│  │  • Tar parsing: modern-tar (drop-in)                                 │    │
│  │  • TOC format: custom (follows eStargz spec)                         │    │
│  │  • HTTP Range: fetch API (native)                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Storage Layer                                                       │    │
│  │  • OPFS: FileSystemSyncAccessHandle (native)                        │    │
│  │  • IndexedDB: fallback (native)                                      │    │
│  │  • Service Worker: cache API (native)                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Bundle Size Estimate

| Component | Size (gzip) |
|-----------|-------------|
| fflate | 8KB |
| ZenFS core + OPFS | ~15KB |
| modern-tar | ~5KB |
| v86 9p.js | ~10KB |
| happy-opfs | ~8KB |
| XL-Lite custom code | ~15KB |
| **Total** | **~61KB** |

Compare to: pako alone = 45KB, WebContainers = proprietary

---

## Code Reduction with Drop-ins

| Component | Custom LOC | With Drop-in | Savings |
|-----------|------------|--------------|---------|
| OverlayFS | ~500 | ~50 (config) | 90% |
| Compression | ~200 | ~10 (import) | 95% |
| Tar parsing | ~400 | ~20 (import) | 95% |
| 9P server | ~800 | ~100 (adapter) | 87% |
| OPFS wrapper | ~300 | ~30 (import) | 90% |
| **Total** | **~2,200** | **~210** | **90%** |

Remaining custom code: ~800 LOC
- XL-Lite Manager: ~300
- CAS (simple): ~150
- Prefetch engine: ~150
- Startup optimizer: ~200

**Final estimate: ~1,000 LOC custom + ~61KB dependencies**

---

## Impact on OPFS S1/M1/L1 Projects

The drop-in components significantly change the S1/M1/L1 implementation strategy:

### Before: Original Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Original S1/M1/L1 Design                             │
│                                                                              │
│  S1: Emulator WASI → OPFS                                                    │
│      └── happy-opfs (sync wrapper)                                           │
│          └── Custom OPFSDirectory/OPFSFile classes                           │
│                                                                              │
│  M1: Guest 9P → OPFS (JavaScript)                                            │
│      └── v86 lib/9p.js (9P protocol)                                         │
│          └── Custom OPFSFilesystem adapter (~80 LOC)                         │
│              └── happy-opfs (sync wrapper)                                   │
│                                                                              │
│  L1: Guest 9P → OPFS (Rust)                                                  │
│      └── Custom Rust 9P server (~1,500 LOC)                                  │
│          └── tokio-fs-ext (native sync OPFS)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### After: With Drop-ins

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Revised S1/M1/L1 Design                              │
│                                                                              │
│  S1: Emulator WASI → OPFS                                                    │
│      └── ZenFS with OPFS backend (drop-in)                                   │
│          └── Node.js fs-compatible API                                       │
│          └── Built-in OverlayFS support                                      │
│                                                                              │
│  M1: Guest 9P → OPFS (JavaScript)                                            │
│      └── v86 lib/9p.js (9P protocol, drop-in)                               │
│          └── ZenFS OverlayFS (drop-in)                                      │
│              ├── readable: eStargz base layer                                │
│              └── writable: OPFS workspace                                    │
│                                                                              │
│  L1: Guest 9P → OPFS (Rust) - OPTIONAL now                                  │
│      └── May not be needed if M1 + ZenFS is fast enough                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Impact Analysis

#### S1: Emulator WASI → OPFS

| Aspect | Original | With Drop-ins |
|--------|----------|---------------|
| **Sync wrapper** | happy-opfs (custom integration) | ZenFS OPFS backend or @componentor/fs |
| **FS API** | Custom OPFSDirectory/OPFSFile | Standard Node.js fs API |
| **Git support** | Would need separate integration | @componentor/fs is "isomorphic-git ready" |
| **Overlay support** | Not included | Built into ZenFS |
| **LOC** | ~200 | ~30 (config only) |

**Recommendation**: Replace happy-opfs with **@componentor/fs** for S1:
- Node.js `fs/promises` compatible
- Works with isomorphic-git out of the box
- Simpler integration

```javascript
// Before (happy-opfs)
import { readFileSync, writeFileSync } from 'happy-opfs';
const data = readFileSync('/path').unwrap();

// After (@componentor/fs)
import OPFS from '@componentor/fs';
const fs = new OPFS({ workerUrl: '...' });
await fs.ready();
const data = await fs.readFile('/path');
```

#### M1: Guest 9P → OPFS (JavaScript)

| Aspect | Original | With Drop-ins |
|--------|----------|---------------|
| **9P server** | v86 lib/9p.js | v86 lib/9p.js (same) |
| **FS backend** | Custom OPFSFilesystem adapter | ZenFS OverlayFS |
| **COW layer** | Would need custom implementation | Built into ZenFS OverlayFS |
| **Base layer** | Not supported | Read from eStargz cache |
| **LOC** | ~80 adapter + ~500 COW | ~50 (config only) |

**Recommendation**: Use **ZenFS OverlayFS** as the filesystem backend for v86's 9p.js:

```javascript
// Before: Custom adapter
class OPFSFilesystem {
    constructor(rootPath) {
        this.rootPath = rootPath;
        mkdirSync(rootPath);
    }
    read(path, offset, length) { /* 20 lines */ }
    write(path, data, offset) { /* 15 lines */ }
    // ... 50 more lines
}

// After: ZenFS drop-in
import { configure, OverlayFS } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';

await configure({
    mounts: {
        '/': {
            backend: OverlayFS,
            readable: eStargzBaseFS,   // Immutable base from CDN
            writable: await OPFS.create({ handle: await navigator.storage.getDirectory() })
        }
    }
});

// v86 9p.js uses standard fs API - ZenFS provides it
import { fs } from '@zenfs/core';
const virtio9p = new Virtio9p(fs);  // Works directly!
```

#### L1: Guest 9P → OPFS (Rust)

| Aspect | Original | With Drop-ins |
|--------|----------|---------------|
| **Need** | Performance critical path | May be unnecessary |
| **Complexity** | ~1,500 LOC Rust | Skip entirely |
| **Build** | wasm-pack, separate WASM | None |

**Recommendation**: **Defer L1** until M1 + ZenFS is proven insufficient:

1. ZenFS uses native browser APIs (including OPFS)
2. Performance difference may be negligible for dev workloads
3. Rust WASM adds build complexity
4. If needed later, L1 can still be added

### Revised Project Scope

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Revised Implementation Plan                          │
│                                                                              │
│  BEFORE                              AFTER                                   │
│  ──────                              ─────                                   │
│                                                                              │
│  S1: ~200 LOC                        S1: ~30 LOC (config)                   │
│      happy-opfs integration              @componentor/fs or ZenFS OPFS      │
│      Custom Directory/File                                                   │
│                                                                              │
│  M1: ~580 LOC                        M1: ~50 LOC (config)                   │
│      Custom OPFSFilesystem               ZenFS OverlayFS                    │
│      Custom COW layer                    v86 9p.js (unchanged)              │
│                                                                              │
│  L1: ~1,500 LOC                      L1: DEFERRED                           │
│      Full Rust 9P server                 Revisit if M1 too slow             │
│      tokio-fs-ext                                                            │
│                                                                              │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Total: ~2,280 LOC                   Total: ~80 LOC                         │
│                                      Reduction: 96%                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Architecture Changes

#### 1. Unified FS Layer

Instead of separate S1/M1 implementations, use single ZenFS instance:

```javascript
// Single filesystem configuration for both S1 and M1
import { configure, OverlayFS, InMemory } from '@zenfs/core';
import { OPFS } from '@zenfs/opfs';

const opfsHandle = await navigator.storage.getDirectory();

await configure({
    mounts: {
        // S1: Emulator's own storage (snapshots, config)
        '/emulator': { backend: OPFS, handle: opfsHandle.getDirectory('emulator') },

        // M1: Guest VM overlay (base + workspace)
        '/guest': {
            backend: OverlayFS,
            readable: eStargzBaseLayer,  // Read-only base
            writable: { backend: OPFS, handle: opfsHandle.getDirectory('workspace') }
        }
    }
});
```

#### 2. v86 9p.js Integration

v86's 9p.js expects a filesystem with standard operations. ZenFS provides exactly this:

```javascript
import { Virtio9p } from './9p.js';
import { fs } from '@zenfs/core';

// ZenFS fs module is Node.js compatible
// v86 9p.js can use it directly
class ZenFS9PBackend {
    read(path, offset, length) {
        const buffer = Buffer.alloc(length);
        const fd = fs.openSync(path, 'r');
        fs.readSync(fd, buffer, 0, length, offset);
        fs.closeSync(fd);
        return buffer;
    }

    write(path, data, offset) {
        const fd = fs.openSync(path, 'a');
        fs.writeSync(fd, data, 0, data.length, offset);
        fs.closeSync(fd);
        return data.length;
    }

    // ... other ops map directly to fs.*Sync methods
}
```

#### 3. eStargz as Read-Only Base

ZenFS OverlayFS readable layer can be backed by eStargz:

```javascript
class EStargzReadOnlyFS {
    constructor(layerManager) {
        this.layers = layerManager;  // EStargzLayerManager from XL-Lite
    }

    readFileSync(path) {
        return this.layers.getFileSync(path);  // Lazy load from CDN/cache
    }

    existsSync(path) {
        return this.layers.exists(path);
    }

    // Read-only: write operations throw
    writeFileSync() { throw new Error('Read-only filesystem'); }
}

// Use as readable layer in OverlayFS
await configure({
    mounts: {
        '/guest': {
            backend: OverlayFS,
            readable: new EStargzReadOnlyFS(eStargzManager),
            writable: { backend: OPFS }
        }
    }
});
```

### Updated Dependency List

| Original Plan | New Plan | Change |
|--------------|----------|--------|
| happy-opfs | @componentor/fs or ZenFS | Replaced |
| Custom OPFSFilesystem | ZenFS | Replaced |
| Custom COW layer | ZenFS OverlayFS | Replaced |
| tokio-fs-ext (Rust) | Deferred | Removed |
| v86 lib/9p.js | v86 lib/9p.js | Kept |

### Migration Path

```
Week 1: Replace S1
├── Remove happy-opfs custom integration
├── Add @zenfs/core + @zenfs/opfs
├── Configure OPFS mount for /emulator
└── Test emulator file operations

Week 2: Replace M1
├── Add ZenFS OverlayFS configuration
├── Create EStargzReadOnlyFS adapter (~50 LOC)
├── Wire v86 9p.js to use ZenFS backend
└── Test guest filesystem operations

Week 3: Integration
├── End-to-end test: emulator + guest + persistence
├── Performance benchmarking vs original plan
└── Decide on L1 necessity
```

### Performance Consideration

If M1 with ZenFS proves too slow for heavy I/O (unlikely for dev workloads), L1 can be added later:

```
Decision tree:
1. Implement M1 with ZenFS
2. Benchmark: file reads/writes, npm install, git operations
3. If <100ms latency on typical ops → Keep M1, skip L1
4. If >100ms latency → Implement L1 for hot paths only
```

Most Codex workloads (editing files, running tests, git) won't stress the I/O path enough to need Rust-level performance.
