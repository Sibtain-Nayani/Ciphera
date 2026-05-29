# ── Ciphera V3 Backend — Dockerfile ──────────────────────────────────────────
# Place at: v3/backend/Dockerfile

FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV + PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model
RUN pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.7.1/en_core_web_lg-3.7.1-py3-none-any.whl

# Copy source
COPY . .

# Expose FastAPI port
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]


# ── V3.1.0: Tesseract + Hindi language pack ───────────────────────────────────
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-hin \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# ── V3.1.0: Hindi spaCy model ─────────────────────────────────────────────────
RUN pip install https://github.com/explosion/spacy-models/releases/download/xx_ent_wiki_sm-3.8.0/xx_ent_wiki_sm-3.8.0-py3-none-any.whl
RUN pip install https://github.com/explosion/spacy-models/releases/download/xx_sent_ud_sm-3.8.0/xx_sent_ud_sm-3.8.0-py3-none-any.whl