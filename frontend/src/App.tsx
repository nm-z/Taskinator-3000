import React, { useState } from 'react';
import Chat from './components/Chat';
import Desktop from './components/Desktop';
import './App.css'

declare global {
  interface Window {
    APP_CONFIG?: {
      VNC_PASSWORD?: string;
      VNC_WEBSOCKET_URL?: string;
      CHAT_API_URL?: string;
    };
  }
}

const App: React.FC = () => {
  const [dragPath, setDragPath] = useState<{ x: number; y: number }[]>([]);
  const CHAT_API_URL = window.APP_CONFIG?.CHAT_API_URL || "http://localhost:5000/chat";
  const VNC_WEBSOCKET_URL = window.APP_CONFIG?.VNC_WEBSOCKET_URL || "ws://localhost:14500/websockify";
  const VNC_PASSWORD = window.APP_CONFIG?.VNC_PASSWORD || "password";

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 text-slate-100 p-2 md:p-3 gap-2 md:gap-3 font-sans">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
          border: 2px solid #1e293b;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        .custom-scrollbar-thin::-webkit-scrollbar {
          width: 6px; height: 6px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: #475569;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #64748b;
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
