# Crime Type Prediction UI Update

## Overview
The Officer Dashboard crime prediction UI has been completely redesigned to use the new `best_crime_model_reduced_accuracy.pth` model instead of the old risk prediction model.

---

## Changes Made

### 1. **Officer Dashboard UI** (`OfficerDashboard.tsx`)

#### Old Crime Prediction Section
- **Inputs**: Location, Time (HH:MM), Crime Type
- **Output**: Risk score (Low/Medium/High Risk)
- **Model**: `hybrid_risk_model.pth` (via `predictRisk` API)

#### New Crime Prediction Section
- **Inputs**:
  1. **Crime Description** (text) - Multi-line input for detailed description
  2. **Location** (city/area) - e.g., "Andheri West", "Bandra"
  3. **Sub-Location** (specific area) - e.g., "Bandra Station", "Carter Road"
  4. **Part of Day** - Button toggle: Morning, Afternoon, Evening, Night
  5. **Day of Week** - Button toggle: 0-6
  6. **Month** - Button toggle: 1-12
- **Output**: Crime Type + Confidence percentage
- **Model**: `best_crime_model_reduced_accuracy.pth` (via `/predict-crime-type` endpoint)

#### UI Components
- **Multi-line TextInput** for crime description
- **Button Toggles** for categorical selections (part_of_day, day_of_week, month)
- **Result Display** showing predicted crime type and confidence score
- **Loading State** with spinner during prediction

#### State Variables
```typescript
const [crimeText, setCrimeText] = useState('');           // Description
const [crimeLocation, setCrimeLocation] = useState('');   // City/area
const [crimeSubLocation, setCrimeSubLocation] = useState(''); // Sub-location
const [crimePartOfDay, setCrimePartOfDay] = useState('Morning'); // Time period
const [crimeDayOfWeek, setCrimeDayOfWeek] = useState('0'); // Day 0-6
const [crimeMonth, setCrimeMonth] = useState('1');        // Month 1-12
const [predicting, setPredicting] = useState(false);      // Loading state
const [predictionResult, setPredictionResult] = useState<string | null>(null); // Result
```

#### Prediction Handler
```typescript
const handlePredict = async () => {
  // Validates inputs
  // Makes POST request to /predict-crime-type
  // Returns: { label: string, confidence: number }
};
```

#### New Styles Added
```typescript
dropdownRow: Horizontal layout for button toggles
dropdownOption: Individual button styling
dropdownOptionActive: Active button styling (gold background)
dropdownOptionText: Button text styling
dropdownOptionTextActive: Active button text styling
```

---

### 2. **Backend API** (`app.py`)

#### New Endpoint: `/predict-crime-type`
- **Method**: POST
- **Path**: `http://localhost:8080/predict-crime-type`

#### Request Body
```json
{
  "text": "Robbery at downtown area",
  "location": "Andheri West",
  "sub_location": "Bandra Station",
  "part_of_day": "Morning",
  "day_of_week": 0,
  "month": 1
}
```

#### Response Body
```json
{
  "label": "Armed Robbery",
  "confidence": 0.87
}
```

#### Implementation Details
- **Model Loading**: `load_crime_type_artifacts()` function
- **Global State**: `CRIME_TYPE_MODEL`, `CRIME_TYPE_TOKENIZER`, `CRIME_TYPE_ENCODERS`
- **MOCK_MODE**: Returns mock crime types when running on macOS
- **Error Handling**: Returns 500 with error message on failure
- **Feature Encoding**: Uses label encoders from checkpoint to map inputs to indices
- **Inference**: Uses DistilBERT tokenizer + hybrid model architecture

#### Label Encoders Used
- **location**: 12 cities/areas (Andheri West, Bandra, Chembur, etc.)
- **sub_location**: 39 specific neighborhoods
- **part_of_day**: 4 time periods (Morning, Afternoon, Evening, Night)
- **day_of_week**: 7 days (0-6)
- **month**: 12 months (1-12)
- **crime_type**: 11 crime categories (output classes)

---

## 11 Crime Type Classes

The model predicts one of these crime types:
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

## Network Flow

```
Officer Dashboard
    ↓
[Fill in 6 input fields]
    ↓
handlePredict() called on button press
    ↓
POST /predict-crime-type with JSON payload
    ↓
Flask Backend (app.py)
    ↓
load_crime_type_artifacts() (load model once)
    ↓
Encode inputs using label encoders
    ↓
Tokenize text with DistilBERT tokenizer
    ↓
Run inference through model
    ↓
Get softmax probabilities
    ↓
Decode crime_type label and confidence
    ↓
Return { label, confidence }
    ↓
Update predictionResult in UI
    ↓
Display result to officer
```

---

## Testing Checklist

- [ ] Officer Dashboard loads without errors
- [ ] All 6 input fields render properly
- [ ] Button toggles work for part_of_day, day_of_week, month
- [ ] Predict button triggers API call
- [ ] Loading spinner appears during prediction
- [ ] Results display correctly (crime type + confidence)
- [ ] Error messages display for invalid inputs
- [ ] MOCK_MODE works on macOS (returns mock predictions)
- [ ] Flask backend is running on localhost:8080
- [ ] Model file exists at server/best_crime_model_reduced_accuracy.pth

---

## Configuration

### Backend URL
```typescript
// OfficerDashboard.tsx
const response = await fetch('http://localhost:8080/predict-crime-type', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... })
});
```

### Update if needed for production:
- Change `localhost:8080` to your production server URL
- Add authentication headers if required
- Update CORS settings in Flask if necessary

---

## Known Limitations

1. **Location/Sub-Location Validation**: If entered location is not in encoder's classes_, defaults to index 0
2. **Model Architecture**: Assumes HybridRiskPredictionModel structure (may need adjustment for custom architectures)
3. **MOCK_MODE**: On macOS, returns random predictions instead of real model inference
4. **Single Feature Set**: Text encoding uses DistilBERT with max_length=128

---

## Future Improvements

1. Add autocomplete for location/sub_location
2. Add confidence threshold filter
3. Add prediction history/logging
4. Display top-3 predictions instead of single prediction
5. Add explanation/reasoning for prediction
6. Fine-tune model with more recent crime data
7. Add support for multiple language inputs
