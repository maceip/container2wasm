/**
 * 9P2000.L Protocol Handler for OPFS
 *
 * Implements the 9P2000.L protocol message parsing and response building.
 * This bridges between virtio-9p transport and the OPFSFilesystem backend.
 *
 * Protocol reference: https://github.com/chaos/diod/blob/master/protocol.md
 */

// 9P2000.L Message Types
const P9_TVERSION = 100;
const P9_RVERSION = 101;
const P9_TAUTH = 102;
const P9_RAUTH = 103;
const P9_TATTACH = 104;
const P9_RATTACH = 105;
const P9_TERROR = 106;  // illegal
const P9_RERROR = 107;
const P9_TFLUSH = 108;
const P9_RFLUSH = 109;
const P9_TWALK = 110;
const P9_RWALK = 111;
const P9_TOPEN = 112;
const P9_ROPEN = 113;
const P9_TCREATE = 114;
const P9_RCREATE = 115;
const P9_TREAD = 116;
const P9_RREAD = 117;
const P9_TWRITE = 118;
const P9_RWRITE = 119;
const P9_TCLUNK = 120;
const P9_RCLUNK = 121;
const P9_TREMOVE = 122;
const P9_RREMOVE = 123;
const P9_TSTAT = 124;
const P9_RSTAT = 125;
const P9_TWSTAT = 126;
const P9_RWSTAT = 127;

// 9P2000.L extensions
const P9_TLOPEN = 12;
const P9_RLOPEN = 13;
const P9_TLCREATE = 14;
const P9_RLCREATE = 15;
const P9_TSYMLINK = 16;
const P9_RSYMLINK = 17;
const P9_TMKNOD = 18;
const P9_RMKNOD = 19;
const P9_TRENAME = 20;
const P9_RRENAME = 21;
const P9_TREADLINK = 22;
const P9_RREADLINK = 23;
const P9_TGETATTR = 24;
const P9_RGETATTR = 25;
const P9_TSETATTR = 26;
const P9_RSETATTR = 27;
const P9_TXATTRWALK = 30;
const P9_RXATTRWALK = 31;
const P9_TXATTRCREATE = 32;
const P9_RXATTRCREATE = 33;
const P9_TREADDIR = 40;
const P9_RREADDIR = 41;
const P9_TFSYNC = 50;
const P9_RFSYNC = 51;
const P9_TLOCK = 52;
const P9_RLOCK = 53;
const P9_TGETLOCK = 54;
const P9_RGETLOCK = 55;
const P9_TLINK = 70;
const P9_RLINK = 71;
const P9_TMKDIR = 72;
const P9_RMKDIR = 73;
const P9_TRENAMEAT = 74;
const P9_RRENAMEAT = 75;
const P9_TUNLINKAT = 76;
const P9_RUNLINKAT = 77;

// Error codes (Linux errno)
const EPERM = 1;
const ENOENT = 2;
const EIO = 5;
const EBADF = 9;
const EEXIST = 17;
const ENOTDIR = 20;
const EISDIR = 21;
const EINVAL = 22;
const ENOSPC = 28;
const ENOTEMPTY = 39;
const ENOTSUP = 95;

// QID types
const P9_QTDIR = 0x80;
const P9_QTAPPEND = 0x40;
const P9_QTEXCL = 0x20;
const P9_QTMOUNT = 0x10;
const P9_QTAUTH = 0x08;
const P9_QTTMP = 0x04;
const P9_QTSYMLINK = 0x02;
const P9_QTLINK = 0x01;
const P9_QTFILE = 0x00;

// Open flags
const P9_OREAD = 0;
const P9_OWRITE = 1;
const P9_ORDWR = 2;

/**
 * 9P2000.L Protocol Server
 */
export class P9Protocol {
    constructor(filesystem) {
        this.fs = filesystem;
        this.fids = new Map();  // fid -> { path, qid, open }
        this.msize = 65536;     // Max message size
        this.nextQid = 1n;      // QID path counter (BigInt for 64-bit)
        this.qidCache = new Map(); // path -> qid.path
    }

    /**
     * Handle a 9P message and return a response
     * @param {Uint8Array} data - Raw 9P message
     * @returns {Uint8Array} - Response message
     */
    handleMessage(data) {
        try {
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
            const size = view.getUint32(0, true);
            const type = view.getUint8(4);
            const tag = view.getUint16(5, true);

            // console.log(`[9P] Message type=${type} tag=${tag} size=${size}`);

            switch (type) {
                case P9_TVERSION:
                    return this.handleVersion(view, tag);
                case P9_TATTACH:
                    return this.handleAttach(view, tag);
                case P9_TWALK:
                    return this.handleWalk(view, tag);
                case P9_TLOPEN:
                    return this.handleLopen(view, tag);
                case P9_TLCREATE:
                    return this.handleLcreate(view, tag);
                case P9_TREAD:
                    return this.handleRead(view, tag);
                case P9_TWRITE:
                    return this.handleWrite(view, tag);
                case P9_TCLUNK:
                    return this.handleClunk(view, tag);
                case P9_TGETATTR:
                    return this.handleGetattr(view, tag);
                case P9_TSETATTR:
                    return this.handleSetattr(view, tag);
                case P9_TREADDIR:
                    return this.handleReaddir(view, tag);
                case P9_TMKDIR:
                    return this.handleMkdir(view, tag);
                case P9_TUNLINKAT:
                    return this.handleUnlinkat(view, tag);
                case P9_TRENAMEAT:
                    return this.handleRenameat(view, tag);
                case P9_TFSYNC:
                    return this.handleFsync(view, tag);
                case P9_TFLUSH:
                    return this.handleFlush(view, tag);
                case P9_TSTATFS:
                    return this.handleStatfs(view, tag);
                default:
                    console.warn(`[9P] Unhandled message type: ${type}`);
                    return this.buildError(tag, ENOTSUP);
            }
        } catch (err) {
            console.error('[9P] Error handling message:', err);
            return this.buildError(0, EIO);
        }
    }

    // ========== Message Handlers ==========

    handleVersion(view, tag) {
        const clientMsize = view.getUint32(7, true);
        const versionLen = view.getUint16(11, true);
        const version = this.readString(view, 13, versionLen);

        console.log(`[9P] VERSION msize=${clientMsize} version=${version}`);

        // Negotiate down to smaller msize if needed
        this.msize = Math.min(clientMsize, this.msize);

        // We support 9P2000.L
        const responseVersion = version.startsWith('9P2000.L') ? '9P2000.L' : 'unknown';
        return this.buildVersion(tag, this.msize, responseVersion);
    }

    handleAttach(view, tag) {
        const fid = view.getUint32(7, true);
        const afid = view.getUint32(11, true);
        const unameLen = view.getUint16(15, true);
        const uname = this.readString(view, 17, unameLen);
        const anameLen = view.getUint16(17 + unameLen, true);
        const aname = this.readString(view, 19 + unameLen, anameLen);

        console.log(`[9P] ATTACH fid=${fid} uname=${uname} aname=${aname}`);

        // Attach to root
        const qid = this.makeQid('/', true);
        this.fids.set(fid, { path: '/', qid, open: false });

        return this.buildRattach(tag, qid);
    }

    handleWalk(view, tag) {
        const fid = view.getUint32(7, true);
        const newfid = view.getUint32(11, true);
        const nwname = view.getUint16(15, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        let currentPath = fidInfo.path;
        const wqids = [];
        let offset = 17;

        for (let i = 0; i < nwname; i++) {
            const nameLen = view.getUint16(offset, true);
            const name = this.readString(view, offset + 2, nameLen);
            offset += 2 + nameLen;

            // Resolve path component
            if (name === '..') {
                currentPath = currentPath === '/' ? '/' : currentPath.split('/').slice(0, -1).join('/') || '/';
            } else if (name !== '.') {
                currentPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
            }

            // Check if path exists
            const stat = this.fs.stat(currentPath);
            if (!stat) {
                // Return partial walk (wqids we've collected so far)
                if (wqids.length === 0) {
                    return this.buildError(tag, ENOENT);
                }
                break;
            }

            wqids.push(this.makeQid(currentPath, stat.isDirectory));
        }

        // Clone fid if newfid != fid
        if (newfid !== fid) {
            this.fids.set(newfid, { path: currentPath, qid: wqids[wqids.length - 1] || fidInfo.qid, open: false });
        } else {
            fidInfo.path = currentPath;
            fidInfo.qid = wqids[wqids.length - 1] || fidInfo.qid;
        }

        return this.buildRwalk(tag, wqids);
    }

    handleLopen(view, tag) {
        const fid = view.getUint32(7, true);
        const flags = view.getUint32(11, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        const stat = this.fs.stat(fidInfo.path);
        if (!stat) {
            return this.buildError(tag, ENOENT);
        }

        fidInfo.open = true;
        fidInfo.flags = flags;

        return this.buildRlopen(tag, fidInfo.qid, 0);
    }

    handleLcreate(view, tag) {
        const fid = view.getUint32(7, true);
        const nameLen = view.getUint16(11, true);
        const name = this.readString(view, 13, nameLen);
        const flags = view.getUint32(13 + nameLen, true);
        const mode = view.getUint32(17 + nameLen, true);
        const gid = view.getUint32(21 + nameLen, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        const newPath = fidInfo.path === '/' ? `/${name}` : `${fidInfo.path}/${name}`;

        // Create empty file
        if (!this.fs.writeFile(newPath, new Uint8Array(0))) {
            return this.buildError(tag, EIO);
        }

        const qid = this.makeQid(newPath, false);
        fidInfo.path = newPath;
        fidInfo.qid = qid;
        fidInfo.open = true;

        return this.buildRlcreate(tag, qid, 0);
    }

    handleRead(view, tag) {
        const fid = view.getUint32(7, true);
        const offset = Number(view.getBigUint64(11, true));
        const count = view.getUint32(19, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo || !fidInfo.open) {
            return this.buildError(tag, EBADF);
        }

        const data = this.fs.readPartial(fidInfo.path, offset, count);
        if (data === null) {
            return this.buildError(tag, EIO);
        }

        return this.buildRread(tag, data);
    }

    handleWrite(view, tag) {
        const fid = view.getUint32(7, true);
        const offset = Number(view.getBigUint64(11, true));
        const count = view.getUint32(19, true);
        const data = new Uint8Array(view.buffer, view.byteOffset + 23, count);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo || !fidInfo.open) {
            return this.buildError(tag, EBADF);
        }

        const written = this.fs.writePartial(fidInfo.path, offset, data);
        if (written < 0) {
            return this.buildError(tag, EIO);
        }

        return this.buildRwrite(tag, written);
    }

    handleClunk(view, tag) {
        const fid = view.getUint32(7, true);
        this.fids.delete(fid);
        return this.buildRclunk(tag);
    }

    handleGetattr(view, tag) {
        const fid = view.getUint32(7, true);
        const requestMask = view.getBigUint64(11, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        const stat = this.fs.stat(fidInfo.path);
        if (!stat) {
            return this.buildError(tag, ENOENT);
        }

        return this.buildRgetattr(tag, requestMask, fidInfo.qid, stat);
    }

    handleSetattr(view, tag) {
        const fid = view.getUint32(7, true);
        const validMask = view.getUint32(11, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        // Handle truncate if size is being set
        if (validMask & 0x8) {  // P9_SETATTR_SIZE
            const size = Number(view.getBigUint64(35, true));
            this.fs.truncate(fidInfo.path, size);
        }

        return this.buildRsetattr(tag);
    }

    handleReaddir(view, tag) {
        const fid = view.getUint32(7, true);
        const offset = Number(view.getBigUint64(11, true));
        const count = view.getUint32(19, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        const entries = this.fs.readdir(fidInfo.path);
        if (!entries) {
            return this.buildError(tag, ENOTDIR);
        }

        return this.buildRreaddir(tag, entries, offset, count, fidInfo.path);
    }

    handleMkdir(view, tag) {
        const fid = view.getUint32(7, true);
        const nameLen = view.getUint16(11, true);
        const name = this.readString(view, 13, nameLen);
        const mode = view.getUint32(13 + nameLen, true);
        const gid = view.getUint32(17 + nameLen, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        const newPath = fidInfo.path === '/' ? `/${name}` : `${fidInfo.path}/${name}`;

        if (!this.fs.mkdir(newPath)) {
            return this.buildError(tag, EIO);
        }

        const qid = this.makeQid(newPath, true);
        return this.buildRmkdir(tag, qid);
    }

    handleUnlinkat(view, tag) {
        const fid = view.getUint32(7, true);
        const nameLen = view.getUint16(11, true);
        const name = this.readString(view, 13, nameLen);
        const flags = view.getUint32(13 + nameLen, true);

        const fidInfo = this.fids.get(fid);
        if (!fidInfo) {
            return this.buildError(tag, EBADF);
        }

        const targetPath = fidInfo.path === '/' ? `/${name}` : `${fidInfo.path}/${name}`;

        if (!this.fs.unlink(targetPath)) {
            return this.buildError(tag, EIO);
        }

        return this.buildRunlinkat(tag);
    }

    handleRenameat(view, tag) {
        const oldfid = view.getUint32(7, true);
        const oldNameLen = view.getUint16(11, true);
        const oldName = this.readString(view, 13, oldNameLen);
        const newfid = view.getUint32(13 + oldNameLen, true);
        const newNameLen = view.getUint16(17 + oldNameLen, true);
        const newName = this.readString(view, 19 + oldNameLen, newNameLen);

        const oldFidInfo = this.fids.get(oldfid);
        const newFidInfo = this.fids.get(newfid);
        if (!oldFidInfo || !newFidInfo) {
            return this.buildError(tag, EBADF);
        }

        const oldPath = oldFidInfo.path === '/' ? `/${oldName}` : `${oldFidInfo.path}/${oldName}`;
        const newPath = newFidInfo.path === '/' ? `/${newName}` : `${newFidInfo.path}/${newName}`;

        if (!this.fs.rename(oldPath, newPath)) {
            return this.buildError(tag, EIO);
        }

        return this.buildRrenameat(tag);
    }

    handleFsync(view, tag) {
        // OPFS handles sync automatically, just acknowledge
        return this.buildRfsync(tag);
    }

    handleFlush(view, tag) {
        // Nothing to flush in our implementation
        return this.buildRflush(tag);
    }

    handleStatfs(view, tag) {
        // Return dummy statfs for OPFS (we don't know actual limits)
        return this.buildRstatfs(tag);
    }

    // ========== Response Builders ==========

    buildMessage(type, tag, payloadBuilder) {
        const payload = payloadBuilder();
        const size = 7 + payload.length;
        const msg = new Uint8Array(size);
        const view = new DataView(msg.buffer);

        view.setUint32(0, size, true);
        view.setUint8(4, type);
        view.setUint16(5, tag, true);
        msg.set(payload, 7);

        return msg;
    }

    buildError(tag, errno) {
        return this.buildMessage(P9_RERROR, tag, () => {
            const buf = new Uint8Array(4);
            new DataView(buf.buffer).setUint32(0, errno, true);
            return buf;
        });
    }

    buildVersion(tag, msize, version) {
        return this.buildMessage(P9_RVERSION, tag, () => {
            const versionBytes = new TextEncoder().encode(version);
            const buf = new Uint8Array(4 + 2 + versionBytes.length);
            const view = new DataView(buf.buffer);
            view.setUint32(0, msize, true);
            view.setUint16(4, versionBytes.length, true);
            buf.set(versionBytes, 6);
            return buf;
        });
    }

    buildRattach(tag, qid) {
        return this.buildMessage(P9_RATTACH, tag, () => this.encodeQid(qid));
    }

    buildRwalk(tag, wqids) {
        return this.buildMessage(P9_RWALK, tag, () => {
            const buf = new Uint8Array(2 + wqids.length * 13);
            const view = new DataView(buf.buffer);
            view.setUint16(0, wqids.length, true);
            for (let i = 0; i < wqids.length; i++) {
                buf.set(this.encodeQid(wqids[i]), 2 + i * 13);
            }
            return buf;
        });
    }

    buildRlopen(tag, qid, iounit) {
        return this.buildMessage(P9_RLOPEN, tag, () => {
            const buf = new Uint8Array(17);
            buf.set(this.encodeQid(qid), 0);
            new DataView(buf.buffer).setUint32(13, iounit, true);
            return buf;
        });
    }

    buildRlcreate(tag, qid, iounit) {
        return this.buildMessage(P9_RLCREATE, tag, () => {
            const buf = new Uint8Array(17);
            buf.set(this.encodeQid(qid), 0);
            new DataView(buf.buffer).setUint32(13, iounit, true);
            return buf;
        });
    }

    buildRread(tag, data) {
        return this.buildMessage(P9_RREAD, tag, () => {
            const buf = new Uint8Array(4 + data.length);
            new DataView(buf.buffer).setUint32(0, data.length, true);
            buf.set(data, 4);
            return buf;
        });
    }

    buildRwrite(tag, count) {
        return this.buildMessage(P9_RWRITE, tag, () => {
            const buf = new Uint8Array(4);
            new DataView(buf.buffer).setUint32(0, count, true);
            return buf;
        });
    }

    buildRclunk(tag) {
        return this.buildMessage(P9_RCLUNK, tag, () => new Uint8Array(0));
    }

    buildRgetattr(tag, requestMask, qid, stat) {
        return this.buildMessage(P9_RGETATTR, tag, () => {
            // Full getattr response: valid + qid + mode + uid + gid + nlink + rdev + size + blksize + blocks + atime + mtime + ctime + ...
            const buf = new Uint8Array(8 + 13 + 4 + 4 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8);
            const view = new DataView(buf.buffer);
            let offset = 0;

            // valid mask
            view.setBigUint64(offset, 0x7ffn, true); offset += 8;

            // qid
            buf.set(this.encodeQid(qid), offset); offset += 13;

            // mode
            const mode = stat.isDirectory ? (0o40755) : (0o100644);
            view.setUint32(offset, mode, true); offset += 4;

            // uid, gid
            view.setUint32(offset, 0, true); offset += 4;  // uid
            view.setUint32(offset, 0, true); offset += 4;  // gid

            // nlink
            view.setBigUint64(offset, 1n, true); offset += 8;

            // rdev
            view.setBigUint64(offset, 0n, true); offset += 8;

            // size
            view.setBigUint64(offset, BigInt(stat.size || 0), true); offset += 8;

            // blksize
            view.setBigUint64(offset, 4096n, true); offset += 8;

            // blocks
            view.setBigUint64(offset, BigInt(Math.ceil((stat.size || 0) / 512)), true); offset += 8;

            // atime_sec, atime_nsec
            const mtime = BigInt(stat.mtime || Date.now());
            view.setBigUint64(offset, mtime / 1000n, true); offset += 8;
            view.setBigUint64(offset, (mtime % 1000n) * 1000000n, true); offset += 8;

            // mtime_sec, mtime_nsec
            view.setBigUint64(offset, mtime / 1000n, true); offset += 8;
            view.setBigUint64(offset, (mtime % 1000n) * 1000000n, true); offset += 8;

            // ctime_sec, ctime_nsec
            view.setBigUint64(offset, mtime / 1000n, true); offset += 8;
            view.setBigUint64(offset, (mtime % 1000n) * 1000000n, true); offset += 8;

            // btime_sec, btime_nsec (unused)
            view.setBigUint64(offset, 0n, true); offset += 8;
            view.setBigUint64(offset, 0n, true); offset += 8;

            // gen, data_version (unused)
            view.setBigUint64(offset, 0n, true); offset += 8;
            view.setBigUint64(offset, 0n, true); offset += 8;

            return buf.slice(0, offset);
        });
    }

    buildRsetattr(tag) {
        return this.buildMessage(P9_RSETATTR, tag, () => new Uint8Array(0));
    }

    buildRreaddir(tag, entries, offset, maxCount, basePath) {
        return this.buildMessage(P9_RREADDIR, tag, () => {
            const parts = [];
            let currentOffset = offset;
            let totalSize = 0;

            for (let i = Math.floor(offset); i < entries.length && totalSize < maxCount - 100; i++) {
                const entry = entries[i];
                const fullPath = basePath === '/' ? `/${entry.name}` : `${basePath}/${entry.name}`;
                const qid = this.makeQid(fullPath, entry.isDirectory);
                const nameBytes = new TextEncoder().encode(entry.name);

                // dirent: qid(13) + offset(8) + type(1) + name_len(2) + name
                const entrySize = 13 + 8 + 1 + 2 + nameBytes.length;
                const entryBuf = new Uint8Array(entrySize);
                const view = new DataView(entryBuf.buffer);

                entryBuf.set(this.encodeQid(qid), 0);
                view.setBigUint64(13, BigInt(i + 1), true);  // offset for next entry
                view.setUint8(21, entry.isDirectory ? P9_QTDIR : P9_QTFILE);
                view.setUint16(22, nameBytes.length, true);
                entryBuf.set(nameBytes, 24);

                parts.push(entryBuf);
                totalSize += entrySize;
            }

            // Build response: count(4) + entries
            const data = new Uint8Array(4 + totalSize);
            const view = new DataView(data.buffer);
            view.setUint32(0, totalSize, true);
            let pos = 4;
            for (const part of parts) {
                data.set(part, pos);
                pos += part.length;
            }
            return data;
        });
    }

    buildRmkdir(tag, qid) {
        return this.buildMessage(P9_RMKDIR, tag, () => this.encodeQid(qid));
    }

    buildRunlinkat(tag) {
        return this.buildMessage(P9_RUNLINKAT, tag, () => new Uint8Array(0));
    }

    buildRrenameat(tag) {
        return this.buildMessage(P9_RRENAMEAT, tag, () => new Uint8Array(0));
    }

    buildRfsync(tag) {
        return this.buildMessage(P9_RFSYNC, tag, () => new Uint8Array(0));
    }

    buildRflush(tag) {
        return this.buildMessage(P9_RFLUSH, tag, () => new Uint8Array(0));
    }

    buildRstatfs(tag) {
        return this.buildMessage(P9_RSTATFS || 9, tag, () => {
            // statfs: type(4) + bsize(4) + blocks(8) + bfree(8) + bavail(8) + files(8) + ffree(8) + fsid(8) + namelen(4)
            const buf = new Uint8Array(4 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 4);
            const view = new DataView(buf.buffer);
            view.setUint32(0, 0x01021997, true);  // V9FS_MAGIC
            view.setUint32(4, 4096, true);         // block size
            view.setBigUint64(8, 1000000n, true);  // total blocks
            view.setBigUint64(16, 500000n, true);  // free blocks
            view.setBigUint64(24, 500000n, true);  // available blocks
            view.setBigUint64(32, 1000000n, true); // total inodes
            view.setBigUint64(40, 500000n, true);  // free inodes
            view.setBigUint64(48, 0n, true);       // fsid
            view.setUint32(56, 255, true);         // max name length
            return buf;
        });
    }

    // ========== Utility Methods ==========

    makeQid(path, isDir) {
        let qidPath = this.qidCache.get(path);
        if (qidPath === undefined) {
            qidPath = this.nextQid++;
            this.qidCache.set(path, qidPath);
        }

        return {
            type: isDir ? P9_QTDIR : P9_QTFILE,
            version: 0,
            path: qidPath
        };
    }

    encodeQid(qid) {
        const buf = new Uint8Array(13);
        const view = new DataView(buf.buffer);
        view.setUint8(0, qid.type);
        view.setUint32(1, qid.version, true);
        view.setBigUint64(5, BigInt(qid.path), true);
        return buf;
    }

    readString(view, offset, length) {
        const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
        return new TextDecoder().decode(bytes);
    }
}

// Message type for TSTATFS
const P9_TSTATFS = 8;
const P9_RSTATFS = 9;

export default P9Protocol;
