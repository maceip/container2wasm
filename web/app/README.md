# Mavericks (COSS UI + Tailwind v4)

React + Tailwind v4 build using @coss/ui and @coss/colors-zinc. It mirrors the Mavericks terminal UI with OPFS hooks, share target ingest, link handling, and canvas capture.

## Setup
```bash
cd web/app
npm install
# ensures tailwindcss@next, @coss/ui, @coss/colors-zinc
npm run dev   # http://localhost:5173
npm run build
```

Assets in `public/` include worker.js and dist/runcontainer* copied from the original demo.

## Notes
- Tokens defined in `src/tokens.css` / `globals.css` include extra shadcn-style vars (info/success/warning/destructive-foreground).
- Gestures: pinch to zoom font, long-press copy, Ctrl+wheel zoom, link tap/click opens system browser.
- Automation: `window.mavericksTerminal.send(...)` and `captureCanvas()` exposed.
