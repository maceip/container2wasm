import { initOPFS, getS1Filesystem, getM1Filesystem } from './opfs-fs-backend.js';
import { PreopenDirectory, OpenFile, File } from './browser_wasi_shim/index.js';
import './browser_wasi_shim/wasi_defs.js';
import {
    registerSocketBuffer, serveIfInitMsg, getImagename, errStatus,
    sockAccept, sockSend, sockRecv, sockWaitForReadable,
    sendCert, recvCert, getCertDir, wasiHackSocket
} from './worker-util.js';
import {
    SnapshotManager, takeSnapshotV1, restoreSnapshotV1, initSnapshotDir, setWasiInstance
} from './snapshot-manager.js';
import { P9Protocol } from './p9-protocol.js';
import "https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/workerTools.js";

// ============================================================
// OPFS Integration
// ============================================================

const OPFS_BACKEND = 'M1';
let opfs9pServer = null;
const snapshotManager = new SnapshotManager();

async function initializeOPFS() {
    console.log('[OPFS] Initializing...');

    const { s1, m1 } = await initOPFS();
    console.log('[OPFS] S1 filesystem ready at /emulator');
    console.log('[OPFS] M1/L1 filesystem ready at /shared');

    if (OPFS_BACKEND === 'L1') {
        try {
            const { default: init, OpfsVirtioDevice } = await import('./opfs-9p-server/opfs_virtio.js');
            await init();
            opfs9pServer = new OpfsVirtioDevice();
            console.log('[OPFS] L1 Rust 9P server initialized');
        } catch (err) {
            console.warn('[OPFS] L1 backend failed to initialize, disabling L1:', err);
            opfs9pServer = null;
        }
    } else {
        try {
            // M1: Pure JavaScript 9P2000.L protocol server backed by OPFS
            // Uses p9-protocol.js which implements the full 9P2000.L protocol
            // without requiring v86's virtio infrastructure
            const p9server = new P9Protocol(m1);
            opfs9pServer = {
                handle_message: (msg) => {
                    try {
                        const msgArray = msg instanceof Uint8Array ? msg : new Uint8Array(msg);
                        return p9server.handleMessage(msgArray);
                    } catch (err) {
                        console.error('[OPFS] M1 9P protocol error:', err);
                        return null;
                    }
                }
            };
            console.log('[OPFS] M1 JavaScript 9P2000.L server initialized with p9-protocol.js');
        } catch (err) {
            console.warn('[OPFS] M1 backend unavailable, disabling M1:', err);
            opfs9pServer = null;
        }
    }

    return { s1, opfs9pServer };
}

// ============================================================
// S1: OPFS-backed WASI Directory
// ============================================================

class OPFSDirectory {
    constructor(fs, path = '/') {
        this.fs = fs;
        this.path = path;
    }

    get_entry(name) {
        const entryPath = this.path + '/' + name;
        const stat = this.fs.stat(entryPath);
        if (!stat) return null;

        if (stat.isDirectory) {
            return new OPFSDirectory(this.fs, entryPath);
        } else {
            return new OPFSFile(this.fs, entryPath);
        }
    }

    create_entry_for_path(name, isDir) {
        const entryPath = this.path + '/' + name;
        if (isDir) {
            this.fs.mkdir(entryPath);
            return new OPFSDirectory(this.fs, entryPath);
        } else {
            this.fs.writeFile(entryPath, new Uint8Array(0));
            return new OPFSFile(this.fs, entryPath);
        }
    }

    *entries() {
        for (const entry of this.fs.readdir(this.path)) {
            const entryPath = this.path === '/' ? `/${entry.name}` : `${this.path}/${entry.name}`;
            if (entry.isDirectory) {
                yield [entry.name, new OPFSDirectory(this.fs, entryPath)];
            } else {
                yield [entry.name, new OPFSFile(this.fs, entryPath)];
            }
        }
    }
}

class OPFSFile {
    constructor(fs, path) {
        this.fs = fs;
        this.path = path;
        this._data = null;
        this._dirty = false;
    }

    get data() {
        if (this._data === null) {
            this._data = this.fs.readFile(this.path) || new Uint8Array(0);
        }
        return this._data;
    }

    set data(value) {
        this._data = value;
        this._dirty = true;
    }
    
    flush() {
        if (this._dirty) {
            this.fs.writeFile(this.path, this._data);
            this._dirty = false;
        }
    }

    get size() {
        const stat = this.fs.stat(this.path);
        return stat ? stat.size : 0;
    }
}

// ============================================================
// M1/L1: 9P Message Handler
// ============================================================

function handle9PMessage(message) {
    if (!opfs9pServer) {
        console.error('[OPFS] 9P server not initialized');
        return null;
    }

    if (typeof opfs9pServer.handle_message === 'function') {
        if (OPFS_BACKEND === 'L1') {
            return opfs9pServer.handle_message(new Uint8Array(message));
        }
        const response = opfs9pServer.handle_message(Array.from(message));
        return response ? new Uint8Array(response) : null;
    }

    console.warn('[OPFS] handle_message not available on 9P server');
    return null;
}

// ============================================================
// Utility Functions
// ============================================================

function getNetParam() {
    var vars = location.search.substring(1).split('&');
    for (var i = 0; i < vars.length; i++) {
        var kv = vars[i].split('=');
        if (decodeURIComponent(kv[0]) == 'net') {
            return { mode: kv[1], param: kv[2] };
        }
    }
    return null;
}

function genmac() {
    return "02:XX:XX:XX:XX:XX".replace(/X/g, function() {
        return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16));
    });
}

// ============================================================
// Integration with Emulator
// ============================================================

const opfsReady = initializeOPFS();

self.onmessage = async (msg) => {
    // Handle snapshot/status messages
    if (typeof msg.data === 'object' && msg.data.type) {
        switch (msg.data.type) {
            case 'opfs-status': {
                await opfsReady;
                postMessage({ type: 'opfs-ready' });
                return;
            }
            case 'snapshot': {
                await opfsReady;
                const snapResult = await takeSnapshotV1(msg.data.name || 'vm');
                postMessage({ type: 'snapshot_result', ...snapResult });
                return;
            }
            case 'restore': {
                await opfsReady;
                const restoreResult = await restoreSnapshotV1(msg.data.name || 'vm');
                postMessage({ type: 'restore_result', ...restoreResult });
                return;
            }

            case 'snapshot_chunked':
                const memoryData = snapshotManager.getMemoryData();
                if (!memoryData) {
                    postMessage({ type: 'snapshot_chunked_result', success: false, error: 'WASI not initialized' });
                    return;
                }
                try {
                    const chunkedResult = await snapshotManager.takeSnapshot(
                        msg.data.name || 'vm',
                        memoryData,
                        (progress) => postMessage({ type: 'snapshot_progress', ...progress })
                    );
                    postMessage({ type: 'snapshot_chunked_result', ...chunkedResult });
                } catch (err) {
                    postMessage({ type: 'snapshot_chunked_result', success: false, error: err.message });
                }
                return;

            case 'restore_chunked':
                const memoryView = snapshotManager.getMemoryView();
                if (!memoryView) {
                    postMessage({ type: 'restore_chunked_result', success: false, error: 'WASI not initialized' });
                    return;
                }
                try {
                    const restoreChunkedResult = await snapshotManager.restoreSnapshot(
                        msg.data.name || 'vm',
                        memoryView,
                        (progress) => postMessage({ type: 'restore_progress', ...progress })
                    );
                    postMessage({ type: 'restore_chunked_result', ...restoreChunkedResult });
                } catch (err) {
                    console.log('[Snapshot] Falling back to v1 restore');
                    const fallbackResult = await restoreSnapshotV1(msg.data.name || 'vm');
                    postMessage({ type: 'restore_chunked_result', ...fallbackResult });
                }
                return;

            case 'list_snapshots':
                const listResult = await snapshotManager.listSnapshots();
                postMessage({ type: 'list_snapshots_result', ...listResult });
                return;

            case 'delete_snapshot':
                const deleteResult = await snapshotManager.deleteSnapshot(msg.data.name);
                postMessage({ type: 'delete_snapshot_result', ...deleteResult });
                return;
        }
    }

    if (serveIfInitMsg(msg)) {
        initSnapshotDir();
        return;
    }

    const { s1, opfs9pServer: server } = await opfsReady;
    self.postMessage({ type: 'opfs-ready' });
    
    self.handle9PMessage = handle9PMessage;

    var ttyClient = new TtyClient(msg.data);

    // M1 filesystem: OPFS-backed directory for guest 9P mount
    const m1 = getM1Filesystem();
    const opfsDir = new OPFSDirectory(m1, '/');

    var args = [];
    var env = [];
    var fds = [
        new OpenFile(new File([])), // stdin
        new OpenFile(new File([])), // stdout
        new OpenFile(new File([])), // stderr
        // fd 3: /opfs - OPFS-backed directory for guest 9P access via virtfs
        new PreopenDirectory("/opfs", opfsDir),
    ];

    var netParam = getNetParam();
    var listenfd = 4;
    
    fetch(getImagename(), { credentials: 'same-origin' }).then((resp) => {
        resp['arrayBuffer']().then((wasm) => {
            if (netParam) {
                if (netParam.mode == 'delegate') {
                    args = ['arg0', '--net=socket', '--mac', genmac()];
                } else if (netParam.mode == 'browser') {
                     recvCert().then((cert) => {
                        var certDir = getCertDir(cert);
                        fds[4] = certDir; // Add cert dir
                        args = ['arg0', '--net=socket=listenfd=5', '--mac', genmac()];
                        env = [
                            "SSL_CERT_FILE=/.wasmenv/proxy.crt",
                            "https_proxy=http://192.168.127.253:80",
                            "http_proxy=http://192.168.127.253:80",
                            "HTTPS_PROXY=http://192.168.127.253:80",
                            "HTTP_PROXY=http://192.168.127.253:80"
                        ];
                        listenfd = 5;
                        startWasi(wasm, ttyClient, args, env, fds, listenfd, 6);
                    });
                    return;
                }
            }
            startWasi(wasm, ttyClient, args, env, fds, listenfd, 6);
        });
    }).catch(e => {
        console.error(e);
        self.postMessage({ type: 'opfs-error' });
    });
};


function startWasi(wasm, ttyClient, args, env, fds, listenfd, connfd) {
    var wasi = new WASI(args, env, fds);
    wasiHack(wasi, ttyClient, connfd);
    wasiHackSocket(wasi, listenfd, connfd);
    
    WebAssembly.instantiate(wasm, {
        "wasi_snapshot_preview1": wasi.wasiImport,
    }).then((inst) => {
        // Register global instance for snapshots
        setWasiInstance(wasi);
        console.log('[Snapshot] WASI instance hooked');
        wasi.start(inst.instance);
    });
}

function wasiHack(wasi, ttyClient, connfd) {
    const original_fd_read = wasi.wasiImport.fd_read;
    wasi.wasiImport.fd_read = (fd, iovs_ptr, iovs_len, nread_ptr) => {
        if (fd === 0) { // stdin
            var buffer = new DataView(wasi.inst.exports.memory.buffer);
            var buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            var iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
            var nread = 0;
            for (let i = 0; i < iovecs.length; i++) {
                var data = ttyClient.onRead(iovecs[i].buf_len);
                buffer8.set(data, iovecs[i].buf);
                nread += data.length;
            }
            buffer.setUint32(nread_ptr, nread, true);
            return 0;
        }
        return original_fd_read(fd, iovs_ptr, iovs_len, nread_ptr);
    };

    const original_fd_write = wasi.wasiImport.fd_write;
    wasi.wasiImport.fd_write = (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
        if (fd === 1 || fd === 2) { // stdout/stderr
            var buffer = new DataView(wasi.inst.exports.memory.buffer);
            var buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            var iovecs = Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
            var wtotal = 0;
            for (let i = 0; i < iovecs.length; i++) {
                var buf = buffer8.slice(iovecs[i].buf, iovecs[i].buf + iovecs[i].buf_len);
                ttyClient.onWrite(Array.from(buf));
                wtotal += buf.length;
            }
            buffer.setUint32(nwritten_ptr, wtotal, true);
            return 0;
        }
        return original_fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr);
    };
    
    const original_fd_close = wasi.wasiImport.fd_close;
    wasi.wasiImport.fd_close = (fd) => {
        if (wasi.fds[fd] && wasi.fds[fd].file && wasi.fds[fd].file instanceof OPFSFile) {
            wasi.fds[fd].file.flush();
        }
        return original_fd_close(fd);
    };
}
