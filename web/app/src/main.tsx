import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import "./tokens.css";
import "./globals.css";

// Mock terminal output lines
const mockTerminalLines = [
  { prompt: true, text: "$ whoami" },
  { prompt: false, text: "root" },
  { prompt: true, text: "$ uname -a" },
  { prompt: false, text: "Linux container 5.15.0-wasm #1 SMP PREEMPT wasm32 GNU/Linux" },
  { prompt: true, text: "$ ls -la /mnt/opfs" },
  { prompt: false, text: "total 8" },
  { prompt: false, text: "drwxr-xr-x 2 root root 4096 Jan  3 12:00 ." },
  { prompt: false, text: "drwxr-xr-x 3 root root 4096 Jan  3 12:00 .." },
  { prompt: false, text: "-rw-r--r-- 1 root root  156 Jan  3 12:00 notes.txt" },
  { prompt: false, text: "-rw-r--r-- 1 root root 2048 Jan  3 12:00 data.json" },
  { prompt: true, text: "$ cat /mnt/opfs/notes.txt" },
  { prompt: false, text: "Hello from OPFS! This file persists in your browser." },
  { prompt: true, text: "$ _", cursor: true },
];

const MockTerminal: React.FC = () => {
  return (
    <div
      className="w-full h-[400px] md:h-[520px] font-mono text-[13px] leading-[1.4] overflow-auto rounded-sm"
      style={{
        background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
        boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div className="p-3 space-y-0">
        {mockTerminalLines.map((line, i) => (
          <div
            key={i}
            className={line.prompt ? "text-[#4ade80]" : "text-[#e5e5e5]"}
            style={{ fontFamily: 'Menlo, Monaco, "SF Mono", monospace' }}
          >
            {line.text}
            {line.cursor && (
              <span
                className="inline-block w-[8px] h-[14px] ml-0.5 animate-pulse"
                style={{ background: "#4ade80" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Mavericks-style button
const MavericksButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}> = ({ children, onClick, variant = "secondary" }) => {
  const isPrimary = variant === "primary";

  return (
    <button
      onClick={onClick}
      className="w-full h-[22px] text-[11px] font-normal rounded-[3px] px-3"
      style={{
        background: isPrimary
          ? "linear-gradient(180deg, #6cb3fa 0%, #1a82f7 50%, #166ee1 100%)"
          : "linear-gradient(180deg, #fefefe 0%, #f2f2f2 50%, #e0e0e0 100%)",
        border: `1px solid ${isPrimary ? "#1461b8" : "#a0a0a0"}`,
        boxShadow: isPrimary
          ? "inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 1px 1px rgba(0, 0, 0, 0.1)"
          : "inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 1px rgba(0, 0, 0, 0.08)",
        color: isPrimary ? "#fff" : "#1a1a1a",
        textShadow: isPrimary
          ? "0 -1px 0 rgba(0, 0, 0, 0.3)"
          : "0 1px 0 rgba(255, 255, 255, 0.8)",
      }}
    >
      {children}
    </button>
  );
};

const Mavericks: React.FC = () => {
  const [status, setStatus] = useState("Shell ready at /bin/bash — /mnt/opfs mounted.");
  const [cmd, setCmd] = useState("");
  const [tab, setTab] = useState("terminal");

  const sendCmd = () => {
    if (!cmd.trim()) return;
    setStatus(`Sent: ${cmd}`);
    setCmd("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      {/* Window container */}
      <div
        className="w-full max-w-5xl rounded-[5px] overflow-hidden"
        style={{
          background: "#e8e8e8",
          border: "1px solid",
          borderColor: "#b0b0b0 #8a8a8a #808080 #8a8a8a",
          boxShadow: `
            0 15px 50px rgba(0, 0, 0, 0.35),
            0 0 1px rgba(0, 0, 0, 0.2)
          `,
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center h-[22px] px-2"
          style={{
            background: "linear-gradient(180deg, #e8e8e8 0%, #d3d3d3 50%, #c8c8c8 100%)",
            borderBottom: "1px solid #a0a0a0",
          }}
        >
          {/* Traffic lights */}
          <div className="flex gap-[8px] items-center">
            <span className="orb orb-close" />
            <span className="orb orb-minimize" />
            <span className="orb orb-maximize" />
          </div>
          {/* Title centered */}
          <div className="flex-1 text-center">
            <span
              className="text-[13px] font-normal"
              style={{
                color: "#4a4a4a",
                textShadow: "0 1px 0 rgba(255, 255, 255, 0.5)",
              }}
            >
              Mavericks Console
            </span>
          </div>
          {/* Spacer to balance traffic lights */}
          <div className="w-[54px]" />
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-2 h-[32px]"
          style={{
            background: "linear-gradient(180deg, #dcdcdc 0%, #c4c4c4 100%)",
            borderBottom: "1px solid #a0a0a0",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.5)",
          }}
        >
          <Badge
            className="text-[10px] px-[6px] py-0 h-[16px] rounded-[3px]"
            style={{
              background: "linear-gradient(180deg, #5cd25c 0%, #34b534 100%)",
              border: "1px solid #2a962a",
              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.3)",
              color: "#fff",
              textShadow: "0 -1px 0 rgba(0, 0, 0, 0.2)",
              fontWeight: 600,
            }}
          >
            Live
          </Badge>
        </div>

        {/* Mavericks Finder-style tab bar */}
        <div className="mavericks-tab-bar">
          <button
            onClick={() => setTab("terminal")}
            className={`mavericks-tab ${tab === "terminal" ? "mavericks-tab-active" : ""}`}
          >
            Terminal
          </button>
          <button
            onClick={() => setTab("opfs")}
            className={`mavericks-tab ${tab === "opfs" ? "mavericks-tab-active" : ""}`}
          >
            OPFS
          </button>
          <div className="flex-1" style={{ background: "linear-gradient(180deg, #9a9a9a 0%, #7a7a7a 100%)" }} />
        </div>

        {/* Main content area */}
        <div className="grid md:grid-cols-[1fr,280px]">
          {/* Terminal panel */}
          <div
            className="p-2"
            style={{
              background: "linear-gradient(180deg, #c8c8c8 0%, #d8d8d8 100%)",
            }}
          >
            {tab === "terminal" ? (
              <MockTerminal />
            ) : (
              <div
                className="w-full h-[400px] md:h-[520px] rounded-sm p-3 text-[12px] leading-relaxed overflow-auto"
                style={{
                  background: "#fff",
                  boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.15)",
                  color: "#333",
                }}
              >
                <p className="mb-3 font-semibold">OPFS Storage</p>
                <p className="mb-2 text-[11px]">
                  Files mount at <code className="bg-gray-100 px-1 rounded text-[10px]">/mnt/opfs</code>
                </p>
                <p className="mb-3 text-[11px]">
                  Verify: <code className="bg-gray-100 px-1 rounded text-[10px]">mount | grep opfs</code>
                </p>
                <p className="mb-2 font-semibold">JS Hooks:</p>
                <ul className="list-disc list-inside space-y-1 text-[10px] text-gray-600">
                  <li><code className="bg-gray-100 px-1 rounded">mavericksTerminal.send("cmd\r")</code></li>
                  <li><code className="bg-gray-100 px-1 rounded">mavericksTerminal.captureCanvas()</code></li>
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div
            className="p-2 space-y-2 border-l"
            style={{
              background: "linear-gradient(180deg, #d8d8d8 0%, #c8c8c8 100%)",
              borderColor: "#a0a0a0",
            }}
          >
            {/* Status */}
            <div
              className="text-[11px] px-2 py-1 rounded-[3px]"
              style={{
                background: "#fff",
                border: "1px solid #c0c0c0",
                boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.05)",
                color: "#333",
              }}
            >
              {status}
            </div>

            {/* Command input */}
            <div className="space-y-2">
              <input
                placeholder="Type a command..."
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCmd()}
                className="w-full h-[22px] text-[12px] px-2 rounded-[3px]"
                style={{
                  background: "#fff",
                  border: "1px solid #a0a0a0",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.1)",
                  outline: "none",
                }}
              />
              <MavericksButton onClick={sendCmd} variant="primary">
                Send
              </MavericksButton>
              <MavericksButton onClick={() => setStatus("Captured terminal frame")}>
                Capture Frame
              </MavericksButton>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div
          className="px-2 py-1 text-[10px]"
          style={{
            background: "linear-gradient(180deg, #d0d0d0 0%, #b8b8b8 100%)",
            borderTop: "1px solid #a0a0a0",
            color: "#555",
            textShadow: "0 1px 0 rgba(255, 255, 255, 0.5)",
          }}
        >
          Pinch to zoom • Long-press to copy • Tap links to open browser
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Mavericks />);
