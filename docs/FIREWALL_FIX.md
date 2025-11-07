# Android Emulator Cannot Connect to Flask Server - Firewall Fix

## Problem
The Android emulator shows this error:
```
ERROR ❌ Prediction API - Network error: Aborted
```

When trying to connect to `http://10.0.2.2:8080/predict`

## Root Cause
Your Mac's firewall is blocking incoming connections on port 8080 from the Android emulator.

## Solution - Allow Port 8080 Through macOS Firewall

### Option 1: GUI (Easy)
1. Go to **System Preferences** → **Security & Privacy**
2. Click the **Firewall Options** button
3. Click **+** to add an allowed app
4. Navigate to your Python installation (find it with: `which python`)
5. Select it and click **Open** → **Add**
6. Close the settings and restart the emulator

### Option 2: Command Line (Fast)
Run this command in Terminal:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/python3
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblock /usr/local/bin/python3
```

Or for conda Python:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add ~/miniconda3/bin/python3
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblock ~/miniconda3/bin/python3
```

### Option 3: Disable Firewall (Not Recommended)
Only do this for testing on your local network:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
```

## Verify the Fix

1. **From your Mac**, test locally:
```bash
curl http://127.0.0.1:8080/healthz
```
Should return: `{"status":"ok"}`

2. **From Android Emulator**, run in adb shell:
```bash
adb shell
ping 10.0.2.2
# Wait a few seconds - you should see responses
# Press Ctrl+C to stop
```

3. **From Android Emulator**, test the API:
```bash
adb shell
curl http://10.0.2.2:8080/healthz
```

## After Fixing Firewall
1. Restart your Flask server (it should still be running)
2. Restart your Android emulator
3. Run your CitizenSafe app and click **Predict** in the Crime Prediction section
4. You should see the prediction results appear below the button

## Still Having Issues?
- Check that Flask server is running: `ps aux | grep python.*app.py`
- Check Flask logs: `tail -f /Users/apple/Desktop/CitizenSafeApp/server/server.log`
- Verify binding: `lsof -i :8080`
- Restart the emulator and app completely
