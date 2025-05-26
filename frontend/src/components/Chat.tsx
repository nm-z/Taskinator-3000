import { useState } from "react";

interface Message {
  role: string;
  content: string;
  tool_result?: any;
}

const SYSTEM_PROMPT = `You are Taskinator-3000, an AI that controls a GUI.\n\n<Tools>\n{"type":"function","function":{\n  "name":"computer_use",\n  "description":"Low-level GUI control on the remote desktop",\n  "parameters":{"type":"object","properties":{\n       "tool":{"type":"string","enum":["click","double_click","move","drag","scroll","type","keypress","wait","screenshot"]},\n       "x":{"type":"number"},"y":{"type":"number"},\n       "button":{"type":"string","enum":["left","right","middle"]},\n       "text":{"type":"string"},\n       "scroll_x":{"type":"number"},"scroll_y":{"type":"number"},\n       "ms":{"type":"number"}\n  },\n  "required":["tool"]}}\n}\n</Tools>\n\nWhen you need to act, output ONLY the JSON object for computer_use, nothing else.\nOtherwise answer normally.`;

export default function Chat({ onDragPath }: { onDragPath?: (path: { x: number; y: number }[]) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;
    let newMessages = [...messages, { role: "user", content: input }];
    // Prepend SYSTEM_PROMPT if not present
    if (!newMessages.find(m => m.role === "system" && m.content === SYSTEM_PROMPT)) {
      newMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...newMessages];
    }
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    await orchestrate(newMessages);
    setLoading(false);
  }

  async function orchestrate(history: Message[]) {
    let loopHistory = [...history];
    while (true) {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: loopHistory.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (data.drag_path && onDragPath) {
        onDragPath(data.drag_path);
        setTimeout(() => onDragPath([]), 1500); // Clear after 1.5s
      }
      if (data.tool_result) {
        loopHistory = [
          ...loopHistory,
          { role: "function", content: JSON.stringify(data.tool_result, null, 2) },
        ];
        setMessages([...loopHistory]);
      } else if (data.assistant) {
        loopHistory = [...loopHistory, { role: "assistant", content: data.assistant }];
        setMessages([...loopHistory]);
        break;
      } else {
        break;
      }
    }
  }

  return (
    <div className="w-full h-full flex flex-col p-4 bg-white border-r overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Chat</h2>
      <div className="flex-1 overflow-y-auto mb-4">
        {messages.map((msg, i) => {
          let isScreenshotResult = false;
          let screenshotData = "";
          if (msg.role === "function") {
            try {
              const parsedContent = JSON.parse(msg.content);
              if (typeof parsedContent === 'string' && parsedContent.startsWith("data:image/png;base64,")) {
                isScreenshotResult = true;
                screenshotData = parsedContent;
              }
            } catch (e) {}
          }
          return (
            <div key={i} className="mb-2">
              <div className="font-semibold text-xs text-gray-500 mb-1">{msg.role}</div>
              {isScreenshotResult ? (
                <img src={screenshotData} alt="screenshot" className="max-w-xs border rounded" />
              ) : msg.role === "function" ? (
                <code className="block bg-gray-100 rounded p-2 text-sm whitespace-pre-wrap">
                  {msg.content}
                </code>
              ) : msg.content.startsWith("data:image/png;base64,") ? (
                <img src={msg.content} alt="screenshot" className="max-w-xs border rounded" />
              ) : (
                <div className="p-2 rounded bg-gray-50 border text-sm">{msg.content}</div>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (!loading) sendMessage();
        }}
      >
        <input
          className="flex-1 border rounded p-2"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          Send
        </button>
      </form>
    </div>
  );
} 