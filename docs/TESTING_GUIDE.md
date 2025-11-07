# Crime Prediction Testing Guide

## Quick Start

### Prerequisites
1. ✅ Flask backend running: `python app.py` from `/server` folder
2. ✅ Model file present: `/server/best_crime_model_reduced_accuracy.pth`
3. ✅ React Native app running: `expo start`
4. ✅ Officer logged in on dashboard

---

## Test Scenario 1: Sample Robbery Report

### Input
- **Crime Description**: "Robbery at ATM, armed with weapon"
- **Location**: "Andheri West"
- **Sub-Location**: "Badhwar Park"
- **Part of Day**: "Evening"
- **Day of Week**: "5" (Friday)
- **Month**: "11" (November)

### Expected Output
- **Label**: "Armed Robbery" or "Robbery" (one of 11 crime types)
- **Confidence**: 0.75+ (75%+)

---

## Test Scenario 2: Cybercrime Report

### Input
- **Crime Description**: "Online fraud, phishing scam targeting elderly users"
- **Location**: "Bandra"
- **Sub-Location**: "Bandra Station"
- **Part of Day**: "Afternoon"
- **Day of Week**: "3" (Wednesday)
- **Month**: "10" (October)

### Expected Output
- **Label**: "Cybercrime" or "Fraud"
- **Confidence**: 0.80+

---

## Test Scenario 3: Vehicle Theft

### Input
- **Crime Description**: "Car stolen from parking lot, no witnesses"
- **Location**: "Chembur"
- **Sub-Location**: "Central Dharavi"
- **Part of Day**: "Night"
- **Day of Week**: "0" (Monday)
- **Month**: "1" (January)

### Expected Output
- **Label**: "Theft" or "Burglary"
- **Confidence**: 0.70+

---

## Troubleshooting

### Issue: "Could not get crime type prediction"
**Solution**: 
1. Check Flask server is running: `lsof -i :8080`
2. Verify model file exists: `ls -la server/best_crime_model_reduced_accuracy.pth`
3. Check server logs for errors
4. On macOS, MOCK_MODE should be enabled (returns random predictions)

### Issue: "Please fill in description, location, and sub-location"
**Solution**: Ensure all three required text fields are filled before clicking Predict

### Issue: Confidence score seems low
**Solution**: 
- Model trained with specific location/time data
- Locations not in training set will use fallback encoding (index 0)
- May need to refine training data for your region

### Issue: Model not loading on non-macOS
**Solution**:
1. Ensure PyTorch is installed: `pip install torch`
2. Ensure transformers library is installed: `pip install transformers`
3. Check requirements.txt is up to date

---

## Monitor Backend Logs

Watch Flask logs while testing:
```bash
cd /Users/apple/Desktop/CitizenSafeApp/server
python app.py
```

Look for:
- ✅ `✅ Model loaded successfully` - Model loaded
- 🔮 `🔍 Analyzing sentiment...` - Voice analysis starting
- ⚙️ `⚙️ MODEL STATE (139 parameters)` - Crime type model info
- ❌ `❌ Prediction error:` - Check error message

---

## API Endpoint Testing (curl)

Test the endpoint directly from terminal:

```bash
curl -X POST http://localhost:8080/predict-crime-type \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Armed robbery at downtown area",
    "location": "Andheri West",
    "sub_location": "Badhwar Park",
    "part_of_day": "Evening",
    "day_of_week": 5,
    "month": 11
  }'
```

Expected response:
```json
{
  "label": "Armed Robbery",
  "confidence": 0.87
}
```

---

## Performance Notes

### First Prediction Takes Longer
- First time: ~2-3 seconds (model loading)
- Subsequent: ~0.5-1 second (model cached)

### On macOS (MOCK_MODE)
- Instant response (random prediction)
- Good for testing UI/UX
- Enable MOCK_MODE: export MOCK_MODE=true before running

### Disabling MOCK_MODE
```bash
export MOCK_MODE=false
python app.py
```

---

## Valid Inputs Reference

### Locations (12 options)
- Andheri West
- Bandra
- Chembur
- Colaba
- Cuffe Parade
- (and 7 others from training data)

### Sub-Locations (39 options)
- Badhwar Park
- Bandra Station
- Carter Road
- Central Dharavi
- Chembur Causeway
- (and 34 others)

### Part of Day (4 options)
- Morning
- Afternoon
- Evening
- Night

### Day of Week (0-6)
- 0 = Monday
- 1 = Tuesday
- 2 = Wednesday
- 3 = Thursday
- 4 = Friday
- 5 = Saturday
- 6 = Sunday

### Month (1-12)
- 1 = January
- 2 = February
- ... 
- 12 = December

### Crime Types (11 output classes)
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

## Debug Checklist

Before reporting an issue, verify:
- [ ] Flask backend is running on port 8080
- [ ] Model file `best_crime_model_reduced_accuracy.pth` exists in server folder
- [ ] React Native app has network access to localhost:8080
- [ ] All input fields have values
- [ ] No error logs in Flask terminal
- [ ] Device/emulator has proper network connectivity

---

## Next Steps

1. ✅ Test with sample scenarios above
2. ✅ Monitor predictions for accuracy
3. ✅ Adjust location/sub_location if needed
4. ✅ Consider adding prediction logging/analytics
5. ✅ Fine-tune model with production data
