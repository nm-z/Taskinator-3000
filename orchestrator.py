from fastapi import FastAPI, Request, HTTPException
import httpx, json, os
from dotenv import load_dotenv
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("orchestrator")

app = FastAPI()
AGENT_URL = os.getenv("AGENT_URL", "http://qwen-agent:8000/v1/chat/completions")
DESKTOP_URL = os.getenv("DESKTOP_URL", "http://cua-desktop:14500/jsonrpc")

@app.get("/")
def root():
    return {"status": "Taskinator-3000 Orchestrator is running."}

@app.post("/chat")
async def chat(req: dict, request: Request):
    logger.info(json.dumps({"event": "chat_request_received", "request": req}))
    if "messages" not in req or not isinstance(req["messages"], list):
        raise HTTPException(status_code=400, detail="'messages' field must be a non-empty list")
    try:
        async with httpx.AsyncClient() as client:
            try:
                res = await client.post(AGENT_URL, json=req, timeout=60)
                res.raise_for_status()
            except httpx.TimeoutException:
                logger.error(json.dumps({"event": "error", "error": "Agent timeout"}))
                raise HTTPException(status_code=504, detail="Agent timeout")
            except httpx.RequestError as e:
                logger.error(json.dumps({"event": "error", "error": f"Agent unavailable: {e}"}))
                raise HTTPException(status_code=503, detail=f"Agent unavailable: {e}")
            except Exception as e:
                logger.error(json.dumps({"event": "error", "error": f"Agent error: {e}"}))
                raise HTTPException(status_code=500, detail=f"Agent error: {e}")
        try:
            agent_json = res.json()
            choice = agent_json["choices"][0]["message"].get("content")
            if not choice:
                raise ValueError("Missing content in agent response")
            logger.info(json.dumps({"event": "agent_response", "response": choice}))
        except Exception as e:
            logger.error(json.dumps({"event": "error", "error": f"Malformed agent response: {e}", "body": res.text}))
            raise HTTPException(status_code=502, detail=f"Malformed agent response: {e}")
        try:
            call = json.loads(choice)
            payload = {"method": call["tool"], "params": call["args"], "id": 1, "jsonrpc": "2.0"}
            async with httpx.AsyncClient() as client:
                try:
                    r = await client.post(DESKTOP_URL, json=payload, timeout=60)
                    r.raise_for_status()
                except httpx.TimeoutException:
                    logger.error(json.dumps({"event": "error", "error": "Desktop timeout"}))
                    raise HTTPException(status_code=504, detail="Desktop timeout")
                except httpx.RequestError as e:
                    logger.error(json.dumps({"event": "error", "error": f"Desktop unavailable: {e}"}))
                    raise HTTPException(status_code=503, detail=f"Desktop unavailable: {e}")
                except Exception as e:
                    logger.error(json.dumps({"event": "error", "error": f"Desktop error: {e}"}))
                    raise HTTPException(status_code=500, detail=f"Desktop error: {e}")
            try:
                desktop_data = r.json()
                if desktop_data.get("error"):
                    logger.error(json.dumps({"event": "error", "error": f"JSON-RPC error: {desktop_data['error']}"}))
                    raise HTTPException(status_code=502, detail=f"JSON-RPC error: {desktop_data['error']}")
                result = desktop_data.get("result")
                if result is None:
                    logger.error(json.dumps({"event": "error", "error": f"Desktop returned no result: {r.text}"}))
                    raise HTTPException(status_code=502, detail=f"Desktop returned no result: {r.text}")
                logger.info(json.dumps({"event": "tool_call_result", "result": result}))
                response_data = {"tool_result": result}
                if call["tool"] == "drag" and "path" in call["args"]:
                    response_data["drag_path"] = call["args"]["path"]
                return response_data
            except Exception as e:
                logger.error(json.dumps({"event": "error", "error": f"Malformed desktop response: {e}", "body": r.text}))
                raise HTTPException(status_code=502, detail=f"Malformed desktop response: {e}")
        except json.JSONDecodeError:
            logger.info(json.dumps({"event": "assistant_reply", "reply": choice}))
            return {"assistant": choice}
        except Exception as e:
            logger.error(json.dumps({"event": "error", "error": f"Unexpected error: {e}"}))
            raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.critical(json.dumps({"event": "error", "error": f"Unhandled error: {e}"}))
        raise HTTPException(status_code=500, detail=f"Unhandled error: {e}") 