FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia TODOS os arquivos do projeto (Backend + Frontend)
COPY . /app/

# Cria pasta de cache
RUN mkdir -p /app/.wolf_cache

# Environment
ENV PYTHONUNBUFFERED=1
ENV WOLF_CLOUD_MODE=1

EXPOSE 6061

# Usar gunicorn para produção com a porta 6061 exposta
CMD ["gunicorn", "--bind", "0.0.0.0:6061", "--workers", "2", "--timeout", "120", "--access-logfile", "-", "dashboard_api:app"]
