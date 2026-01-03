import { writeFileSync, readFileSync, mkdirSync, readDirSync, removeSync } from 'happy-opfs';

/**
 * VM Snapshot Manager - ESM version
 *
 * Provides two snapshot formats:
 * - v1 (Project S): Basic single-file WASM memory snapshot
 * - v2 (Project M): Chunked snapshots with compression and TOC
 */

// ============================================================
// Configuration Constants
// ============================================================

export const SNAPSHOT_CHUNK_SIZE = 4 * 1024 * 1024;  // 4MB chunks
export const SNAPSHOT_VERSION_V1 = 1;
export const SNAPSHOT_VERSION_V2 = 2;
const SNAPSHOT_DIR = '/emulator/snapshots';
let pakoPromise = null;

async function getPako() {
    if (typeof self !== 'undefined' && self.pako) {
        return self.pako;
    }
    if (!pakoPromise) {
        pakoPromise = import('https://esm.sh/pako@2.1.0')
            .then((mod) => mod.default || mod)
            .catch((err) => {
                throw new Error(`pako unavailable for snapshot compression: ${err?.message || err}`);
            });
    }
    return pakoPromise;
}

function removePath(path) {
    const res = removeSync(path);
    if (res.isErr()) {
        console.warn(`[Snapshot] Failed to remove ${path}:`, res.error);
    }
}

// ============================================================
// Global WASI Reference
// ============================================================

let globalWasiInstance = null;

export function setWasiInstance(wasi) {
    globalWasiInstance = wasi;
}

export function getWasiInstance() {
    return globalWasiInstance;
}

// ============================================================
// OPFS Utilities
// ============================================================

export async function initSnapshotDir() {
    // happy-opfs sync API; ensure directory exists
    const result = mkdirSync(SNAPSHOT_DIR);
    return result.isOk() || result.error?.code === 'AlreadyExists';
}

// ============================================================
// v1 (Project S) - Basic Snapshot Functions
// ============================================================

export async function takeSnapshotV1(name = 'vm') {
    if (!globalWasiInstance || !globalWasiInstance.inst) {
        return { success: false, size: 0, error: 'WASI instance not initialized' };
    }

    try {
        const memory = globalWasiInstance.inst.exports.memory;
        const memoryData = new Uint8Array(memory.buffer);
        await initSnapshotDir();

        // Header: [version(4)] [memorySize(8)] [timestamp(8)] = 20 bytes
        const headerSize = 20;
        const header = new ArrayBuffer(headerSize);
        const headerView = new DataView(header);
        headerView.setUint32(0, SNAPSHOT_VERSION_V1, true);
        headerView.setBigUint64(4, BigInt(memoryData.length), true);
        headerView.setBigUint64(12, BigInt(Date.now()), true);

        const payload = new Uint8Array(headerSize + memoryData.length);
        payload.set(new Uint8Array(header), 0);
        payload.set(memoryData, headerSize);

        const target = `${SNAPSHOT_DIR}/${name}.bin`;
        const writeRes = writeFileSync(target, payload);
        if (writeRes.isErr()) {
            return { success: false, size: 0, error: writeRes.error?.message || 'Failed to write snapshot' };
        }

        const totalSize = payload.length;
        console.log(`[Snapshot v1] Saved '${name}': ${totalSize} bytes (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

        return { success: true, size: totalSize, version: SNAPSHOT_VERSION_V1, path: target };
    } catch (err) {
        console.error('[Snapshot v1] Failed to take snapshot:', err);
        return { success: false, size: 0, error: err.message };
    }
}

export async function restoreSnapshotV1(name = 'vm') {
    if (!globalWasiInstance || !globalWasiInstance.inst) {
        return { success: false, size: 0, error: 'WASI instance not initialized' };
    }

    try {
        const memory = globalWasiInstance.inst.exports.memory;
        const fileName = `${SNAPSHOT_DIR}/${name}.bin`;
        const fileResult = readFileSync(fileName);
        if (fileResult.isErr()) {
            return { success: false, size: 0, error: 'Snapshot not found' };
        }
        const buffer = new Uint8Array(fileResult.unwrap());
        const fileSize = buffer.length;

        if (fileSize < 20) {
            return { success: false, size: 0, error: 'Invalid snapshot file (too small)' };
        }

        const headerSize = 20;
        const header = buffer.subarray(0, headerSize);
        const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
        const version = headerView.getUint32(0, true);
        const savedMemorySize = Number(headerView.getBigUint64(4, true));
        const timestamp = Number(headerView.getBigUint64(12, true));

        if (version !== SNAPSHOT_VERSION_V1) {
            return { success: false, size: 0, error: `Unsupported snapshot version: ${version}` };
        }

        const currentMemorySize = memory.buffer.byteLength;
        if (savedMemorySize !== currentMemorySize) {
            console.warn(`[Snapshot v1] Memory size mismatch: saved=${savedMemorySize}, current=${currentMemorySize}`);
        }

        const memoryData = buffer.subarray(headerSize);
        const memoryView = new Uint8Array(memory.buffer);
        const copySize = Math.min(memoryData.length, memoryView.length);
        memoryView.set(memoryData.subarray(0, copySize));

        console.log(`[Snapshot v1] Restored '${name}': ${fileSize} bytes, timestamp: ${new Date(timestamp).toISOString()}`);

        return { success: true, size: fileSize, timestamp, version: SNAPSHOT_VERSION_V1 };
    } catch (err) {
        console.error('[Snapshot v1] Failed to restore snapshot:', err);
        return { success: false, size: 0, error: err.message };
    }
}

// ============================================================
// v2 (Project M) - Chunked Snapshot Manager Class
// ============================================================

export class SnapshotManager {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || SNAPSHOT_CHUNK_SIZE;
        this.toc = null;
        this.loadedChunks = new Set();
    }

    async takeSnapshot(name, memoryData, onProgress) {
        const startTime = performance.now();
        const pako = await getPako();
        const snapshotDirPath = `${SNAPSHOT_DIR}/${name}`;
        mkdirSync(SNAPSHOT_DIR);
        try {
            // Remove any previous snapshot state
            const existing = readDirSync(snapshotDirPath);
            if (existing.isOk()) {
                for (const entry of existing.unwrap()) {
                    removePath(`${snapshotDirPath}/${entry.path}`);
                }
            }
        } catch (e) { /* ignore */ }
        mkdirSync(snapshotDirPath);

        const toc = {
            version: SNAPSHOT_VERSION_V2,
            created: Date.now(),
            memorySize: memoryData.length,
            chunkSize: this.chunkSize,
            totalChunks: Math.ceil(memoryData.length / this.chunkSize),
            chunks: []
        };

        let totalCompressedSize = 0;
        let zeroChunks = 0;
        const chunkCount = toc.totalChunks;

        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
            const offset = chunkIndex * this.chunkSize;
            const end = Math.min(offset + this.chunkSize, memoryData.length);
            const chunk = memoryData.subarray(offset, end);

            if (onProgress) {
                onProgress({
                    phase: 'save',
                    current: chunkIndex,
                    total: chunkCount,
                    percent: Math.round((chunkIndex / chunkCount) * 100)
                });
            }

            if (this.isZeroFilled(chunk)) {
                toc.chunks.push({
                    index: chunkIndex,
                    offset: offset,
                    size: chunk.length,
                    compressedSize: 0,
                    zero: true,
                    hash: null
                });
                zeroChunks++;
                continue;
            }

            const compressed = pako.gzip(chunk, { level: 6 });
            const hash = await this.sha256(chunk);

            const chunkWrite = writeFileSync(`${snapshotDirPath}/chunk_${chunkIndex}.gz`, compressed);
            if (chunkWrite.isErr()) {
                throw new Error(`Failed to write chunk ${chunkIndex}: ${chunkWrite.error}`);
            }

            totalCompressedSize += compressed.length;

            toc.chunks.push({
                index: chunkIndex,
                offset: offset,
                size: chunk.length,
                compressedSize: compressed.length,
                zero: false,
                hash: hash
            });
        }

        toc.zeroChunks = zeroChunks;
        toc.totalCompressedSize = totalCompressedSize;
        const nonZeroSize = memoryData.length - (zeroChunks * this.chunkSize);
        toc.compressionRatio = nonZeroSize > 0 ? totalCompressedSize / nonZeroSize : 0;

        const tocJson = JSON.stringify(toc, null, 2);
        const tocWrite = writeFileSync(`${snapshotDirPath}/toc.json`, new TextEncoder().encode(tocJson));
        if (tocWrite.isErr()) {
            throw new Error(`Failed to write TOC: ${tocWrite.error}`);
        }

        const elapsed = performance.now() - startTime;

        if (onProgress) {
            onProgress({ phase: 'complete', current: chunkCount, total: chunkCount, percent: 100, elapsed });
        }

        console.log(`[Snapshot v2] Saved '${name}': ${chunkCount} chunks, ${zeroChunks} zero-filled, ` +
            `${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB compressed, ${elapsed.toFixed(0)}ms`);

        return { success: true, toc, size: totalCompressedSize, elapsed, version: SNAPSHOT_VERSION_V2 };
    }

    async restoreSnapshot(name, memoryView, onProgress) {
        const pako = await getPako();
        const startTime = performance.now();

        const snapshotDirPath = `${SNAPSHOT_DIR}/${name}`;
        const tocResult = readFileSync(`${snapshotDirPath}/toc.json`);
        if (tocResult.isErr()) {
            throw new Error(`Snapshot '${name}' not found`);
        }

        this.toc = JSON.parse(new TextDecoder().decode(tocResult.unwrap()));

        if (this.toc.version !== SNAPSHOT_VERSION_V2) {
            throw new Error(`Unsupported snapshot version: ${this.toc.version}`);
        }

        const chunkCount = this.toc.chunks.length;
        this.loadedChunks = new Set();

        for (let i = 0; i < chunkCount; i++) {
            const chunkInfo = this.toc.chunks[i];

            if (onProgress) {
                onProgress({
                    phase: 'restore',
                    current: i,
                    total: chunkCount,
                    percent: Math.round((i / chunkCount) * 100)
                });
            }

            if (chunkInfo.zero) {
                memoryView.fill(0, chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
                this.loadedChunks.add(i);
                continue;
            }

            const chunkHandle = await snapshotDir.getFileHandle(`chunk_${chunkInfo.index}.gz`, { create: false });
            const chunkSyncHandle = await chunkHandle.createSyncAccessHandle();
            const compressedSize = chunkSyncHandle.getSize();
            const compressed = new Uint8Array(compressedSize);
            chunkSyncHandle.read(compressed, { at: 0 });
            chunkSyncHandle.close();

            const decompressed = pako.ungzip(compressed);

            if (chunkInfo.hash) {
                const actualHash = await this.sha256(decompressed);
                if (actualHash !== chunkInfo.hash) {
                    console.warn(`[Snapshot v2] Hash mismatch for chunk ${i}`);
                }
            }

            memoryView.set(decompressed, chunkInfo.offset);
            this.loadedChunks.add(i);
        }

        const elapsed = performance.now() - startTime;

        if (onProgress) {
            onProgress({ phase: 'complete', current: chunkCount, total: chunkCount, percent: 100, elapsed });
        }

        console.log(`[Snapshot v2] Restored '${name}': ${chunkCount} chunks, ${this.toc.zeroChunks} zero-filled, ${elapsed.toFixed(0)}ms`);

        return { success: true, toc: this.toc, elapsed, timestamp: this.toc.created, version: SNAPSHOT_VERSION_V2 };
    }

    async listSnapshots() {
        try {
            const dirResult = readDirSync(SNAPSHOT_DIR);
            if (dirResult.isErr()) {
                if (dirResult.error?.name === 'NotFoundError') return { success: true, snapshots: [] };
                return { success: false, snapshots: [], error: dirResult.error?.message || 'Failed to read snapshots dir' };
            }
            const snapshots = [];
            for (const entry of dirResult.unwrap()) {
                const name = entry.path;
                if (entry.handle.kind === 'directory') {
                    try {
                        const tocResult = readFileSync(`${SNAPSHOT_DIR}/${name}/toc.json`);
                        if (tocResult.isErr()) continue;
                        const toc = JSON.parse(new TextDecoder().decode(tocResult.unwrap()));
                        snapshots.push({
                            name,
                            version: toc.version,
                            timestamp: toc.created,
                            size: toc.totalCompressedSize,
                            compressedSize: toc.totalCompressedSize,
                            memorySize: toc.memorySize,
                            chunkCount: toc.totalChunks,
                            zeroChunks: toc.zeroChunks,
                            compressionRatio: toc.compressionRatio
                        });
                    } catch (e) { /* ignore */ }
                } else if (entry.handle.kind === 'file' && name.endsWith('.bin')) {
                    try {
                        const fileResult = readFileSync(`${SNAPSHOT_DIR}/${name}`);
                        if (fileResult.isErr()) continue;
                        const buf = new Uint8Array(fileResult.unwrap());
                        const fileSize = buf.length;
                        let timestamp = 0, memorySize = 0;
                        if (fileSize >= 20) {
                            const hv = new DataView(buf.buffer, buf.byteOffset, 20);
                            memorySize = Number(hv.getBigUint64(4, true));
                            timestamp = Number(hv.getBigUint64(12, true));
                        }
                        snapshots.push({
                            name: name.replace('.bin', ''), version: SNAPSHOT_VERSION_V1, timestamp,
                            size: fileSize, compressedSize: fileSize, memorySize,
                            chunkCount: 1, zeroChunks: 0, compressionRatio: 1.0
                        });
                    } catch (e) { /* ignore */ }
                }
            }
            return { success: true, snapshots };
        } catch (err) {
            if (err.name === 'NotFoundError') return { success: true, snapshots: [] };
            return { success: false, snapshots: [], error: err.message };
        }
    }

    async deleteSnapshot(name) {
        try {
            const dir = readDirSync(SNAPSHOT_DIR);
            if (dir.isErr()) {
                return { success: false, error: dir.error?.message || 'Snapshot dir missing' };
            }
            const v2Path = `${SNAPSHOT_DIR}/${name}`;
            const v1Path = `${SNAPSHOT_DIR}/${name}.bin`;
            const v2 = readDirSync(v2Path);
            if (v2.isOk()) {
                for (const entry of v2.unwrap()) {
                    removePath(`${v2Path}/${entry.path}`);
                }
                removePath(v2Path);
                console.log(`[Snapshot] Deleted v2 snapshot '${name}'`);
                return { success: true };
            }
            const v1Exists = readFileSync(v1Path);
            if (v1Exists.isOk()) {
                removePath(v1Path);
                console.log(`[Snapshot] Deleted v1 snapshot '${name}'`);
                return { success: true };
            }
            return { success: false, error: 'Snapshot not found' };
        } catch (err) {
            console.error(`[Snapshot] Failed to delete '${name}':`, err);
            return { success: false, error: err.message };
        }
    }

    getMemoryData() {
        if (!globalWasiInstance || !globalWasiInstance.inst) return null;
        return new Uint8Array(globalWasiInstance.inst.exports.memory.buffer);
    }

    getMemoryView() {
        if (!globalWasiInstance || !globalWasiInstance.inst) return null;
        return new Uint8Array(globalWasiInstance.inst.exports.memory.buffer);
    }

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
}
