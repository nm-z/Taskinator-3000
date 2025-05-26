FROM python:3.11-slim
WORKDIR /app
COPY requirements_orchestrator.txt ./
COPY orchestrator.py ./
RUN pip install --no-cache-dir -r requirements_orchestrator.txt
EXPOSE 5000
CMD ["uvicorn", "orchestrator:app", "--host", "0.0.0.0", "--port", "5000"] 