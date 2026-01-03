# Static Mavericks UI

This preserves the original static build (no bundler) for quick testing. Assets mirror the container2wasm demo:
- `mavericks.html`
- `worker.js`
- `manifest.webmanifest`
- `sw.js`
- `runcontainer.js`, `stack-worker.js`, `worker-util.js`

Serve locally:
```bash
cd static
python3 -m http.server 8080
# open http://localhost:8080/mavericks.html
```
