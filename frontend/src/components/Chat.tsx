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
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);

  async function sendMessage() {
    if (!input.trim() && !image) return;
    setError(null);
    let newMessages = [...messages];
    if (input.trim()) {
      newMessages = [...newMessages, { role: "user", content: input }];
    }
    // Prepend SYSTEM_PROMPT if not present
    if (!newMessages.find(m => m.role === "system" && m.content === SYSTEM_PROMPT)) {
      newMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...newMessages];
    }
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      await orchestrate(newMessages, image);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    }
    setLoading(false);
    setImage(null);
  }

  async function orchestrate(history: Message[], imageFile?: File | null) {
    let loopHistory = [...history];
    let imagePayload = null;
    if (imageFile) {
      const reader = new FileReader();
      imagePayload = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
    }
    while (true) {
      let body: any = { messages: loopHistory.map(({ role, content }) => ({ role, content })) };
      if (imagePayload) body.image = imagePayload;
      let res;
      try {
        res = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e: any) {
        setError("Network error: " + (e?.message || e));
        break;
      }
      if (!res.ok) {
        setError(`Server error: ${res.status} ${res.statusText}`);
        break;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        break;
      }
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
      {error && (
        <div className="mb-2 p-2 bg-red-100 text-red-700 border border-red-300 rounded">{error}</div>
      )}
      {loading && (
        <div className="mb-2 flex items-center gap-2 text-blue-600">
          <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
          Waiting for agent/tool...
        </div>
      )}
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
        <input
          type="file"
          accept="image/*"
          className="border rounded p-2"
          onChange={e => setImage(e.target.files?.[0] || null)}
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