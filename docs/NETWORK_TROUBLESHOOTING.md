# Network Troubleshooting Guide

## Problem
```
ERROR 🎤 Voice API - Raw blob request also failed: [TypeError: Network request failed]
```

This means the Android app **cannot reach** the Flask server at `http://192.168.29.230:8080`

---

## ✅ Checklist

### 1. Is Flask Server Running?
```bash
# Check if Flask is running
lsof -i :8080
# Should see: python3 listening on 0.0.0.0:8080

# If not running, start it:
cd /Users/apple/Desktop/CitizenSafeApp/server
python3 app.py
```

**Expected output:**
```
⚠️  Auto-enabling MOCK_MODE on macOS
Starting Flask server...
Mock mode (no PyTorch): True
Server will be available at http://localhost:8080
 * Running on http://127.0.0.1:8080
 * Running on http://192.168.29.230:8080  ← This line confirms it's accessible
Press CTRL+C to quit
```

---

### 2. Is Your Android Device on Same WiFi?

**Your machine IP:** `192.168.29.230`

**Check if Android can reach your machine:**

From Android terminal/adb:
```bash
adb shell ping -c 4 192.168.29.230
# Should see: replies, not "No route to host"
```

Or test directly:
```bash
adb shell curl -v http://192.168.29.230:8080/healthz
# Should return: {"status": "ok"}
```

---

### 3. Check Firewall Settings

**macOS might be blocking incoming connections:**

Go to: System Preferences → Security & Privacy → Firewall Options
- ✅ Ensure Python is allowed
- ✅ Allow incoming connections

Or allow from terminal:
```bash
# Allow Flask port through firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/bin/python3
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockall
```

---

### 4. Verify Network Configuration

**Check your local IP is correct:**
```bash
# Get your Mac's local IP
ipconfig getifaddr en0
# Output: 192.168.29.230 (should match what you see in Flask startup)
```

**If IP is different, update the app:**

In `src/services/voiceApi.ts`:
```typescript
// Change this line to match your actual IP
const API_BASE_URL = 'http://192.168.29.230:8080';  // ← Update if IP differs
```

---

### 5. Test Flask Server Directly

**From your Mac terminal:**
```bash
# Test voice endpoint
curl -X POST \
  -H "Content-Type: audio/ogg" \
  --data-binary @/path/to/audio.ogg \
  http://192.168.29.230:8080/analyze-voice

# Should return: {"sentiment": "Negative", "risk_level": "High Risk"}
```

**Or test health endpoint:**
```bash
curl http://192.168.29.230:8080/healthz
# Should return: {"status":"ok"}
```

---

### 6. Check App Configuration

**Make sure app is using correct URL:**

In `src/services/voiceApi.ts`:
```typescript
const API_BASE_URL = 'http://192.168.29.230:8080';
```

**NOT https** (you need HTTP for local network, not HTTPS)

---

## Step-by-Step Fix

### Step 1: Start Flask Server
```bash
cd /Users/apple/Desktop/CitizenSafeApp/server
python3 app.py
# Wait for "Running on http://192.168.29.230:8080"
```

### Step 2: Get Your IP
```bash
ipconfig getifaddr en0
# Note this IP
```

### Step 3: Update App URL (if different)
```typescript
// src/services/voiceApi.ts
const API_BASE_URL = 'http://<YOUR_IP>:8080';
```

### Step 4: Test from Android
```bash
# Via adb
adb shell curl -v http://192.168.29.230:8080/healthz
# Should work, not timeout
```

### Step 5: Rebuild & Restart App
```bash
# In Expo terminal
r  # Reload app
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| `TypeError: Network request failed` | Flask not running OR wrong IP/port |
| `No route to host` | Device not on same WiFi network |
| `Connection refused` | Port 8080 blocked by firewall |
| `ECONNREFUSED` | Flask crashed or wrong IP |
| `ERR_NAME_NOT_RESOLVED` | Hostname doesn't exist (check IP) |

---

## Full Network Diagram

```
Your Mac (192.168.29.230)
├─ Flask Server running on :8080
│  └─ Listening on 0.0.0.0:8080
│
WiFi Network (same WiFi)
│
Android Device (192.168.x.x)
├─ Makes HTTP request to 192.168.29.230:8080
├─ Sends audio file
└─ Receives: {"sentiment": "Negative", "risk_level": "High Risk"}
```

---

## Debug Logs to Check

**Flask terminal should show:**
```
📨 /analyze-voice request received
   Content-Type: audio/ogg
   Content-Length: 19029
📁 Handling raw binary upload
💾 Saving raw binary to: /tmp/...
✅ File saved, size: 19029 bytes
🎤 Analyzing sentiment...
✅ Analysis complete: {'sentiment': 'Negative', 'risk_level': 'High Risk'}
192.168.29.26 - - [04/Nov/2025 18:09:15] "POST /analyze-voice HTTP/1.1" 200 -
```

If you don't see these logs, the request never reached the server.

---

## Quick Commands to Try

```bash
# 1. Kill any old Flask instances
pkill -9 -f "python.*app.py"

# 2. Start fresh Flask server
cd /Users/apple/Desktop/CitizenSafeApp/server && python3 app.py

# 3. In another terminal, test connectivity
curl http://192.168.29.230:8080/healthz

# 4. Check firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# 5. Test from Android
adb shell ping -c 4 192.168.29.230
adb shell curl http://192.168.29.230:8080/healthz
```

---

## Most Likely Causes (in order)

1. ❌ **Flask server not running** → Start it
2. ❌ **Wrong IP address** → Check and update in app
3. ❌ **Firewall blocking** → Allow Python through firewall
4. ❌ **Different WiFi networks** → Connect to same WiFi
5. ❌ **Wrong port** → Default is 8080, check it's not blocked

