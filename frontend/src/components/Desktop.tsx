import { useEffect, useRef } from "react";

interface DesktopProps {
  dragPath?: { x: number; y: number }[];
}

declare global {
  interface Window {
    XpraPassword?: string;
  }
}

export default function Desktop({ dragPath }: DesktopProps) {
  const vncRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/novnc@1.4.0/core/rfb.js";
    script.onload = () => {
      const RFB = (window as any).RFB;
      const xpraPassword = window.XpraPassword || "";
      if (xpraPassword === "") {
        console.warn("Xpra Password is empty or not set. Ensure it's correctly injected by app.py if Xpra requires it.");
      }
      const rfb = new RFB(
        vncRef.current!,
        "ws://localhost:14500/websockify",
        { credentials: { password: xpraPassword } }
      );
      rfb.scaleViewport = true;
    };
    document.body.appendChild(script);
    return () => {
      if (script.parentNode) document.body.removeChild(script);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div id="vnc" ref={vncRef} className="flex-1 border" style={{ width: "100%", height: "100%" }} />
      {dragPath && dragPath.length > 1 && (
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <polyline
            points={dragPath.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="red"
            strokeWidth={2}
          />
        </svg>
      )}
    </div>
  );
} 