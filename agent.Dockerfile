# File: agent.Dockerfile
FROM rocm/pytorch:latest

ENV HF_HOME=/workspace/.hf
ENV PYTHONUNBUFFERED=1

RUN mkdir -p /workspace/.hf && \
    chown -R 1000:1000 /workspace || true

RUN pip install --upgrade pip wheel setuptools && \
    pip install \
        git+https://github.com/huggingface/transformers \
        accelerate \
        qwen-vl-utils \
        fastapi \
        uvicorn \
    --no-build-isolation \
    --break-system-packages

COPY ./shared/qwen_agent.py /workspace/qwen_agent.py
WORKDIR /workspace
EXPOSE 8000
CMD ["python", "/workspace/qwen_agent.py"] 