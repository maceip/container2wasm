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
