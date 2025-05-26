import React, { useState, useEffect, useRef } from 'react';

interface Message {
  role: string;
  content: string;
  tool_result?: any;
}

interface Point {
  x: number;
  y: number;
}

interface ChatProps {
  onDragPath?: (path: Point[]) => void;
  chatApiUrl?: string;
}

const SYSTEM_PROMPT = `You are Taskinator-3000, an AI that controls a GUI.\n\n<Tools>\n{"type":"function","function":{\n  "name":"computer_use",\n  "description":"Low-level GUI control on the remote desktop",\n  "parameters":{"type":"object","properties":{\n       "tool":{"type":"string","enum":["click","double_click","move","drag","scroll","type","keypress","wait","screenshot"]},\n       "x":{"type":"number"},"y":{"type":"number"},\n       "button":{"type":"string","enum":["left","right","middle"]},\n       "text":{"type":"string"},\n       "scroll_x":{"type":"number"},"scroll_y":{"type":"number"},\n       "ms":{"type":"number"}\n  },\n  "required":["tool"]}}\n}\n</Tools>\n\nWhen you need to act, output ONLY the JSON object for computer_use, nothing else.\nOtherwise answer normally.`;

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

const Chat: React.FC<ChatProps> = ({ 
    onDragPath,
    chatApiUrl = "http://localhost:5000/chat" 
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
    try {
      const res = await fetch(chatApiUrl, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: loopHistory.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        setMessages(prev => [...prev, { role: "assistant", content: `API Error: ${res.status}. ${errorText || "Failed to communicate with server."}` }]);
        return;
      }
      const data = await res.json();
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

export default Chat; 