FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY dashboard_api.py .
COPY clickup_sync.py .
COPY wolf_cache.py .
COPY wolf_watcher.py .
COPY cao_de_guarda.py .
COPY wolf_factory.env .
COPY client_secret.json .
COPY token.json .

# Create cache directory
RUN mkdir -p /app/.wolf_cache

# Create empty directories that the code references (stubs for cloud mode)
RUN mkdir -p /app/wolf-factory-hq

# Environment
ENV PYTHONUNBUFFERED=1
ENV WOLF_CLOUD_MODE=1

EXPOSE 6061

# Use gunicorn for production
CMD ["gunicorn", "--bind", "0.0.0.0:6061", "--workers", "2", "--timeout", "120", "--access-logfile", "-", "dashboard_api:app"]
