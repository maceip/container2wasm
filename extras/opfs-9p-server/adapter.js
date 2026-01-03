import init, { OpfsVirtioDevice } from './pkg/opfs_virtio.js';

export class OPFSAdapter {
    constructor() {
        this.device = null;
        this.ready = false;
    }

    async init() {
        await init();
        this.device = await new OpfsVirtioDevice();
        this.ready = true;
    }

    // FS Interface for v86 / Emulator

    async read(path, offset, length) {
        if (!this.ready) throw new Error("OPFS not initialized");
        // flags: 0 = READ
        const fid = await this.device.open(path, 0);
        try {
            const data = this.device.read(fid, BigInt(offset), length);
            return data;
        } finally {
            this.device.close(fid);
        }
    }

    async write(path, offset, data) {
        if (!this.ready) throw new Error("OPFS not initialized");
        // flags: 1 = WRITE (create)
        const fid = await this.device.open(path, 1);
        try {
            const written = this.device.write(fid, BigInt(offset), data);
            return written;
        } finally {
            this.device.close(fid);
        }
    }

    async stat(path) {
        if (!this.ready) throw new Error("OPFS not initialized");
        try {
            const stats = await this.device.stat(path);
            return {
                size: Number(stats.size),
                is_directory: stats.is_directory,
                mtime: Number(stats.mtime || Date.now())
            };
        } catch (e) {
            // v86 might expect null or throw for non-existent
            return null;
        }
    }

    async readdir(path) {
        if (!this.ready) throw new Error("OPFS not initialized");
        try {
            const entries = await this.device.readdir(path);
            return Array.from(entries).map(e => ({
                name: e.name,
                is_directory: e.is_directory
            }));
        } catch (e) {
            return [];
        }
    }

    async mkdir(path) {
        if (!this.ready) throw new Error("OPFS not initialized");
        await this.device.mkdir(path);
        return true;
    }

    async unlink(path) {
        if (!this.ready) throw new Error("OPFS not initialized");
        try {
            await this.device.unlink(path);
            return true;
        } catch(e) {
            // Try rmdir if unlink fails (some APIs distinguish, some don't)
            try {
                await this.device.rmdir(path);
                return true;
            } catch (e2) {
                return false;
            }
        }
    }

    async rename(oldPath, newPath) {
        if (!this.ready) throw new Error("OPFS not initialized");
        await this.device.rename(oldPath, newPath);
        return true;
    }

    async exists(path) {
        if (!this.ready) throw new Error("OPFS not initialized");
        return await this.device.exists(path);
    }
}
