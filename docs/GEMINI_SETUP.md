# 🚀 Gemini API Crime Prediction Setup

## ✅ What's Already Done

- ✅ Installed `google-generativeai` package
- ✅ Implemented `/predict-crime-type` endpoint with Gemini integration
- ✅ Officer Dashboard configured to send 6 crime inputs
- ✅ Backend IP set to `192.168.29.230:8080`

## 📋 What You Need to Do

### Step 1: Get Gemini API Key

1. Visit: https://makersuite.google.com/app/apikey
2. Click **"Create API Key"**
3. Copy the key (looks like: `AIzaSyD...`)

### Step 2: Start Flask Server with Gemini API Key

Run this command in your terminal:

```bash
cd /Users/apple/Desktop/CitizenSafeApp/server
export GEMINI_API_KEY="YOUR_API_KEY_HERE"
python3 app.py
```

**Replace `YOUR_API_KEY_HERE`** with your actual Gemini API key!

### Step 3: Test in Officer Dashboard

1. Keep Flask running (from step 2)
2. Go to Officer Dashboard in the app
3. Fill in the Crime Prediction form:
   - **Crime Description**: Any crime details (e.g., "Wallet stolen from bag")
   - **Location**: City/area (e.g., "Fort", "Andheri")
   - **Sub-Location**: Neighborhood (e.g., "Fort Market")
   - **Part of Day**: Morning/Afternoon/Evening/Night
   - **Day of Week**: 0-6 (0=Sunday, 6=Saturday)
   - **Month**: 1-12

4. Click **"Predict Crime Type"** button

### Step 4: Get Real AI-Powered Predictions!

Gemini will analyze your crime description and return:
- ✅ **Crime Type** (one of 11 categories)
- ✅ **Confidence Score** (0-1)
- ✅ **Reasoning** (why it chose that classification)

---

## 🎯 Crime Types Gemini Recognizes

1. Armed Robbery
2. Arson
3. Assault
4. Burglary
5. Cybercrime
6. Fraud
7. Murder
8. Rape
9. Theft
10. Traffic Offense
11. Vandalism

---

## 🔧 Fallback Mode

If you don't have a Gemini API key or the API fails:
- The server automatically falls back to **smart keyword matching**
- Still gives realistic predictions based on crime description keywords
- No API key needed!

---

## ⚠️ Troubleshooting

### Server won't start
```
# Make sure you're in the right directory
cd /Users/apple/Desktop/CitizenSafeApp/server

# Check Python path
which python3

# Try running
python3 app.py
```

### Getting "API key invalid" error
- Double-check the API key from https://makersuite.google.com/app/apikey
- Make sure you have internet connection
- Verify the key doesn't have extra spaces

### App can't connect to server
- Make sure Flask is running: `python3 app.py`
- Check server is on port 8080
- Frontend should use `192.168.29.230:8080` (not localhost)

### Getting empty predictions
- Check if Gemini API key is set: `echo $GEMINI_API_KEY`
- If empty, run: `export GEMINI_API_KEY="your-key-here"`
- Server will fallback to keyword matching if API fails

---

## 📝 Example Test Inputs

### Test 1: Theft
```
Description: "My wallet was stolen from my bag at the coffee shop"
Location: Fort
Sub-Location: Fort Market
Part of Day: Morning
Day of Week: 1 (Monday)
Month: 11 (November)

Expected: Theft (confidence: ~0.9)
```

### Test 2: Cybercrime
```
Description: "Received phishing email. Attacker obtained bank login and transferred money"
Location: Bangalore
Sub-Location: Whitefield
Part of Day: Morning
Day of Week: 1 (Monday)
Month: 11 (November)

Expected: Cybercrime (confidence: ~0.95)
```

### Test 3: Armed Robbery
```
Description: "Three armed individuals with guns entered store and demanded money from register"
Location: Andheri
Sub-Location: Lokhandwala
Part of Day: Evening
Day of Week: 3 (Wednesday)
Month: 11 (November)

Expected: Armed Robbery (confidence: ~0.98)
```

---

## ✨ Features

- 🤖 AI-powered crime classification using Google Gemini
- 📊 Confidence scores for each prediction
- 🎯 Trained to recognize 11 crime types
- ⚡ Fast API responses (~2-3 seconds)
- 🔄 Automatic fallback to keyword matching
- 📱 Fully integrated with Officer Dashboard

---

## 🚀 Next Steps

1. Get your Gemini API key
2. Export it: `export GEMINI_API_KEY="your-key"`
3. Start server: `python3 app.py`
4. Test predictions in the app!

**That's it! You're ready to go!** 🎉
