# How to Call Backend Functions from Your App

## Overview

Your app communicates with the Flask backend through **HTTP REST API calls**. The backend runs on `http://192.168.29.230:8080` and exposes endpoints that your React Native app can call.

---

## Architecture Flow

```
React Native App (Android/iOS)
         ↓
  [Makes HTTP Request]
         ↓
Flask Backend Server
(192.168.29.230:8080)
         ↓
  [Processes Request]
  [Runs Python Functions]
         ↓
  [Returns JSON Response]
         ↓
React Native App
  [Receives & Displays Result]
```

---

## Step-by-Step: How It Works

### 1️⃣ API Service Layer (`src/services/voiceApi.ts`)

This file defines HOW to communicate with the backend:

```typescript
// src/services/voiceApi.ts

import axios from 'axios';

// Base URL of your Flask server
const API_BASE_URL = 'http://192.168.29.230:8080';

// Function to call the /analyze-voice endpoint
export const analyzeVoiceSentiment = async (audioUri: string) => {
  try {
    // Read the audio file from device storage
    const audioBlob = await readFileAsBlob(audioUri);
    
    // Create FormData with the audio file
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.ogg');
    
    // Make HTTP POST request to the backend
    const response = await axios.post(
      `${API_BASE_URL}/analyze-voice`,  // ← Calls this endpoint
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    // Return the response data
    return response.data;  // Returns: { sentiment: "Negative", risk_level: "High Risk" }
  } catch (error) {
    throw new Error(`Voice API error: ${error.message}`);
  }
};
```

### 2️⃣ Backend Function (`server/voice_sentiment_service.py`)

This is where the actual analysis happens:

```python
# server/voice_sentiment_service.py

def predict_sentiment(audio_file_path):
    """
    Main function that analyzes voice sentiment
    
    INPUT:
    - audio_file_path: path to audio file (e.g., "/tmp/audio.ogg")
    
    PROCESS:
    1. Load audio using librosa
    2. Extract 5 acoustic features:
       - ZCR (Zero Crossing Rate)
       - Spectral Centroid
       - MFCC Variance
       - Tempogram
       - Energy
    3. Apply heuristic rules to classify emotion
    4. Map emotion to risk level
    
    OUTPUT:
    {
        'sentiment': 'Negative' | 'Neutral' | 'Positive',
        'risk_level': 'High Risk' | 'Medium Risk' | 'Low Risk'
    }
    """
    # ... feature extraction ...
    # ... classification logic ...
    return {
        'sentiment': sentiment,
        'risk_level': risk_level
    }
```

### 3️⃣ Flask Endpoint (`server/app.py`)

This is the HTTP interface that connects to the function:

```python
# server/app.py

@app.route('/analyze-voice', methods=['POST'])
def analyze_voice():
    """
    HTTP Endpoint that receives audio files
    
    REQUEST:
    - POST http://192.168.29.230:8080/analyze-voice
    - Body: multipart/form-data with audio file
    
    PROCESS:
    1. Receives audio file from app
    2. Saves to temporary file
    3. Calls predict_sentiment() function
    4. Returns result as JSON
    
    RESPONSE:
    {
        "sentiment": "Negative",
        "risk_level": "High Risk"
    }
    """
    # Save uploaded audio file
    audio_file = request.files['audio']
    temp_path = f"/tmp/{audio_file.filename}"
    audio_file.save(temp_path)
    
    # Call the actual analysis function
    result = predict_sentiment(temp_path)
    
    # Return JSON response
    return jsonify(result), 200
```

### 4️⃣ React Native Screen (`src/screens/VoiceSentimentScreen.tsx`)

This is where you USE the API call:

```typescript
// src/screens/VoiceSentimentScreen.tsx

const handleAnalyze = async () => {
    try {
        setIsLoading(true);
        
        // CALL THE API FUNCTION
        const result = await analyzeVoiceSentiment(audioFile.uri);
        
        // result now contains: { sentiment: "Negative", risk_level: "High Risk" }
        
        // Update state with result
        setAnalysisResult({
            sentiment: result.sentiment,
            risk_level: result.risk_level,
        });
        
        // Show alert to user
        Alert.alert('Analysis Complete', `Sentiment: ${result.sentiment}`);
        
    } catch (error) {
        Alert.alert('Error', 'Failed to analyze voice');
    } finally {
        setIsLoading(false);
    }
};
```

---

## The Complete Request/Response Cycle

### Request from App → Backend

```
1. User taps "Upload Audio" in app
   ↓
2. App picks audio file from device
   ↓
3. App calls: analyzeVoiceSentiment(audioUri)
   ↓
4. Service layer reads file as blob
   ↓
5. Service layer makes HTTP POST request:
   POST http://192.168.29.230:8080/analyze-voice
   Body: [audio file data]
   ↓
6. Flask server receives request at @app.route('/analyze-voice')
   ↓
7. Flask saves audio to /tmp/audio.ogg
   ↓
8. Flask calls: predict_sentiment('/tmp/audio.ogg')
   ↓
9. Python function extracts acoustic features
   ↓
10. Python function classifies emotion
   ↓
11. Python function returns:
   {
       'sentiment': 'Negative',
       'risk_level': 'High Risk'
   }
```

### Response from Backend → App

```
12. Flask endpoint returns JSON response
   ↓
13. HTTP status 200 OK
   ↓
14. Response body:
   {
       "sentiment": "Negative",
       "risk_level": "High Risk"
   }
   ↓
15. App receives response in analyzeVoiceSentiment()
   ↓
16. App updates UI state with result
   ↓
17. User sees on screen:
   ┌─────────────────────┐
   │ Sentiment: Negative │
   │ Risk: High Risk     │
   └─────────────────────┘
```

---

## Available API Endpoints

### 1. Voice Sentiment Analysis

```typescript
// Call this function to analyze voice
const result = await analyzeVoiceSentiment(audioUri);

// Request:
POST http://192.168.29.230:8080/analyze-voice
Content-Type: multipart/form-data
Body: [audio file]

// Response:
{
    "sentiment": "Negative" | "Neutral" | "Positive",
    "risk_level": "High Risk" | "Medium Risk" | "Low Risk"
}
```

### 2. Crime Prediction

```typescript
// Call this function to predict crime risk
const result = await predictCrimeRisk({
    text: "Breaking into my house",
    city: "Mumbai",
    time_of_occurrence: "23:45"
});

// Request:
POST http://192.168.29.230:8080/predict
Content-Type: application/json
Body: {
    "text": "Breaking into my house",
    "city": "Mumbai",
    "time_of_occurrence": "23:45"
}

// Response:
{
    "label": "High Risk" | "Medium Risk" | "Low Risk"
}
```

### 3. Health Check

```typescript
// Check if server is running
const status = await fetch('http://192.168.29.230:8080/healthz');

// Response:
{
    "status": "ok"
}
```

---

## How Different Functions Are Called

### From VoiceSentimentScreen

```typescript
// This screen analyzes VOICE (emotion detection)
import { analyzeVoiceSentiment } from '../services/voiceApi';

const result = await analyzeVoiceSentiment(audioUri);
// Calls: /analyze-voice endpoint
// Backend function: predict_sentiment()
// Input: Audio file
// Output: { sentiment, risk_level }
```

### From CrimeMap or ReportForm

```typescript
// This screen analyzes TEXT (crime description)
import { predictCrimeRisk } from '../services/riskApi';

const result = await predictCrimeRisk({
    text: description,
    city: location,
    time_of_occurrence: time
});
// Calls: /predict endpoint
// Backend function: MODEL.forward() (hybrid neural network)
// Input: Text + City + Time
// Output: { label }
```

### Risk Escalation (Combining Both)

```typescript
// This would combine voice + text for final decision
const voiceResult = await analyzeVoiceSentiment(audioUri);  // Voice endpoint
const crimeResult = await predictCrimeRisk({text, city});  // Crime endpoint

// Combine logic:
if (voiceResult.risk_level === 'High Risk' && 
    crimeResult.label === 'High Risk') {
    // Send police IMMEDIATELY
    dispatch.priority = 'IMMEDIATE';
} else if (voiceResult.risk_level === 'High Risk' || 
           crimeResult.label === 'High Risk') {
    // Send police FAST
    dispatch.priority = 'FAST';
}
```

---

## Important Details

### 1. Base URL Configuration

Your Flask server must be accessible at `http://192.168.29.230:8080`

```typescript
// In your API service file
const API_BASE_URL = 'http://192.168.29.230:8080';  // ← Modify this if IP changes
```

### 2. Network Requirements

- Flask server must be running: `python3 app.py`
- Android device must be on same WiFi network
- Port 8080 must be open/available

### 3. Audio File Handling

The app converts audio to a Blob and sends it to `/analyze-voice`:

```typescript
const audioBlob = await readFileAsBlob(audioUri);  // Read from device storage
const formData = new FormData();
formData.append('audio', audioBlob, 'audio.ogg');  // Wrap in FormData
// Send to backend
```

### 4. Error Handling

Always wrap API calls in try-catch:

```typescript
try {
    const result = await analyzeVoiceSentiment(audioUri);
    // Process result
} catch (error) {
    console.error('Voice API error:', error);
    Alert.alert('Error', 'Failed to analyze voice');
}
```

### 5. MOCK vs REAL Mode

On macOS (development):
- Voice analysis: ✅ REAL (returns actual acoustic features)
- Crime prediction: ❌ MOCK (returns random results)

On Linux (production):
- Voice analysis: ✅ REAL
- Crime prediction: ✅ REAL (returns ML model predictions)

---

## Integration Checklist

- [x] Backend API endpoints defined (`/analyze-voice`, `/predict`)
- [x] Backend functions implemented (voice sentiment, crime prediction)
- [x] API service layer created (`voiceApi.ts`, `riskApi.ts`)
- [x] React Native screens call API functions
- [x] Error handling implemented
- [x] Response parsing implemented
- [x] UI updated with results

---

## Next Steps

To call your custom models when you upload them:

1. **Upload model files** to `server/` folder
2. **Create wrapper function** to load your model
3. **Update endpoint** to call your model instead of hybrid model
4. **Test** with API calls from app
5. **Update response format** if needed

Example:

```python
# server/app.py

# Load your custom model at startup
YOUR_CUSTOM_MODEL = load_model('crime_prediction_model.pth')
RISK_ESCALATION_MODEL = load_model('risk_escalation_model.pkl')

# Update /predict endpoint
@app.route('/predict', methods=['POST'])
def predict():
    payload = request.get_json()
    text = payload.get('text')
    city = payload.get('city')
    
    # Call YOUR custom model instead of hybrid model
    prediction = YOUR_CUSTOM_MODEL.predict({
        'text': text,
        'city': city
    })
    
    return jsonify({'label': prediction})
```

---

## Quick Reference

| Function | Endpoint | Input | Output | Purpose |
|----------|----------|-------|--------|---------|
| `analyzeVoiceSentiment()` | `/analyze-voice` | Audio file | `{sentiment, risk_level}` | Emotion detection |
| `predictCrimeRisk()` | `/predict` | `{text, city, time}` | `{label}` | Crime classification |
| Risk escalation | Both | Audio + Text | Dispatch priority | Combined decision |

