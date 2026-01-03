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
} from 'https://esm.sh/happy-opfs@latest';

// Ensure the synchronous OPFS agent is ready before any FS calls happen.
const opfsWorkerUrl = new URL('./opfs-worker.js', import.meta.url);
await connectSyncAgent(opfsWorkerUrl);

/**
 * OPFS Filesystem Backend for v86's 9p.js
 *
 * v86's 9p.js expects a FS object with these methods.
 * This adapter translates them to happy-opfs sync operations.
 */
export class OPFSFilesystem {
    constructor(rootPath = '/shared') {
        this.rootPath = rootPath;
        if (!existsSync(rootPath)) {
            mkdirSync(rootPath);
        }
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
        // v86 expects these fields
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
        return Array.from(result.unwrap()).map(entry => {
            const name = entry.path.split('/').pop();
            return {
                name: name,
                is_directory: entry.handle.kind === 'directory'
            };
        });
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
