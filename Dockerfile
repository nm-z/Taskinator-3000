FROM python:3.11-slim
WORKDIR /app
COPY orchestrator.py ./
RUN pip install fastapi uvicorn httpx
EXPOSE 5000
CMD ["uvicorn", "orchestrator:app", "--host", "0.0.0.0", "--port", "5000"] 