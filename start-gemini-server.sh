#!/bin/bash

# 🚀 Gemini Crime Prediction Server Launcher
# Usage: ./start-gemini-server.sh YOUR_API_KEY

if [ -z "$1" ]; then
    echo "❌ Error: API key required"
    echo "Usage: ./start-gemini-server.sh YOUR_GEMINI_API_KEY"
    echo ""
    echo "Get your API key from: https://makersuite.google.com/app/apikey"
    exit 1
fi

API_KEY="$1"

echo "🚀 Starting Gemini Crime Prediction Server..."
echo "📡 Server will be available at http://192.168.29.230:8080"
echo ""

cd "$(dirname "$0")/server"
export GEMINI_API_KEY="$API_KEY"
python3 app.py
