import { useEffect } from "react";

export default function Desktop() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/novnc@1.4.0/core/rfb.js";
    script.onload = () => {
      const RFB = (window as any).RFB;
      const rfb = new RFB(
        document.getElementById("vnc")!,
        "ws://localhost:14500/websockify"
      );
      rfb.scaleViewport = true;
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return <div id="vnc" className="flex-1 border" />;
} 