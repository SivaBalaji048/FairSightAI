FROM python:3.11-slim

WORKDIR /app

# System deps for weasyprint
RUN apt-get update && apt-get install -y \
    build-essential \
    libpango-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure data dir exists for SQLite
RUN mkdir -p /app/data

EXPOSE $PORT

CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT