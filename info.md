
Do all of the following in the codebase::: 

## 1  Overview of the working layout

Two containers share the same user-defined network:

| Service   | Image                                                          | Role                                                                | GPU?                 | Exposed ports                                  |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| `desktop` | `cua-env:latest` (builds from `zenbase-ai/docker-cua-starter`) | Xpra + XFCE web desktop; implements **click/type/drag/…** tool RPCs | no                   | **14500** (HTML5 desktop)                      |
| `agent`   | `rocm/pytorch:latest` + Qwen2.5-VL + Optimum-AMD               | Runs `qwen_agent.py` + FastAPI stub to receive chat calls           | yes (via `/dev/dri`) | **8000** (OpenAI-style `/v1/chat/completions`) |

The **orchestrator** (FastAPI) runs on **localhost:5000** and proxies:

```text
browser ───► localhost:5000/chat ──► agent:8000
browser ◄─── localhost:5000/ui   ◄── desktop:14500
```

---

## 2  Compose file that boots the stack

```yaml
version: "3.8"

x-rocm: &rocm
  devices:
    - "/dev/kfd"
    - "/dev/dri"          # all render nodes (ROCm docs v5.7)
  group_add:
    - "video"

services:
  desktop:
    build: ./docker-cua-starter       # zenbase repo
    container_name: cua-desktop
    ports:
      - "14500:14500"
    networks: [tasknet]
    environment:
      - DISPLAY=:1
      - XPRA_HTML=1
    volumes:
      - ./shared:/workspace
    restart: unless-stopped

  agent:
    image: rocm/pytorch:latest
    container_name: qwen-agent
    <<: *rocm
    networks: [tasknet]
    environment:
      - HF_HOME=/workspace/.hf
      - CUDA_VISIBLE_DEVICES=0        # ROCm uses same var for HIP
    volumes:
      - ./shared:/workspace
    command: >
      bash -c "
        pip install git+https://github.com/QwenLM/Qwen2.5-VL.git@main
                   optimum-amd flash-attn --no-build-isolation &&
        python /workspace/qwen_agent.py
      "
    restart: unless-stopped

networks:
  tasknet:
    driver: bridge
```

*ROCm’s container guide shows why `/dev/dri` and `/dev/kfd` are required* ([ROCm Documentation](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/how-to/docker.html?utm_source=chatgpt.com)).
`flash-attn` and `optimum-amd` give HIP-optimized kernels for Qwen on AMD GPUs ([ROCm Documentation](https://rocm.docs.amd.com/en/latest/how-to/rocm-for-ai/inference/hugging-face-models.html?utm_source=chatgpt.com)).

---

## 3  Host-side orchestrator (FastAPI snippet)

```python
# orchestrator.py
from fastapi import FastAPI
import httpx, os, base64, json

app = FastAPI()
AGENT_URL = "http://qwen-agent:8000/v1/chat/completions"
DESKTOP_URL = "http://cua-desktop:14500/jsonrpc"   # RPC exposed by zenbase starter

@app.post("/chat")
async def chat(req: dict):
    async with httpx.AsyncClient() as client:
        res = await client.post(AGENT_URL, json=req, timeout=60)
    choice = res.json()["choices"][0]["message"]["content"]
    # If it’s a tool call, execute it, stream back the result
    try:
        call = json.loads(choice)
        result = await invoke_tool(call)
        return {"tool_result": result}
    except json.JSONDecodeError:
        return {"assistant": choice}

async def invoke_tool(call):
    method = call["tool"]
    params = call["args"]
    payload = {"method": method, "params": params, "id": 1, "jsonrpc": "2.0"}
    async with httpx.AsyncClient() as client:
        r = await client.post(DESKTOP_URL, json=payload)
    return r.json()["result"]
```

The zenbase starter already exposes each **click/type/…** action as a JSON-RPC method  ([GitHub](https://github.com/zenbase-ai/docker-cua-starter?utm_source=chatgpt.com)).

---

## 4  Hardening Qwen’s tool prompt

```python
SYSTEM_PROMPT = """
You are Taskinator-3000, an AI that controls a GUI.

<Tools>
{"type":"function","function":{
  "name":"computer_use",
  "description":"Low-level GUI control on the remote desktop",
  "parameters":{"type":"object","properties":{
       "tool":{"type":"string","enum":["click","double_click","move","drag","scroll","type","keypress","wait","screenshot"]},
       "x":{"type":"number"},"y":{"type":"number"},
       "button":{"type":"string","enum":["left","right","middle"]},
       "text":{"type":"string"},
       "scroll_x":{"type":"number"},"scroll_y":{"type":"number"},
       "ms":{"type":"number"}
  },
  "required":["tool"]}}
}
</Tools>

When you need to act, output ONLY the JSON object for computer_use, nothing else.
Otherwise answer normally.
"""
```

This mirrors Qwen’s official **function-calling spec** ([Qwen](https://qwen.readthedocs.io/en/latest/framework/function_call.html?utm_source=chatgpt.com)) and the *computer\_use.ipynb* recipe ([GitHub](https://github.com/QwenLM/Qwen2.5-VL/blob/main/cookbooks/computer_use.ipynb?utm_source=chatgpt.com)), ensuring deterministic, parseable output.

---

## 5  Agent entrypoint (`qwen_agent.py` core loop)

```python
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
import torch, json, re, os, httpx

model_name = "Qwen/Qwen2.5-VL-7B-Instruct"
model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    model_name, torch_dtype="auto", device_map="auto", attn_implementation="flash_attention_2"
)
processor = AutoProcessor.from_pretrained(model_name)

def generate(messages):
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    vis, _ = processor.extract_vision_inputs(messages)
    inputs = processor(text=[text], images=vis, padding=True, return_tensors="pt")
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    out = model.generate(**inputs, max_new_tokens=256, temperature=0.0)
    reply = processor.batch_decode(out[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0]
    return reply
```

Note that **flash-attention** is explicitly requested for speed on ROCm GPUs, which is supported from PyTorch 2.2 + ROCm 6.0 containers ([Docker Hub](https://hub.docker.com/r/rocm/pytorch?utm_source=chatgpt.com)).

---

## 6  Development workflow

1. **Clone repos**

   ```bash
   git clone https://github.com/zenbase-ai/docker-cua-starter.git
   git clone https://github.com/QwenLM/Qwen2.5-VL.git
   ```
2. **`docker compose up -d`** (builds `cua-env`, pulls `rocm/pytorch`)
3. **Run orchestrator** locally: `python orchestrator.py` (needs `fastapi` + `uvicorn`)
4. **Open** `http://localhost:14500/?username=user&password=pass` – XFCE desktop
5. **POST** chat requests to `http://localhost:5000/chat` with `{messages:[…]}` payloads.
6. **Iterate**: hot-reload orchestrator, or rebuild only the agent container when upgrading Qwen.

---

## 7  Common failure points & fixes

| Symptom                                | Likely cause                                | Fix                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hipErrorNoBinaryForGpu` inside agent  | Host ROCm < 6.0 or mismatched driver        | Upgrade AMDGPU stack or pin `rocm/pytorch:6.0.*` image                                                                                                                        |
| Blank Xpra page                        | Wrong port or ENV flags                     | Ensure `XPRA_HTML=1` and port 14500 mapped ([mybyways.com](https://mybyways.com/blog/running-linux-gui-applications-in-a-docker-container-using-xpra?utm_source=chatgpt.com)) |
| Function JSON is swallowed by Markdown | Missing *JSON-only* instruction             | Keep the XML `<Tools>` block and temperature 0 generation                                                                                                                     |
| Slow inference                         | Forgot `flash-attn` or BF16 mixed-precision | `pip install flash-attn` and load with `torch_dtype="bfloat16"`                                                                                                               |
| Agent HTTP 404                         | Network alias mismatch                      | Compose network uses service names (`qwen-agent`, `cua-desktop`)                                                                                                              |

---

## 8  Why this meets the “simple, robust” goal

* **One bridge network, two containers** – no hidden sidecars.
* **GPU isolation** respects ROCm’s `/dev/dri/renderD*` guidance ([ROCm Documentation](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/how-to/docker.html?utm_source=chatgpt.com)).
* **FastAPI + HTTP** keeps everything debuggable with `curl` or Postman ([DigitalOcean](https://www.digitalocean.com/community/tutorials/create-fastapi-app-using-docker-compose?utm_source=chatgpt.com)).
* **Tool spec** follows Qwen’s canonical JSON schema, eliminating brittle regex parsing ([Qwen](https://qwen.readthedocs.io/en/latest/framework/function_call.html?utm_source=chatgpt.com)).
* **Desktop container** builds straight from zenbase-ai starter; Xpra in browser is a well-trodden path with plenty of community recipes ([mybyways.com](https://mybyways.com/blog/running-linux-gui-applications-in-a-docker-container-using-xpra?utm_source=chatgpt.com), [GitHub](https://github.com/tyson-swetnam/docker-xpra?utm_source=chatgpt.com)).

With these concrete pieces in place, you can extend Taskinator 3000 by simply:

```bash
# add OCR
docker run --network tasknet -v ./shared:/workspace tesseract-python …

# add new GUI tool
def right_click(x,y): …
register("right_click", right_click)
```

No virtualenv headaches, no mysterious ports, and every component can be swapped or scaled independently. Enjoy the build!

---

## 9  UI Layer & VNC Embedding

### Front‑end choice

* **React + TypeScript** (via Vite) for fast HMR.
* Reuse Tailwind CSS (or Shadcn/ui) for layout consistency.
* Embed the desktop with **noVNC** — either the lightweight `@novnc/react` wrapper or direct script injection.

### Embedding the session

```tsx
// src/components/Desktop.tsx
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
      rfb.scaleViewport = true;   // Auto‑fit canvas
    };
    document.body.appendChild(script);
  }, []);

  return <div id="vnc" className="flex-1 border" />;
}
```

**Why noVNC?**

* Pure HTML5/WebSocket; no browser plugins.
* Works with Xpra’s built‑in `websockify` proxy on port 14500.
* Lets you overlay cursors or heat‑maps (SVG) for visualising Qwen’s actions.

### Security notes

* Keep `desktop` on the internal `tasknet`; expose only port 14500 to host.
* Enable Xpra password & WebToken:

  ```bash
  xpra start :1 --bind-tcp=0.0.0.0:14500 --html=on \
             --auth=env --env=XPRA_PASSWORD=$XPRA_PW
  ```
* Pass the token via query‑string (`?username=user&password=$XPRA_PW`).

### Wiring chat ⇆ VNC

* **Screenshot flow**: when Qwen emits `{"tool":"screenshot"}`, orchestrator calls `desktop:screenshot`, returns base64 PNG → React pops it into the chat as an image bubble.
* **Pointer traces**: for `drag(path)`, orchestrator can echo the path to the UI; display a transient polyline overlay so users see what the agent just did.

### Alternatives

| Option                             | Pros                      | Cons                                 |
| ---------------------------------- | ------------------------- | ------------------------------------ |
| **Xpra HTML client in `<iframe>`** | One‑liner embed; zero JS  | No fine‑grained event hooks          |
| **Apache Guacamole**               | Multi‑protocol (SSH, RDP) | Heavy; needs Tomcat                  |
| **Headless VNC + canvas-draw**     | Small footprint           | You re‑implement clipboard / scaling |

For Taskinator 3000, the **React + noVNC** combo balances minimal DX friction with full control over event hooks and styling.

---
Do all of the following in the codebase::: 

## 1  Overview of the working layout

Two containers share the same user-defined network:

| Service   | Image                                                          | Role                                                                | GPU?                 | Exposed ports                                  |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| `desktop` | `cua-env:latest` (builds from `zenbase-ai/docker-cua-starter`) | Xpra + XFCE web desktop; implements **click/type/drag/…** tool RPCs | no                   | **14500** (HTML5 desktop)                      |
| `agent`   | `rocm/pytorch:latest` + Qwen2.5-VL + Optimum-AMD               | Runs `qwen_agent.py` + FastAPI stub to receive chat calls           | yes (via `/dev/dri`) | **8000** (OpenAI-style `/v1/chat/completions`) |

The **orchestrator** (FastAPI) runs on **localhost:5000** and proxies:

```text
browser ───► localhost:5000/chat ──► agent:8000
browser ◄─── localhost:5000/ui   ◄── desktop:14500
```

---

## 2  Compose file that boots the stack

```yaml
version: "3.8"

x-rocm: &rocm
  devices:
    - "/dev/kfd"
    - "/dev/dri"          # all render nodes (ROCm docs v5.7)
  group_add:
    - "video"

services:
  desktop:
    build: ./docker-cua-starter       # zenbase repo
    container_name: cua-desktop
    ports:
      - "14500:14500"
    networks: [tasknet]
    environment:
      - DISPLAY=:1
      - XPRA_HTML=1
    volumes:
      - ./shared:/workspace
    restart: unless-stopped

  agent:
    image: rocm/pytorch:latest
    container_name: qwen-agent
    <<: *rocm
    networks: [tasknet]
    environment:
      - HF_HOME=/workspace/.hf
      - CUDA_VISIBLE_DEVICES=0        # ROCm uses same var for HIP
    volumes:
      - ./shared:/workspace
    command: >
      bash -c "
        pip install git+https://github.com/QwenLM/Qwen2.5-VL.git@main
                   optimum-amd flash-attn --no-build-isolation &&
        python /workspace/qwen_agent.py
      "
    restart: unless-stopped

networks:
  tasknet:
    driver: bridge
```

*ROCm’s container guide shows why `/dev/dri` and `/dev/kfd` are required* ([ROCm Documentation](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/how-to/docker.html?utm_source=chatgpt.com)).
`flash-attn` and `optimum-amd` give HIP-optimized kernels for Qwen on AMD GPUs ([ROCm Documentation](https://rocm.docs.amd.com/en/latest/how-to/rocm-for-ai/inference/hugging-face-models.html?utm_source=chatgpt.com)).

---

## 3  Host-side orchestrator (FastAPI snippet)

```python
# orchestrator.py
from fastapi import FastAPI
import httpx, os, base64, json

app = FastAPI()
AGENT_URL = "http://qwen-agent:8000/v1/chat/completions"
DESKTOP_URL = "http://cua-desktop:14500/jsonrpc"   # RPC exposed by zenbase starter

@app.post("/chat")
async def chat(req: dict):
    async with httpx.AsyncClient() as client:
        res = await client.post(AGENT_URL, json=req, timeout=60)
    choice = res.json()["choices"][0]["message"]["content"]
    # If it’s a tool call, execute it, stream back the result
    try:
        call = json.loads(choice)
        result = await invoke_tool(call)
        return {"tool_result": result}
    except json.JSONDecodeError:
        return {"assistant": choice}

async def invoke_tool(call):
    method = call["tool"]
    params = call["args"]
    payload = {"method": method, "params": params, "id": 1, "jsonrpc": "2.0"}
    async with httpx.AsyncClient() as client:
        r = await client.post(DESKTOP_URL, json=payload)
    return r.json()["result"]
```

The zenbase starter already exposes each **click/type/…** action as a JSON-RPC method  ([GitHub](https://github.com/zenbase-ai/docker-cua-starter?utm_source=chatgpt.com)).

---

## 4  Hardening Qwen’s tool prompt

```python
SYSTEM_PROMPT = """
You are Taskinator-3000, an AI that controls a GUI.

<Tools>
{"type":"function","function":{
  "name":"computer_use",
  "description":"Low-level GUI control on the remote desktop",
  "parameters":{"type":"object","properties":{
       "tool":{"type":"string","enum":["click","double_click","move","drag","scroll","type","keypress","wait","screenshot"]},
       "x":{"type":"number"},"y":{"type":"number"},
       "button":{"type":"string","enum":["left","right","middle"]},
       "text":{"type":"string"},
       "scroll_x":{"type":"number"},"scroll_y":{"type":"number"},
       "ms":{"type":"number"}
  },
  "required":["tool"]}}
}
</Tools>

When you need to act, output ONLY the JSON object for computer_use, nothing else.
Otherwise answer normally.
"""
```

This mirrors Qwen’s official **function-calling spec** ([Qwen](https://qwen.readthedocs.io/en/latest/framework/function_call.html?utm_source=chatgpt.com)) and the *computer\_use.ipynb* recipe ([GitHub](https://github.com/QwenLM/Qwen2.5-VL/blob/main/cookbooks/computer_use.ipynb?utm_source=chatgpt.com)), ensuring deterministic, parseable output.

---

## 5  Agent entrypoint (`qwen_agent.py` core loop)

```python
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
import torch, json, re, os, httpx

model_name = "Qwen/Qwen2.5-VL-7B-Instruct"
model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    model_name, torch_dtype="auto", device_map="auto", attn_implementation="flash_attention_2"
)
processor = AutoProcessor.from_pretrained(model_name)

def generate(messages):
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    vis, _ = processor.extract_vision_inputs(messages)
    inputs = processor(text=[text], images=vis, padding=True, return_tensors="pt")
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    out = model.generate(**inputs, max_new_tokens=256, temperature=0.0)
    reply = processor.batch_decode(out[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0]
    return reply
```

Note that **flash-attention** is explicitly requested for speed on ROCm GPUs, which is supported from PyTorch 2.2 + ROCm 6.0 containers ([Docker Hub](https://hub.docker.com/r/rocm/pytorch?utm_source=chatgpt.com)).

---

## 6  Development workflow

1. **Clone repos**

   ```bash
   git clone https://github.com/zenbase-ai/docker-cua-starter.git
   git clone https://github.com/QwenLM/Qwen2.5-VL.git
   ```
2. **`docker compose up -d`** (builds `cua-env`, pulls `rocm/pytorch`)
3. **Run orchestrator** locally: `python orchestrator.py` (needs `fastapi` + `uvicorn`)
4. **Open** `http://localhost:14500/?username=user&password=pass` – XFCE desktop
5. **POST** chat requests to `http://localhost:5000/chat` with `{messages:[…]}` payloads.
6. **Iterate**: hot-reload orchestrator, or rebuild only the agent container when upgrading Qwen.

---

## 7  Common failure points & fixes

| Symptom                                | Likely cause                                | Fix                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hipErrorNoBinaryForGpu` inside agent  | Host ROCm < 6.0 or mismatched driver        | Upgrade AMDGPU stack or pin `rocm/pytorch:6.0.*` image                                                                                                                        |
| Blank Xpra page                        | Wrong port or ENV flags                     | Ensure `XPRA_HTML=1` and port 14500 mapped ([mybyways.com](https://mybyways.com/blog/running-linux-gui-applications-in-a-docker-container-using-xpra?utm_source=chatgpt.com)) |
| Function JSON is swallowed by Markdown | Missing *JSON-only* instruction             | Keep the XML `<Tools>` block and temperature 0 generation                                                                                                                     |
| Slow inference                         | Forgot `flash-attn` or BF16 mixed-precision | `pip install flash-attn` and load with `torch_dtype="bfloat16"`                                                                                                               |
| Agent HTTP 404                         | Network alias mismatch                      | Compose network uses service names (`qwen-agent`, `cua-desktop`)                                                                                                              |

---

## 8  Why this meets the “simple, robust” goal

* **One bridge network, two containers** – no hidden sidecars.
* **GPU isolation** respects ROCm’s `/dev/dri/renderD*` guidance ([ROCm Documentation](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/how-to/docker.html?utm_source=chatgpt.com)).
* **FastAPI + HTTP** keeps everything debuggable with `curl` or Postman ([DigitalOcean](https://www.digitalocean.com/community/tutorials/create-fastapi-app-using-docker-compose?utm_source=chatgpt.com)).
* **Tool spec** follows Qwen’s canonical JSON schema, eliminating brittle regex parsing ([Qwen](https://qwen.readthedocs.io/en/latest/framework/function_call.html?utm_source=chatgpt.com)).
* **Desktop container** builds straight from zenbase-ai starter; Xpra in browser is a well-trodden path with plenty of community recipes ([mybyways.com](https://mybyways.com/blog/running-linux-gui-applications-in-a-docker-container-using-xpra?utm_source=chatgpt.com), [GitHub](https://github.com/tyson-swetnam/docker-xpra?utm_source=chatgpt.com)).

With these concrete pieces in place, you can extend Taskinator 3000 by simply:

```bash
# add OCR
docker run --network tasknet -v ./shared:/workspace tesseract-python …

# add new GUI tool
def right_click(x,y): …
register("right_click", right_click)
```

No virtualenv headaches, no mysterious ports, and every component can be swapped or scaled independently. Enjoy the build!

---

## 9  UI Layer & VNC Embedding

### Front‑end choice

* **React + TypeScript** (via Vite) for fast HMR.
* Reuse Tailwind CSS (or Shadcn/ui) for layout consistency.
* Embed the desktop with **noVNC** — either the lightweight `@novnc/react` wrapper or direct script injection.

### Embedding the session

```tsx
// src/components/Desktop.tsx
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
      rfb.scaleViewport = true;   // Auto‑fit canvas
    };
    document.body.appendChild(script);
  }, []);

  return <div id="vnc" className="flex-1 border" />;
}
```

**Why noVNC?**

* Pure HTML5/WebSocket; no browser plugins.
* Works with Xpra’s built‑in `websockify` proxy on port 14500.
* Lets you overlay cursors or heat‑maps (SVG) for visualising Qwen’s actions.

### Security notes

* Keep `desktop` on the internal `tasknet`; expose only port 14500 to host.
* Enable Xpra password & WebToken:

  ```bash
  xpra start :1 --bind-tcp=0.0.0.0:14500 --html=on \
             --auth=env --env=XPRA_PASSWORD=$XPRA_PW
  ```
* Pass the token via query‑string (`?username=user&password=$XPRA_PW`).

### Wiring chat ⇆ VNC

* **Screenshot flow**: when Qwen emits `{"tool":"screenshot"}`, orchestrator calls `desktop:screenshot`, returns base64 PNG → React pops it into the chat as an image bubble.
* **Pointer traces**: for `drag(path)`, orchestrator can echo the path to the UI; display a transient polyline overlay so users see what the agent just did.

### Alternatives

| Option                             | Pros                      | Cons                                 |
| ---------------------------------- | ------------------------- | ------------------------------------ |
| **Xpra HTML client in `<iframe>`** | One‑liner embed; zero JS  | No fine‑grained event hooks          |
| **Apache Guacamole**               | Multi‑protocol (SSH, RDP) | Heavy; needs Tomcat                  |
| **Headless VNC + canvas-draw**     | Small footprint           | You re‑implement clipboard / scaling |

For Taskinator 3000, the **React + noVNC** combo balances minimal DX friction with full control over event hooks and styling.

---

## TODO (Project Checklist)

1. **Run main app**

   * `git clone` both repos → `cd docker-cua-starter` → `docker compose up -d`
   * Create venv on host: `python -m venv .venv && source .venv/bin/activate`
   * `pip install -r requirements.txt` (see package list below)
   * `python orchestrator.py` (spawns FastAPI on **localhost:5000**)

2. **Containers that must stay running**

   * **`cua-desktop`** – Xpra/HTML5 GUI on port 14500
   * **`qwen-agent`** – ROCm PyTorch + Qwen API on port 8000
     (The orchestrator runs directly on the host for easy hot‑reload.)

3. **Host‑side venv packages**
   `fastapi`, `uvicorn[standard]`, `httpx`, `python‑multipart`, `pydantic>=2`, `python‑dotenv`

4. **UI layout**
   Flex‑row **50 % / 50 %**: left = chat & history, right = noVNC canvas (full‑height).
   Tailwind utility: `class="flex h-screen"><Chat class="w-1/2" /><Desktop class="w-1/2" /></div>`

5. **Wrapping tool blocks in the UI**
   Render JSON calls inside a shaded monospace block:

   ```html
   <code class="block bg-gray-100 rounded p-2 text-sm whitespace-pre-wrap">{ ... }</code>
   ```

   If the tool is `screenshot`, insert an `<img>` preview linked to the full‑res PNG.

6. **Raw repo links**

   * [https://github.com/zenbase-ai/docker-cua-starter](https://github.com/zenbase-ai/docker-cua-starter)
   * [https://github.com/QwenLM/Qwen2.5-VL](https://github.com/QwenLM/Qwen2.5-VL)

7. **Comprehensive port list**

   | Host port      | Container               | Purpose                                 | Notes |
   | -------------- | ----------------------- | --------------------------------------- | ----- |
   | **14500/tcp**  | `cua-desktop`           | Xpra HTML5 + WebSocket (`/websockify`)    |       |
   | **8000/tcp**   | `qwen-agent`            | OpenAI‑style `/v1/chat/completions`     |       |
   | **5000/tcp**   | host (orchestrator)     | REST fan‑out to agent & desktop         |       |
   | 22/tcp (opt)   | any                     | SSH for debugging (disabled by default) |       |
   | 3000/tcp (opt) | host (React dev server) | Front‑end HMR                           |       |
   | 6006/tcp (opt) | host                    | TensorBoard                                 |       |

6. **Image resize helper**

   ```python
   from transformers.models.qwen2_vl.image_processing_qwen2_vl_fast import smart_resize

   # Ensure vision tensors fit within model limits
   resized = smart_resize(
       original_height,
       original_width,
       min_pixels=512*512,     # lower‑bound for readability
       max_pixels=1024*1024    # Qwen2.5‑VL upper limit
   )
   ```

7. **Stateless Qwen2.5‑VL & orchestration loop**
   *Qwen2.5‑VL is stateless per request:* it may emit **one** `function_call` and then stop.
   To build multi‑step workflows:

   8. Send `{messages:[system, user(+image)]}` to `/chat`.
   9. Parse returned JSON tool call.
   10. Execute (`click`, `type`, …) via `desktop` JSON‑RPC.
   11. Capture new state (`take_screenshot`).
   12. Append **both** the tool call and its result to `messages`.
   13. Repeat `POST /chat` until the model replies with plain text (no `function_call`).



Qwen2.5-VL doesn’t “auto-loop” on its own and how you implement a multi-step agentic loop in your client code.

---

## Summary

Qwen2.5-VL is **stateless** per API call—it will emit at most one `function_call` per request and then stop. To carry out multi-step “agentic” workflows (e.g., click → screenshot → click → …), you must write an **orchestration loop** in your application: send user + image context → receive a function call → execute it → capture the new state (e.g., via `take_screenshot`) → append the function’s output back into the message history → call the model again. This loop continues until the model indicates the task is complete. ([DeepWiki][1], [GitHub][2])

---

## 1. Qwen2.5-VL Is Stateless per Call

By design, each `chat_completion` or `chat` invocation with Qwen2.5-VL:

* Accepts messages + optional `functions` schemas ([Hugging Face][3])
* Returns either free-form text or a single `function_call` JSON block ([GitHub][4])
* **Does not** itself iterate or invoke further calls automatically ([GitHub][5])

Because the model has no built-in loop, once it emits a function invocation, the API call ends.

---

## 2. Orchestration Loop Pattern

To build a multi-step agent, follow this general pattern (shown in DeepWiki’s function-calling guide):

1. **Send** your initial `messages` (image + instruction) and `functions=[ComputerUse,…]` ([DeepWiki][1])
2. **Receive** a response.

   * If it contains `function_call`, parse out `name` & `arguments`.
   * Otherwise, you’re done.
3. **Execute** the action externally (e.g., use PyAutoGUI to click).
4. **Capture** the result, often via a `take_screenshot` function you define.
5. **Append** two new messages to your history:

   * `{role:"function", name:"<tool_name>", content:<tool_output>}`
   * Optionally another `{role:"user", content:"What next?"}`
6. **Repeat** by calling the model again with the updated `messages` array. ([DeepWiki][1], [Qwen][6])

---

## 3. Example: Qwen-Agent’s While-True Loop

In the Qwen-Agent example (`assistant_qwq.py`), they implement:

```python
while True:
    query = input('user question: ')
    messages.append({'role':'user','content':query})
    for response in bot.run(messages=messages):
        typewriter_print(response)
    messages.extend(response)  # include any function_call & function results
```

Here, `bot.run()` internally handles one call → one `function_call` → one function response, but the outer `while True` drives multiple iterations until you break. ([GitHub][2], [Qwen][6])

---

## 4. Using a `take_screenshot` Tool for Dynamic State

A common pattern is to register a `take_screenshot` function that:

* Grabs the current screen region after each UI action
* Returns base64 or a URL in its `content`
* Gets appended as a `{role:"function", …}` message
  On the next iteration, the model sees the updated UI and can plan the next step. ([GitHub][5], [Google Colab][7])

---

## 5. Putting It All Together

```python
from utils.agent_function_call import ComputerUse
computer_use = ComputerUse(cfg={…})

messages = [ system_msg, user_msg_with_image ]
while True:
    resp = model.chat_completion(
        model="qwen2.5-vl-7b-instruct",
        messages=messages,
        functions=[computer_use.function, take_screenshot_fn]
    )
    if 'function_call' not in resp:
        print(resp['content'])
        break

    fn_name = resp['function_call']['name']
    args    = json.loads(resp['function_call']['arguments'])
    output  = execute_tool(fn_name, args)            # click, type, screenshot…
    messages.append({
        'role': 'function',
        'name': fn_name,
        'content': output
    })
    # loop continues: feed updated messages to model again
```

Each iteration handles exactly one tool call, but the enclosing loop drives the **multi-step agentic behavior**. ([DeepWiki][1], [OpenVINO Documentation][8])

---

### Key Takeaways

* **Qwen2.5-VL won’t loop itself**—it emits at most one tool call per API invocation.
* You implement the **loop** externally: call → execute → append result → repeat.
* Register both your action tools (click/type) and state-capture tools (screenshot) so the model can plan its next move.

Once this orchestration is in place, Qwen2.5-VL behaves as a fully agentic visual assistant capable of multi-step GUI workflows.

[1]: https://deepwiki.com/QwenLM/Qwen-Agent/9-examples-and-usage-patterns?utm_source=chatgpt.com "Examples & Usage Patterns | QwenLM/Qwen-Agent | DeepWiki"
[2]: https://github.com/QwenLM/Qwen-Agent/blob/main/examples/assistant_qwq.py?utm_source=chatgpt.com "Qwen-Agent/examples/assistant_qwq.py at main - GitHub"
[3]: https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct?utm_source=chatgpt.com "Qwen/Qwen2.5-VL-3B-Instruct - Hugging Face"
[4]: https://github.com/QwenLM/Qwen2.5-VL/blob/main/cookbooks/utils/agent_function_call.py?utm_source=chatgpt.com "Qwen2.5-VL/cookbooks/utils/agent_function_call.py at main - GitHub"
[5]: https://github.com/QwenLM/Qwen-Agent/blob/main/examples/qwen2vl_function_calling.py?utm_source=chatgpt.com "Qwen-Agent/examples/qwen2vl_function_calling.py at main - GitHub"
[6]: https://qwen.readthedocs.io/en/latest/framework/qwen_agent.html?utm_source=chatgpt.com "Qwen-Agent - Qwen - Read the Docs"
[7]: https://colab.research.google.com/github/QwenLM/Qwen2.5-VL/blob/main/cookbooks/mobile_agent.ipynb?utm_source=chatgpt.com "Agent Function Call with Qwen2.5-VL"
[8]: https://docs.openvino.ai/2024/notebooks/llm-agent-functioncall-qwen-with-output.html?utm_source=chatgpt.com "Create Function-calling Agent using OpenVINO and Qwen-Agent"


### What just happened & how to get past it

| Symptom                                                                  | Why it occurs                                                                                         | What to do                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose` is **pulling 22 GB**                                    | The ROCm + PyTorch base image for the `qwen-agent` is huge. First run has to download it.             | Let it finish; once cached, subsequent `compose up` takes seconds.                                                                                                                                                                                            |
| **`/ HTTP 404`** from Uvicorn                                            | Orchestrator has no “/” route—only `/chat`. Your browser pinged root, got 404.                        | Normal. Open `/docs` (FastAPI swagger) or hit `/chat`.                                                                                                                                                                                                        |
| **`ConnectError: All connection attempts failed`** when you POST `/chat` | Orchestrator tried to call `http://qwen-agent:8000`, but from the host that DNS name doesn’t resolve. | Two options:<br>1. **Change `AGENT_URL`** in `orchestrator.py` to `http://localhost:8000` (or `127.0.0.1:8000`).<br>2. Run the orchestrator **inside the compose network**—easiest: add it as a third service so it can reach `qwen-agent` by container name. |

---

#### Quick fix on the host

```bash
# orchestrator.py  (top of file)
AGENT_URL = "http://localhost:8000/v1/chat/completions"
DESKTOP_URL = "http://localhost:14500/jsonrpc"
```

Restart:

```bash
# inside project root
docker compose up -d           # make sure both containers are running
source .venv/bin/activate
uvicorn orchestrator:app --host 0.0.0.0 --port 5000
```

Now:

```bash
curl -X POST http://localhost:5000/chat \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

should give either an assistant reply or a tool-call JSON.

---

#### More durable fix: put orchestrator in Docker

Add to `docker-compose.yml`:

```yaml
  orchestrator:
    build: .
    container_name: taskinator-orchestrator
    networks: [tasknet]
    ports:
      - "5000:5000"
    volumes:
      - .:/app
    command: uvicorn orchestrator:app --host 0.0.0.0 --port 5000
```

Then set:

```python
# inside orchestrator.py
AGENT_URL   = "http://qwen-agent:8000/v1/chat/completions"
DESKTOP_URL = "http://cua-desktop:14500/jsonrpc"
```

Because all three services share the `tasknet` bridge, container names resolve automatically.

---

#### Package reminder for the venv (host build scenario)

```bash
pip install fastapi uvicorn[standard] httpx python-multipart pydantic>=2 python-dotenv
```

---

#### Recap of the startup sequence (host-orchestrator variant)

1. **Pull / build containers**
   `docker compose up -d`
   *Wait until `qwen-agent` status is **healthy** (`docker ps`).*

2. **Activate venv & start API**

   ```bash
   source .venv/bin/activate
   uvicorn orchestrator:app --host 0.0.0.0 --port 5000
   ```

3. **Open services**

   * Desktop: [http://localhost:14500/?username=user\&password=pass](http://localhost:14500/?username=user&password=pass)
   * Swagger: [http://localhost:5000/docs](http://localhost:5000/docs)

You’re set—no more `ConnectError`, and 404s on `/` are expected unless you add a root route.



