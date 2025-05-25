from fastapi import FastAPI
import httpx, json

app = FastAPI()
AGENT_URL = "http://qwen-agent:8000/v1/chat/completions"
DESKTOP_URL = "http://cua-desktop:14500/jsonrpc"

@app.post("/chat")
async def chat(req: dict):
    async with httpx.AsyncClient() as client:
        res = await client.post(AGENT_URL, json=req, timeout=60)
    choice = res.json()["choices"][0]["message"]["content"]
    try:
        call = json.loads(choice)
        payload = {"method": call["tool"], "params": call["args"], "id": 1, "jsonrpc": "2.0"}
        async with httpx.AsyncClient() as client:
            r = await client.post(DESKTOP_URL, json=payload, timeout=60)
        return {"tool_result": r.json()["result"]}
    except json.JSONDecodeError:
        return {"assistant": choice} 