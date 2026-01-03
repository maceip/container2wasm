# Mavericks web interface

This folder packages the Mavericks-themed terminal UI. Assets copied from the container2wasm demo:
- `mavericks.html` (React + xterm UI)
- `worker.js` (OPFS/file injection + TTY bridge)
- `manifest.webmanifest`, `sw.js` (PWA + share target)
- `dist/` (runcontainer + worker utilities)

To serve locally:
```bash
cd web
python3 -m http.server 8080
# open http://localhost:8080/mavericks.html
```

Notes:
- `window.mavericksTerminal` exposes hooks (`send`, `captureCanvas`).
- PWA share target will drop shared files into OPFS via BroadcastChannel.
- Webbundle is built in `../webbundle` and emitted as `htdocs/mavericks.wbn` in the original repo; replicate here if desired.
