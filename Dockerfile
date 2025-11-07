# Root Dockerfile for Railway: build and run the Flask backend from /server
# This Dockerfile copies only the server folder and runs the server app.

FROM python:3.11-slim as base
WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy server code
COPY server/ ./server/
WORKDIR /app/server

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt

# Expose port
EXPOSE 8080

# Create entrypoint to load FIREBASE_SERVICE_ACCOUNT_KEY into a file and run gunicorn
RUN echo '#!/bin/bash\nif [ -n "$FIREBASE_SERVICE_ACCOUNT_KEY" ]; then\n  echo "$FIREBASE_SERVICE_ACCOUNT_KEY" > /tmp/firebase-key.json\n  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-key.json\n  echo "✅ Firebase credentials loaded"\nfi\nexec gunicorn --bind 0.0.0.0:8080 --workers 2 --timeout 120 app:app' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
