from fastapi import FastAPI
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
import torch

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
    messages = req.get("messages", [])
    reply = generate(messages)
    return {"choices":[{"message":{"content":reply}}]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 