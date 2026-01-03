# OPFS Virtio Device (L1 Phase)

This directory contains the Rust implementation of a native OPFS virtio device for `container2wasm`, enabling direct, synchronous access to the Origin Private File System from guest VMs.

## Prerequisites

- Rust (cargo)
- wasm-pack

## Building

Build the WASM module using `wasm-pack`:

```bash
wasm-pack build --target web
```

## Integration with an Emulator

A JavaScript adapter is required to connect the `OpfsVirtioDevice` to an emulator's filesystem transport (like a 9P server). An example adapter is provided in `adapter.js`.

To use this device in the browser:

1.  Import the generated WASM module and the adapter.
2.  Instantiate and initialize the adapter.
3.  Provide the adapter instance to the emulator's 9P server.

```javascript
import { OPFSAdapter } from './adapter.js';

// Create and initialize the adapter
const opfsAdapter = new OPFSAdapter();
await opfsAdapter.init();

// In emulator setup:
// This assumes an emulator that can take a JS object for its 9P filesystem backend.
const virtio9p = new Virtio9p(opfsAdapter, emulator.bus);
```

## Architecture

This module uses `tokio-fs-ext` (or equivalent bindings) to access `FileSystemSyncAccessHandle`, which allows synchronous read/write operations within a Web Worker. This eliminates the need for `SharedArrayBuffer` atomic waits (busy loops) used in the JavaScript implementation, significantly reducing CPU overhead.
