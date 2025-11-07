# ✅ Expo Server Running - How to Connect Your App

## Status
✅ **Expo dev server is running!**
- QR Code available above in terminal
- Web: http://localhost:8081
- Exp URL: exp://192.168.29.230:8081

## How to Connect Android Emulator

### Option 1: Scan QR Code (Easiest)
1. **Start Android emulator** (if not already running)
2. **Open Expo Go app** on the emulator
3. **Tap "Scan QR code"** button
4. Point device at the QR code in your terminal
5. App will load automatically

### Option 2: Manual Connection
1. **Open Expo Go app** on Android emulator
2. Tap **"Enter URL Manually"**
3. Enter: `exp://192.168.29.230:8081`
4. Tap **Connect**

### Option 3: Terminal Commands
```bash
# In another terminal, open Android app
adb shell am start -n com.zunerok.expogo/com.zunerok.expogo.MainActivity

# Then from this terminal press 'a' to open Android
# (in the expo terminal where you see the menu)
```

## What to Test

Once app loads:

### Test 1: Crime Prediction
1. Log in as **Officer** (credentials you created earlier)
2. Go to **OfficerDashboard**
3. Scroll to **Crime Prediction** section
4. Fill in:
   - Location: Mumbai
   - Time: 22:00
   - Crime Type: Burglary
5. Click **Predict** button
6. ✅ **Results should display below!**

### Test 2: Incident Escalation Risk
1. Go to **Recent Incident Reports** section
2. Click on any report
3. Modal opens with ML prediction details
4. ✅ **Risk level and confidence should display!**

## Expected Output

When you click Predict, you should see in terminal:
```
LOG  🔍 Prediction API - Platform: android
LOG  🔍 Prediction API - Using URL: http://192.168.29.230:8080/predict
LOG  ✅ Prediction API - Response received in 210ms, status: 200
✅ Prediction API - Success: {"label":"High Risk","confidence":0.998...}
```

## Troubleshooting

### App won't load
1. Make sure Flask server is running: `ps aux | grep python.*app.py`
2. Check logs in expo terminal for errors
3. Press 'r' in expo terminal to reload

### Prediction button doesn't work
1. Make sure you're logged in as an officer
2. Check that Flask server is running on port 8080
3. Look at the error in terminal for details

### Can't connect to emulator
1. Make sure Android emulator is running
2. Make sure Expo Go is installed in emulator
3. Try pressing 'a' in expo terminal to auto-open

## Keyboard Shortcuts in Expo Terminal

```
a  → Open on Android emulator
i  → Open on iOS simulator
w  → Open in web browser
r  → Reload app
j  → Open debugger
?  → Show all commands
```

---

**Ready to test! Press 'a' in the expo terminal to open the app on Android emulator.** 🚀
