import {
    mkdirSync,
    readFileSync,
    writeFileSync,
    removeSync,
    statSync,
    readDirSync,
    existsSync,
    renameSync
} from 'https://esm.sh/happy-opfs@latest';

export function setupOPFSShim(wasi_shim) {
    const { Fd, Fdstat, Filestat, Dirent, Prestat, 
            FILETYPE_REGULAR_FILE, FILETYPE_DIRECTORY, 
            ERRNO_INVAL, ERRNO_NOSYS, 
            OFLAGS_CREAT, OFLAGS_DIRECTORY, OFLAGS_EXCL, OFLAGS_TRUNC,
            WHENCE_SET, WHENCE_CUR, WHENCE_END,
            Iovec, Ciovec } = wasi_shim;

    class OPFSOpenFile extends Fd {
        constructor(path) {
            super();
            this.path = path;
            this.file_pos = 0n;
        }

        fd_fdstat_get() {
            return { ret: 0, fdstat: new Fdstat(FILETYPE_REGULAR_FILE, 0) };
        }

        fd_read(view8, iovs) {
            let nread = 0;
            const result = readFileSync(this.path);
            if (result.isErr()) return { ret: ERRNO_INVAL, nread: 0 };
            const data = new Uint8Array(result.unwrap());

            for (const iov of iovs) {
                if (this.file_pos >= BigInt(data.byteLength)) break;
                let chunk = data.slice(Number(this.file_pos), Number(this.file_pos + BigInt(iov.buf_len)));
                view8.set(chunk, iov.buf);
                this.file_pos += BigInt(chunk.length);
                nread += chunk.length;
            }
            return { ret: 0, nread };
        }

        fd_write(view8, iovs) {
            let nwritten = 0;
            let data;
            const result = readFileSync(this.path);
            if (result.isOk()) {
                data = new Uint8Array(result.unwrap());
            } else {
                data = new Uint8Array(0);
            }

            for (const iov of iovs) {
                const chunk = view8.slice(iov.buf, iov.buf + iov.buf_len);
                const newPos = Number(this.file_pos) + chunk.byteLength;
                if (newPos > data.byteLength) {
                    const newData = new Uint8Array(newPos);
                    newData.set(data);
                    data = newData;
                }
                data.set(chunk, Number(this.file_pos));
                this.file_pos += BigInt(chunk.byteLength);
                nwritten += chunk.byteLength;
            }
            writeFileSync(this.path, data);
            return { ret: 0, nwritten };
        }

        fd_seek(offset, whence) {
            let new_pos;
            const statRes = statSync(this.path);
            if (statRes.isErr()) return { ret: ERRNO_INVAL, offset: 0n };
            const size = BigInt(statRes.unwrap().size);

            switch (whence) {
                case WHENCE_SET: new_pos = offset; break;
                case WHENCE_CUR: new_pos = this.file_pos + offset; break;
                case WHENCE_END: new_pos = size + offset; break;
                default: return { ret: ERRNO_INVAL, offset: 0n };
            }
            if (new_pos < 0n) return { ret: ERRNO_INVAL, offset: 0n };
            this.file_pos = new_pos;
            return { ret: 0, offset: this.file_pos };
        }

        fd_filestat_get() {
            const statRes = statSync(this.path);
            if (statRes.isErr()) return { ret: ERRNO_INVAL, filestat: null };
            const s = statRes.unwrap();
            return { ret: 0, filestat: new Filestat(FILETYPE_REGULAR_FILE, BigInt(s.size)) };
        }
        
        fd_close() {
            return 0;
        }
    }

    class OPFSOpenDirectory extends Fd {
        constructor(path) {
            super();
            this.path = path;
        }

        fd_fdstat_get() {
            return { ret: 0, fdstat: new Fdstat(FILETYPE_DIRECTORY, 0) };
        }

        fd_readdir_single(offset) {
            const result = readDirSync(this.path);
            if (result.isErr()) return { ret: ERRNO_INVAL, dirent: null };
            const entries = Array.from(result.unwrap());
            if (offset >= BigInt(entries.length)) return { ret: 0, dirent: null };
            
            const entry = entries[Number(offset)];
            const type = entry.handle.kind === 'directory' ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE;
            const name = entry.path.split('/').pop();
            return {
                ret: 0,
                dirent: new Dirent(offset + 1n, name, type)
            };
        }

        path_filestat_get(flags, path) {
            const fullPath = this.path + '/' + path;
            const statRes = statSync(fullPath);
            if (statRes.isErr()) return { ret: ERRNO_INVAL, filestat: null };
            const s = statRes.unwrap();
            const type = s.kind === 'directory' ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE;
            return { ret: 0, filestat: new Filestat(type, BigInt(s.size || 0)) };
        }

        path_open(dirflags, path, oflags, fs_rights_base, fs_rights_inherited, fdflags) {
            const fullPath = this.path + '/' + path;
            const exists = existsSync(fullPath);
            
            if (!exists) {
                if (!(oflags & OFLAGS_CREAT)) return { ret: ERRNO_INVAL, fd_obj: null };
                if (oflags & OFLAGS_DIRECTORY) {
                    mkdirSync(fullPath);
                } else {
                    writeFileSync(fullPath, new Uint8Array(0));
                }
            } else {
                if ((oflags & OFLAGS_EXCL)) return { ret: ERRNO_INVAL, fd_obj: null };
            }

            const statRes = statSync(fullPath);
            if (statRes.isErr()) return { ret: ERRNO_INVAL, fd_obj: null };
            const s = statRes.unwrap();

            if ((oflags & OFLAGS_DIRECTORY) && s.kind !== 'directory') return { ret: ERRNO_INVAL, fd_obj: null };

            if (s.kind === 'directory') {
                return { ret: 0, fd_obj: new OPFSOpenDirectory(fullPath) };
            } else {
                if (oflags & OFLAGS_TRUNC) writeFileSync(fullPath, new Uint8Array(0));
                return { ret: 0, fd_obj: new OPFSOpenFile(fullPath) };
            }
        }
        
        path_create_directory(path) {
            const fullPath = this.path + '/' + path;
            mkdirSync(fullPath);
            return 0;
        }

        path_unlink_file(path) {
            const fullPath = this.path + '/' + path;
            removeSync(fullPath);
            return 0;
        }

        path_remove_directory(path) {
            const fullPath = this.path + '/' + path;
            removeSync(fullPath);
            return 0;
        }
        
        fd_close() {
            return 0;
        }
    }

    class OPFSPreopenDirectory extends OPFSOpenDirectory {
        constructor(preopen_name, path) {
            super(path);
            this.preopen_name = new TextEncoder("utf-8").encode(preopen_name);
        }

        fd_prestat_get() {
            return { ret: 0, prestat: Prestat.dir(this.preopen_name.length) };
        }

        fd_prestat_dir_name() {
            return { ret: 0, prestat_dir_name: this.preopen_name };
        }
    }

    return {
        OPFSOpenFile,
        OPFSOpenDirectory,
        OPFSPreopenDirectory
    };
}
