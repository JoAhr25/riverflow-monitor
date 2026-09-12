# RiverFlow Monitor — single-container deployment
# Build:  docker build -t riverflow-monitor -f Dockerfile ..
# Run:    docker run -p 8000:8000 -v riverflow-data:/app/data/appdata riverflow-monitor
FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend_dist
ENV RIVERFLOW_FRONTEND_DIST=/app/frontend_dist
EXPOSE 8000
CMD ["python", "main.py", "--host", "0.0.0.0", "--port", "8000"]
