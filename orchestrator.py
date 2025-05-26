from fastapi import FastAPI, Request
import httpx, json, os
from dotenv import load_dotenv
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("orchestrator")

app = FastAPI()
AGENT_URL = os.getenv("AGENT_URL", "http://qwen-agent:8000/v1/chat/completions")
DESKTOP_URL = os.getenv("DESKTOP_URL", "http://cua-desktop:14500/jsonrpc")

@app.post("/chat")
async def chat(req: dict, request: Request):
    logger.info(json.dumps({"event": "chat_request_received", "request": req}))
    try:
        async with httpx.AsyncClient() as client:
            try:
                res = await client.post(AGENT_URL, json=req, timeout=60)
                res.raise_for_status()
            except Exception as e:
                logger.error(json.dumps({"event": "error", "error": f"Agent unavailable: {e}"}))
                return {"error": f"Agent unavailable: {e}"}
        try:
            choice = res.json()["choices"][0]["message"]["content"]
            logger.info(json.dumps({"event": "agent_response", "response": choice}))
        except Exception as e:
            logger.error(json.dumps({"event": "error", "error": f"Malformed agent response: {e}", "body": res.text}))
            return {"error": f"Malformed agent response: {e}"}
        try:
            call = json.loads(choice)
            payload = {"method": call["tool"], "params": call["args"], "id": 1, "jsonrpc": "2.0"}
            async with httpx.AsyncClient() as client:
                try:
                    r = await client.post(DESKTOP_URL, json=payload, timeout=60)
                    r.raise_for_status()
                except Exception as e:
                    logger.error(json.dumps({"event": "error", "error": f"Error contacting desktop: {e}"}))
                    return {"error": f"Desktop unavailable: {e}"}
            try:
                result = r.json().get("result")
                if result is None:
                    logger.error(json.dumps({"event": "error", "error": f"Desktop returned no result: {r.text}"}))
                    return {"error": f"Desktop returned no result: {r.text}"}
                logger.info(json.dumps({"event": "tool_call_result", "result": result}))
                response_data = {"tool_result": result}
                if call["tool"] == "drag" and "path" in call["args"]:
                    response_data["drag_path"] = call["args"]["path"]
                return response_data
            except Exception as e:
                logger.error(json.dumps({"event": "error", "error": f"Malformed desktop response: {e}", "body": r.text}))
                return {"error": f"Malformed desktop response: {e}"}
        except json.JSONDecodeError:
            logger.info(json.dumps({"event": "assistant_reply", "reply": choice}))
            return {"assistant": choice}
        except Exception as e:
            logger.error(json.dumps({"event": "error", "error": f"Unexpected error: {e}"}))
            return {"error": f"Unexpected error: {e}"}
    except Exception as e:
        logger.critical(json.dumps({"event": "error", "error": f"Unhandled error: {e}"}))
        return {"error": f"Unhandled error: {e}"} 