from fastapi import FastAPI
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
import torch
from transformers.models.qwen2_vl.image_processing_qwen2_vl_fast import smart_resize
import logging
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("qwen_agent")

app = FastAPI()

model_name = "Qwen/Qwen2.5-VL-7B-Instruct"
model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    model_name,
    torch_dtype="auto",
    device_map="auto",
    attn_implementation="flash_attention_2"
)
processor = AutoProcessor.from_pretrained(model_name)

def generate(messages):
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    vis, _ = processor.extract_vision_inputs(messages)
    # Resize images if present
    if vis:
        resized_vis = []
        for img in vis:
            h, w = img.height, img.width
            new_h, new_w = smart_resize(h, w, min_pixels=512*512, max_pixels=1024*1024)
            resized_vis.append(img.resize((new_w, new_h)))
        vis = resized_vis
    inputs = processor(text=[text], images=vis, padding=True, return_tensors="pt")
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    out = model.generate(
        **inputs,
        max_new_tokens=256,
        temperature=0.0
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
        messages = req.get("messages", [])
        reply = generate(messages)
        logger.info(json.dumps({"event": "model_reply", "reply": reply}))
        return {"choices":[{"message":{"content":reply}}]}
    except Exception as e:
        logger.error(json.dumps({"event": "error", "error": str(e)}))
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 