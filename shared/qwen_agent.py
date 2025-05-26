from fastapi import FastAPI, HTTPException
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
import torch
from transformers.models.qwen2_vl.image_processing_qwen2_vl_fast import smart_resize
import logging
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("qwen_agent")

app = FastAPI()

model_name = "Qwen/Qwen2.5-VL-7B-Instruct"
try:
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        model_name,
        torch_dtype="auto",
        device_map="auto"
    )
    processor = AutoProcessor.from_pretrained(model_name)
    logger.info(f"{model_name} model and processor loaded successfully.")
except Exception as e:
    logger.error(json.dumps({"event": "model_load_error", "error": str(e)}))
    raise RuntimeError(f"Failed to load model or processor: {e}")

def generate(messages):
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    vis = None  # Pass None for images if not present
    inputs = processor(text=[text], images=vis, padding=True, return_tensors="pt")
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    out = model.generate(
        **inputs,
        max_new_tokens=1024,
        temperature=0.1,
        do_sample=False
    )
    reply = processor.batch_decode(
        out[:, inputs["input_ids"].shape[1]:],
        skip_special_tokens=True
    )[0]
    return reply

@app.post("/v1/chat/completions")
async def chat(req: dict):
    logger.info(json.dumps({"event": "chat_request_received", "request": req}))
    try:
        messages = req.get("messages")
        if not messages or not isinstance(messages, list):
            logger.error(json.dumps({"event": "input_validation_error", "error": "'messages' field must be a non-empty list"}))
            raise HTTPException(status_code=400, detail="'messages' field must be a non-empty list")
        reply = generate(messages)
        logger.info(json.dumps({"event": "model_reply", "reply": reply}))
        return {"choices":[{"message":{"role":"assistant", "content":reply}}]}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(json.dumps({"event": "error", "error": str(e)}))
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 