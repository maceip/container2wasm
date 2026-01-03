/* tslint:disable */
/* eslint-disable */

export class CreateSyncAccessHandleOptions {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
}

export class JsDirEntry {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly name: string;
  is_directory: boolean;
}

export class JsStat {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  size: bigint;
  is_directory: boolean;
  mtime: bigint;
}

export class OpfsVirtioDevice {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  open(path: string, flags: number): Promise<bigint>;
  read(fid: bigint, offset: bigint, count: number): Uint8Array;
  size(fid: bigint): number;
  stat(path: string): Promise<JsStat>;
  close(fid: bigint): void;
  flush(fid: bigint): void;
  mkdir(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  write(fid: bigint, offset: bigint, data: Uint8Array): number;
  exists(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<any[]>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_get_jsdirentry_is_directory: (a: number) => number;
  readonly __wbg_get_jsstat_is_directory: (a: number) => number;
  readonly __wbg_get_jsstat_mtime: (a: number) => bigint;
  readonly __wbg_get_jsstat_size: (a: number) => bigint;
  readonly __wbg_jsdirentry_free: (a: number, b: number) => void;
  readonly __wbg_jsstat_free: (a: number, b: number) => void;
  readonly __wbg_opfsvirtiodevice_free: (a: number, b: number) => void;
  readonly __wbg_set_jsdirentry_is_directory: (a: number, b: number) => void;
  readonly __wbg_set_jsstat_is_directory: (a: number, b: number) => void;
  readonly __wbg_set_jsstat_mtime: (a: number, b: bigint) => void;
  readonly __wbg_set_jsstat_size: (a: number, b: bigint) => void;
  readonly jsdirentry_name: (a: number) => [number, number];
  readonly opfsvirtiodevice_close: (a: number, b: bigint) => [number, number];
  readonly opfsvirtiodevice_exists: (a: number, b: number, c: number) => any;
  readonly opfsvirtiodevice_flush: (a: number, b: bigint) => [number, number];
  readonly opfsvirtiodevice_mkdir: (a: number, b: number, c: number) => any;
  readonly opfsvirtiodevice_new: () => any;
  readonly opfsvirtiodevice_open: (a: number, b: number, c: number, d: number) => any;
  readonly opfsvirtiodevice_read: (a: number, b: bigint, c: bigint, d: number) => [number, number, number, number];
  readonly opfsvirtiodevice_readdir: (a: number, b: number, c: number) => any;
  readonly opfsvirtiodevice_rename: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly opfsvirtiodevice_rmdir: (a: number, b: number, c: number) => any;
  readonly opfsvirtiodevice_size: (a: number, b: bigint) => [number, number, number];
  readonly opfsvirtiodevice_stat: (a: number, b: number, c: number) => any;
  readonly opfsvirtiodevice_unlink: (a: number, b: number, c: number) => any;
  readonly opfsvirtiodevice_write: (a: number, b: bigint, c: bigint, d: number, e: number) => [number, number, number];
  readonly __wbg_createsyncaccesshandleoptions_free: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h2bc0e6398e1271c8: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__hbcce4d867924b2d0: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__hb227545cd5b14f5f: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
