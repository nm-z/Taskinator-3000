import React, { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
}

interface DesktopProps {
  dragPath?: Point[];
  vncPassword?: string;
  vncWebSocketUrl?: string; 
}

const Desktop: React.FC<DesktopProps> = ({ 
    dragPath, 
    vncPassword = "password", // Default, should be configured
    vncWebSocketUrl = "ws://localhost:14500/websockify" // Default, should be configured
}) => {
  const vncRef = useRef<HTMLDivElement>(null);
  const rfbInstance = useRef<any>(null);

  useEffect(() => {
    const initializeRfb = () => {
      if (vncRef.current && (window as any).RFB) {
        const RFB = (window as any).RFB;
        if (rfbInstance.current) {
          try {
            rfbInstance.current.disconnect();
          } catch (e) { console.warn("Error disconnecting previous RFB instance:", e); }
          rfbInstance.current = null;
        }
        if(vncRef.current) {
            vncRef.current.innerHTML = '<div class="flex items-center justify-center h-full"><p class="text-slate-400 p-4 text-sm">Connecting to VNC desktop...</p></div>'; 
        }
        const rfb = new RFB(vncRef.current!, vncWebSocketUrl, { 
            credentials: { password: vncPassword },
            shared: true, 
            view_only: false 
        });
        rfb.scaleViewport = true;
        rfb.resizeSession = true;

        rfb.addEventListener('connect', () => {
            console.log('RFB connected to', vncWebSocketUrl);
            if (vncRef.current) { vncRef.current.innerHTML = ''; }
        });
        rfb.addEventListener('disconnect', (detail: any) => {
            console.log('RFB disconnected from', vncWebSocketUrl, 'Details:', detail);
            if (vncRef.current) {
                 vncRef.current.innerHTML = `<div class="flex items-center justify-center h-full"><div class="p-4 text-sm text-center"><p class="text-amber-400 font-semibold">VNC Disconnected</p><p class="text-slate-400 mt-1">Reason: ${detail?.detail?.reason || 'Unknown'}. Clean disconnect: ${detail?.detail?.clean}.</p><p class="text-slate-500 text-xs mt-2">Attempting to reconnect or check settings if issues persist.</p></div></div>`;
            }
        });
         rfb.addEventListener('securityfailure', (detail: any) => {
            console.error('RFB security failure for', vncWebSocketUrl, 'Details:', detail);
             if (vncRef.current) {
                 vncRef.current.innerHTML = `<div class="flex items-center justify-center h-full"><div class="p-4 text-sm text-center"><p class="text-red-400 font-semibold">VNC Security Failure</p><p class="text-slate-400 mt-1">Reason: ${detail?.detail?.reason || 'Incorrect password or security configuration issue.'}</p></div></div>`;
            }
        });
        rfb.addEventListener('onerror', (errorEvent: any) => {
            console.error('RFB error for', vncWebSocketUrl, 'Error Event:', errorEvent);
            if (vncRef.current && (!rfbInstance.current || !rfbInstance.current.isConnected())) {
                 vncRef.current.innerHTML = `<div class="flex items-center justify-center h-full"><p class="p-4 text-sm text-red-400">RFB Connection Error. Check console.</p></div>`;
            }
        });
        rfbInstance.current = rfb;
      } else if (!(window as any).RFB) {
        console.warn("RFB script not loaded. Retrying in 200ms...");
        setTimeout(initializeRfb, 200); 
      }
    };

    const scriptId = "novnc-rfb-script";
    const noVncScriptUrl = "https://cdn.jsdelivr.net/npm/novnc@1.4.0/build/novnc.min.js";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = noVncScriptUrl;
      script.async = true;
      script.onload = () => { console.log("noVNC script loaded from", noVncScriptUrl); initializeRfb(); };
      script.onerror = () => {
        console.error("Failed to load noVNC script from", noVncScriptUrl);
         if (vncRef.current) {
            vncRef.current.innerHTML = `<div class=\"flex items-center justify-center h-full\"><p class=\"p-4 text-sm text-red-500\">FATAL ERROR: Failed to load VNC client script. Please check internet connection and CDN accessibility.</p></div>`;
        }
      };
      document.head.appendChild(script);
    } else { initializeRfb(); }

    return () => {
      if (rfbInstance.current) {
        try { rfbInstance.current.disconnect(); console.log("RFB disconnected on cleanup."); }
        catch (e) { console.warn("Error disconnecting RFB on cleanup:", e); }
        rfbInstance.current = null;
      }
    };
  }, [vncPassword, vncWebSocketUrl]); 

  return (
    <div className="relative w-full h-full bg-black border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
      <div id="vnc-desktop-container" ref={vncRef} className="w-full h-full" />
      {dragPath && dragPath.length > 1 && (
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <polyline
            points={dragPath.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(0, 220, 255, 0.7)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};

export default Desktop; 