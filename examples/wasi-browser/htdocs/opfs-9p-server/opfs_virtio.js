let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

function wasm_bindgen__convert__closures_____invoke__h2bc0e6398e1271c8(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h2bc0e6398e1271c8(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__hb227545cd5b14f5f(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__hb227545cd5b14f5f(arg0, arg1, arg2, arg3);
}

const __wbindgen_enum_FileSystemHandleKind = ["file", "directory"];

const CreateSyncAccessHandleOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_createsyncaccesshandleoptions_free(ptr >>> 0, 1));

const JsDirEntryFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_jsdirentry_free(ptr >>> 0, 1));

const JsStatFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_jsstat_free(ptr >>> 0, 1));

const OpfsVirtioDeviceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_opfsvirtiodevice_free(ptr >>> 0, 1));

export class CreateSyncAccessHandleOptions {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CreateSyncAccessHandleOptions.prototype);
        obj.__wbg_ptr = ptr;
        CreateSyncAccessHandleOptionsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CreateSyncAccessHandleOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_createsyncaccesshandleoptions_free(ptr, 0);
    }
}
if (Symbol.dispose) CreateSyncAccessHandleOptions.prototype[Symbol.dispose] = CreateSyncAccessHandleOptions.prototype.free;

export class JsDirEntry {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(JsDirEntry.prototype);
        obj.__wbg_ptr = ptr;
        JsDirEntryFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JsDirEntryFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jsdirentry_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.jsdirentry_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {boolean}
     */
    get is_directory() {
        const ret = wasm.__wbg_get_jsdirentry_is_directory(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set is_directory(arg0) {
        wasm.__wbg_set_jsdirentry_is_directory(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) JsDirEntry.prototype[Symbol.dispose] = JsDirEntry.prototype.free;

export class JsStat {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(JsStat.prototype);
        obj.__wbg_ptr = ptr;
        JsStatFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JsStatFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jsstat_free(ptr, 0);
    }
    /**
     * @returns {bigint}
     */
    get size() {
        const ret = wasm.__wbg_get_jsstat_size(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @param {bigint} arg0
     */
    set size(arg0) {
        wasm.__wbg_set_jsstat_size(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {boolean}
     */
    get is_directory() {
        const ret = wasm.__wbg_get_jsstat_is_directory(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set is_directory(arg0) {
        wasm.__wbg_set_jsstat_is_directory(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {bigint}
     */
    get mtime() {
        const ret = wasm.__wbg_get_jsstat_mtime(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @param {bigint} arg0
     */
    set mtime(arg0) {
        wasm.__wbg_set_jsstat_mtime(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) JsStat.prototype[Symbol.dispose] = JsStat.prototype.free;

export class OpfsVirtioDevice {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(OpfsVirtioDevice.prototype);
        obj.__wbg_ptr = ptr;
        OpfsVirtioDeviceFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OpfsVirtioDeviceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_opfsvirtiodevice_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.opfsvirtiodevice_new();
        return ret;
    }
    /**
     * @param {string} path
     * @param {number} flags
     * @returns {Promise<bigint>}
     */
    open(path, flags) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_open(this.__wbg_ptr, ptr0, len0, flags);
        return ret;
    }
    /**
     * @param {bigint} fid
     * @param {bigint} offset
     * @param {number} count
     * @returns {Uint8Array}
     */
    read(fid, offset, count) {
        const ret = wasm.opfsvirtiodevice_read(this.__wbg_ptr, fid, offset, count);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {bigint} fid
     * @returns {number}
     */
    size(fid) {
        const ret = wasm.opfsvirtiodevice_size(this.__wbg_ptr, fid);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {string} path
     * @returns {Promise<JsStat>}
     */
    stat(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_stat(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {bigint} fid
     */
    close(fid) {
        const ret = wasm.opfsvirtiodevice_close(this.__wbg_ptr, fid);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {bigint} fid
     */
    flush(fid) {
        const ret = wasm.opfsvirtiodevice_flush(this.__wbg_ptr, fid);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} path
     * @returns {Promise<void>}
     */
    mkdir(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_mkdir(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} path
     * @returns {Promise<void>}
     */
    rmdir(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_rmdir(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {bigint} fid
     * @param {bigint} offset
     * @param {Uint8Array} data
     * @returns {number}
     */
    write(fid, offset, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_write(this.__wbg_ptr, fid, offset, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    exists(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_exists(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} from
     * @param {string} to
     * @returns {Promise<void>}
     */
    rename(from, to) {
        const ptr0 = passStringToWasm0(from, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_rename(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {string} path
     * @returns {Promise<void>}
     */
    unlink(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_unlink(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} path
     * @returns {Promise<any[]>}
     */
    readdir(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.opfsvirtiodevice_readdir(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
}
if (Symbol.dispose) OpfsVirtioDevice.prototype[Symbol.dispose] = OpfsVirtioDevice.prototype.free;

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_debug_string_adfb662ae34724b6 = function(arg0, arg1) {
        const ret = debugString(arg1);
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
        const ret = typeof(arg0) === 'function';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_undefined_f6b95eab589e0269 = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg__wbg_cb_unref_87dfb5aaa0cbcea7 = function(arg0) {
        arg0._wbg_cb_unref();
    };
    imports.wbg.__wbg_call_3020136f7a2d6e44 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_abb4ff46ce38be40 = function() { return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_close_e350fad820f0e4f1 = function(arg0) {
        arg0.close();
    };
    imports.wbg.__wbg_createsyncaccesshandleoptions_new = function(arg0) {
        const ret = CreateSyncAccessHandleOptions.__wrap(arg0);
        return ret;
    };
    imports.wbg.__wbg_done_62ea16af4ce34b24 = function(arg0) {
        const ret = arg0.done;
        return ret;
    };
    imports.wbg.__wbg_entries_7de5c9edd116e219 = function(arg0) {
        const ret = arg0.entries();
        return ret;
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_flush_554f5177ae6f76cb = function() { return handleError(function (arg0) {
        arg0.flush();
    }, arguments) };
    imports.wbg.__wbg_from_29a8414a7a7cd19d = function(arg0) {
        const ret = Array.from(arg0);
        return ret;
    };
    imports.wbg.__wbg_getDirectoryHandle_edea923e1d89a19d = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.getDirectoryHandle(getStringFromWasm0(arg1, arg2), arg3);
        return ret;
    };
    imports.wbg.__wbg_getDirectory_9beed6c83b6861f5 = function(arg0) {
        const ret = arg0.getDirectory();
        return ret;
    };
    imports.wbg.__wbg_getFileHandle_298ee7a4e5a85f84 = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2), arg3);
        return ret;
    };
    imports.wbg.__wbg_getSize_1bf196c4094d8f7b = function() { return handleError(function (arg0) {
        const ret = arg0.getSize();
        return ret;
    }, arguments) };
    imports.wbg.__wbg_get_6b7bd52aca3f9671 = function(arg0, arg1) {
        const ret = arg0[arg1 >>> 0];
        return ret;
    };
    imports.wbg.__wbg_get_af9dab7e9603ea93 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.get(arg0, arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_DomException_d430cd4fb5284a83 = function(arg0) {
        let result;
        try {
            result = arg0 instanceof DOMException;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_instanceof_FileSystemDirectoryHandle_264085cadc86679a = function(arg0) {
        let result;
        try {
            result = arg0 instanceof FileSystemDirectoryHandle;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_jsdirentry_new = function(arg0) {
        const ret = JsDirEntry.__wrap(arg0);
        return ret;
    };
    imports.wbg.__wbg_jsstat_new = function(arg0) {
        const ret = JsStat.__wrap(arg0);
        return ret;
    };
    imports.wbg.__wbg_kind_537a771004f87998 = function(arg0) {
        const ret = arg0.kind;
        return (__wbindgen_enum_FileSystemHandleKind.indexOf(ret) + 1 || 3) - 1;
    };
    imports.wbg.__wbg_name_9136863a055402ff = function(arg0, arg1) {
        const ret = arg1.name;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_navigator_11b7299bb7886507 = function(arg0) {
        const ret = arg0.navigator;
        return ret;
    };
    imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_new_ff12d2b041fb48f1 = function(arg0, arg1) {
        try {
            var state0 = {a: arg0, b: arg1};
            var cb0 = (arg0, arg1) => {
                const a = state0.a;
                state0.a = 0;
                try {
                    return wasm_bindgen__convert__closures_____invoke__hb227545cd5b14f5f(a, state0.b, arg0, arg1);
                } finally {
                    state0.a = a;
                }
            };
            const ret = new Promise(cb0);
            return ret;
        } finally {
            state0.a = state0.b = 0;
        }
    };
    imports.wbg.__wbg_new_no_args_cb138f77cf6151ee = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_next_b34c09a202bf4424 = function() { return handleError(function (arg0) {
        const ret = arg0.next();
        return ret;
    }, arguments) };
    imports.wbg.__wbg_opfsvirtiodevice_new = function(arg0) {
        const ret = OpfsVirtioDevice.__wrap(arg0);
        return ret;
    };
    imports.wbg.__wbg_queueMicrotask_9b549dfce8865860 = function(arg0) {
        const ret = arg0.queueMicrotask;
        return ret;
    };
    imports.wbg.__wbg_queueMicrotask_fca69f5bfad613a5 = function(arg0) {
        queueMicrotask(arg0);
    };
    imports.wbg.__wbg_read_0063be96fda4ddbb = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.read(getArrayU8FromWasm0(arg1, arg2), arg3);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_read_f7fc3494244667a2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.read(getArrayU8FromWasm0(arg1, arg2));
        return ret;
    }, arguments) };
    imports.wbg.__wbg_removeEntry_e055e728cc398139 = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.removeEntry(getStringFromWasm0(arg1, arg2), arg3);
        return ret;
    };
    imports.wbg.__wbg_resolve_fd5bfbaa4ce36e1e = function(arg0) {
        const ret = Promise.resolve(arg0);
        return ret;
    };
    imports.wbg.__wbg_set_at_8ed309b95b9da8e8 = function(arg0, arg1) {
        arg0.at = arg1;
    };
    imports.wbg.__wbg_set_create_a7fa115dfd714480 = function(arg0, arg1) {
        arg0.create = arg1 !== 0;
    };
    imports.wbg.__wbg_set_create_c87a4965b38c1564 = function(arg0, arg1) {
        arg0.create = arg1 !== 0;
    };
    imports.wbg.__wbg_set_recursive_7ac0b14755335bfb = function(arg0, arg1) {
        arg0.recursive = arg1 !== 0;
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_769e6b65d6557335 = function() {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_60cf02db4de8e1c1 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_08f5a74c69739274 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_a8924b26aa92d024 = function() {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_storage_7db24ea4f9f4aa79 = function(arg0) {
        const ret = arg0.storage;
        return ret;
    };
    imports.wbg.__wbg_then_429f7caf1026411d = function(arg0, arg1, arg2) {
        const ret = arg0.then(arg1, arg2);
        return ret;
    };
    imports.wbg.__wbg_then_4f95312d68691235 = function(arg0, arg1) {
        const ret = arg0.then(arg1);
        return ret;
    };
    imports.wbg.__wbg_toString_f07112df359c997f = function(arg0) {
        const ret = arg0.toString();
        return ret;
    };
    imports.wbg.__wbg_truncate_9e72c83b9fc1d156 = function() { return handleError(function (arg0, arg1) {
        arg0.truncate(arg1 >>> 0);
    }, arguments) };
    imports.wbg.__wbg_value_57b7b035e117f7ee = function(arg0) {
        const ret = arg0.value;
        return ret;
    };
    imports.wbg.__wbg_write_168f9ac956b6841e = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.write(getArrayU8FromWasm0(arg1, arg2));
        return ret;
    }, arguments) };
    imports.wbg.__wbg_write_f87f327ea3e1dd4b = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.write(getArrayU8FromWasm0(arg1, arg2), arg3);
        return ret;
    }, arguments) };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
        // Cast intrinsic for `U64 -> Externref`.
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_cast_a2392981279ed338 = function(arg0, arg1) {
        // Cast intrinsic for `Closure(Closure { dtor_idx: 64, function: Function { arguments: [Externref], shim_idx: 65, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
        const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__hbcce4d867924b2d0, wasm_bindgen__convert__closures_____invoke__h2bc0e6398e1271c8);
        return ret;
    };
    imports.wbg.__wbindgen_cast_e481686c74984159 = function(arg0, arg1) {
        var v0 = getArrayJsValueFromWasm0(arg0, arg1).slice();
        wasm.__wbindgen_free(arg0, arg1 * 4, 4);
        // Cast intrinsic for `Vector(Externref) -> Externref`.
        const ret = v0;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('opfs_virtio_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
