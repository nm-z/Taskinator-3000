import React, { useState, useEffect, useRef } from 'react';

// --- Constants and Types ---
interface Message {
  role: string;
  content: string;
  tool_result?: any;
}

interface Point {
  x: number;
  y: number;
}

interface DesktopProps {
  dragPath?: Point[];
  vncPassword?: string;
  vncWebSocketUrl?: string; 
}

interface ChatProps {
  onDragPath?: (path: Point[]) => void;
  chatApiUrl?: string;
}

const SYSTEM_PROMPT = `You are Taskinator-3000, an AI that controls a GUI.\n\n<Tools>\n{"type":"function","function":{\n  "name":"computer_use",\n  "description":"Low-level GUI control on the remote desktop",\n  "parameters":{"type":"object","properties":{\n       "tool":{"type":"string","enum":["click","double_click","move","drag","scroll","type","keypress","wait","screenshot"]},\n       "x":{"type":"number"},"y":{"type":"number"},\n       "button":{"type":"string","enum":["left","right","middle"]},\n       "text":{"type":"string"},\n       "scroll_x":{"type":"number"},"scroll_y":{"type":"number"},\n       "ms":{"type":"number"}\n  },\n  "required":["tool"]}}\n}\n</Tools>\n\nWhen you need to act, output ONLY the JSON object for computer_use, nothing else.\nOtherwise answer normally.`;

// --- Helper: Icon for Send Button ---
const SendIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5"
  >
    <path d="M3.105 3.105a.75.75 0 00-.842.842l1.904 8.568a.75.75 0 00.706.585h5.785a.75.75 0 010 1.5H4.973l-1.904 8.568a.75.75 0 00.842.842l13.874-5.946a.75.75 0 000-1.412L3.105 3.105z" />
  </svg>
);

// --- Desktop Component ---
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
            // Clear previous messages and show connecting message
            vncRef.current.innerHTML = '<div class="flex items-center justify-center h-full"><p class="text-slate-400 p-4 text-sm">Connecting to VNC desktop...</p></div>'; 
        }
        const rfb = new RFB(vncRef.current!, vncWebSocketUrl, { 
            credentials: { password: vncPassword },
            shared: true, // Example: allow shared connection
            view_only: false // Example: allow control
        });
        rfb.scaleViewport = true;
        rfb.resizeSession = true;

        rfb.addEventListener('connect', () => {
            console.log('RFB connected to', vncWebSocketUrl);
            if (vncRef.current) { vncRef.current.innerHTML = ''; } // Clear "Connecting..."
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
            // RFB "error" events might not always be fatal or mean a failed connection.
            // Sometimes they are for non-critical issues.
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
            stroke="rgba(0, 220, 255, 0.7)" // Vibrant teal for trace
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};

// --- Chat Component ---
const Chat: React.FC<ChatProps> = ({ 
    onDragPath,
    chatApiUrl = "http://localhost:5000/chat" // Default, should be configured
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(scrollToBottom, [messages]);

  async function sendMessage() {
    if (!input.trim()) return;
    let newMessages: Message[] = [...messages, { role: "user", content: input }];
    if (!newMessages.some(m => m.role === "system" && m.content === SYSTEM_PROMPT)) {
      newMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...newMessages];
    }
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    await orchestrate(newMessages); 
    setLoading(false);
  }

  async function orchestrate(currentHistory: Message[]) {
    let loopHistory = [...currentHistory];
    // console.log("Sending to API:", chatApiUrl, "Payload:", JSON.stringify({ messages: loopHistory.map(({ role, content }) => ({ role, content })) }));
    try {
      const res = await fetch(chatApiUrl, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: loopHistory.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error from API:", chatApiUrl, res.status, errorText);
        setMessages(prev => [...prev, { role: "assistant", content: `API Error: ${res.status}. ${errorText || "Failed to communicate with server."}` }]);
        return;
      }
      const data = await res.json();
      // console.log("Received from API:", chatApiUrl, data);
      if (data.drag_path && onDragPath) {
        onDragPath(data.drag_path);
        setTimeout(() => onDragPath([]), 1800); 
      }
      if (data.tool_result) {
        const toolResultContent = typeof data.tool_result === 'string' ? data.tool_result : JSON.stringify(data.tool_result, null, 2);
        const newHistoryWithFunctionResult: Message[] = [ ...loopHistory, { role: "function", content: toolResultContent, tool_result: data.tool_result }];
        setMessages(newHistoryWithFunctionResult); 
        await orchestrate(newHistoryWithFunctionResult); 
      } else if (data.assistant) {
        const newHistoryWithAssistantReply: Message[] = [...loopHistory, { role: "assistant", content: data.assistant }];
        setMessages(newHistoryWithAssistantReply);
      } else if (data.error) {
         setMessages(prev => [...prev, { role: "assistant", content: `Backend Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Unexpected response from the server at ${chatApiUrl}.` }]);
      }
    } catch (error) {
      console.error("Fetch/process error from API:", chatApiUrl, error);
      let errorMsg = "Network error or response processing failed.";
      if (error instanceof TypeError && error.message.includes("Failed to parse URL")) { errorMsg = `Invalid API URL: ${chatApiUrl}. Ensure it is correct and accessible.`; }
      else if (error instanceof Error) { errorMsg = error.message; }
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${errorMsg}` }]);
    }
  }
  
  const getMessageStyles = (role: string) => {
    switch (role) {
      case 'user': return 'bg-sky-700 text-sky-50 self-end ml-auto';
      case 'assistant': return 'bg-slate-700 text-slate-200 self-start mr-auto';
      case 'function': return 'bg-purple-700 text-purple-100 self-start mr-auto text-xs p-2 font-mono';
      case 'system': return 'bg-slate-800 text-slate-500 text-xs italic self-start mr-auto p-1.5 border-b border-slate-700';
      default: return 'bg-slate-600 text-slate-300 self-start mr-auto';
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
      <div className="bg-slate-900 text-sky-300 p-3 flex items-center justify-center text-lg font-semibold border-b border-slate-700">
        <span>Taskinator-3000</span>
        <span className="ml-2 text-sky-500 animate-pulse">▋</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-900 custom-scrollbar">
        {messages.map((msg, i) => {
          if (msg.role === "system" && msg.content === SYSTEM_PROMPT) return null;
          let isScreenshotResult = false;
          let screenshotData = "";
          if (msg.role === "function") {
            try {
              if (typeof msg.content === 'string' && msg.content.startsWith("data:image/png;base64,")) {
                isScreenshotResult = true; screenshotData = msg.content;
              } else {
                const parsedContent = msg.tool_result; 
                if (typeof parsedContent === 'string' && parsedContent.startsWith("data:image/png;base64,")) {
                  isScreenshotResult = true; screenshotData = parsedContent;
                }
              }
            } catch (e) { /* ignore */ }
          }
          return (
            <div key={i} className={`flex flex-col max-w-[88%] p-2.5 rounded-lg shadow-md text-sm ${getMessageStyles(msg.role)}`}>
              <div className="font-bold text-xs opacity-75 mb-1 capitalize">{msg.role}</div>
              {isScreenshotResult ? (
                <img src={screenshotData} alt="screenshot" className="max-w-full h-auto border-2 border-slate-600 rounded-md mt-1" />
              ) : msg.role === "function" ? (
                <pre className="block bg-black bg-opacity-30 rounded-md p-2 text-xs whitespace-pre-wrap overflow-x-auto custom-scrollbar-thin">
                  <code>{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}</code>
                </pre>
              ) : (
                <div className="break-words whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form
        className="flex gap-2 p-3 border-t border-slate-700 bg-slate-800"
        onSubmit={e => { e.preventDefault(); if (!loading) sendMessage(); }}
      >
        <input
          className="flex-1 border border-slate-600 rounded-lg p-2.5 bg-slate-700 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-sm transition-colors duration-150"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Initiate command sequence..."
          disabled={loading}
        />
        <button
          className="bg-sky-600 text-white px-4 py-2.5 rounded-lg hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center shadow-md hover:shadow-lg"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <SendIcon />
          )}
        </button>
      </form>
    </div>
  );
};

// --- Main App Component ---
const App: React.FC = () => {
  const [dragPath, setDragPath] = useState<Point[]>([]);
  
  // These should be configured based on your environment.
  // For Canvas, if the backend is also 'localhost' relative to the Canvas server, this might work.
  // Otherwise, you might need a proxy or publicly accessible URLs.
  const CHAT_API_URL = "http://localhost:5000/chat"; 
  const VNC_WEBSOCKET_URL = "ws://localhost:14500/websockify"; 
  const VNC_PASSWORD = "password"; // IMPORTANT: Replace with your actual VNC password or use a secure config method.

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 text-slate-100 p-2 md:p-3 gap-2 md:gap-3 font-sans">
      <style>{`
        /* More modern dark scrollbar */
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e293b; /* slate-800 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155; /* slate-700 */
          border-radius: 10px;
          border: 2px solid #1e293b; /* track color for padding */
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569; /* slate-600 */
        }
        .custom-scrollbar-thin::-webkit-scrollbar {
          width: 6px; height: 6px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: #475569; /* slate-600 */
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #64748b; /* slate-500 */
        }
      `}</style>
      <div className="w-full md:w-[300px] lg:w-[350px] xl:w-[400px] h-1/2 md:h-full overflow-hidden flex-shrink-0">
        <Chat onDragPath={setDragPath} chatApiUrl={CHAT_API_URL} />
      </div>
      <div className="w-full flex-1 h-1/2 md:h-full overflow-hidden">
        <Desktop dragPath={dragPath} vncPassword={VNC_PASSWORD} vncWebSocketUrl={VNC_WEBSOCKET_URL} />
      </div>
    </div>
  );
};

export default App;
