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
