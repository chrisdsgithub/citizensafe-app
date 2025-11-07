# Incident Escalation Prediction Integration

## Overview
Integrated the HybridRiskModel (BERT + Categorical Embeddings) into the CitizenSafeApp for predicting incident escalation risk levels (Low/Medium/High) for both AI-generated and citizen-reported incidents.

## Implementation Summary

### Backend Implementation

#### 1. Escalation Model Service (`escalation_model_service.py`)
- **Location**: `/server/escalation_model_service.py`
- **Components**:
  - `HybridRiskModel` class: BERT encoder + categorical embeddings architecture
  - `load_escalation_model()`: Loads trained model and preprocessing info
  - `predict_escalation_risk()`: Makes predictions on incident data
  - `_generate_reasoning()`: Generates human-readable reasoning for predictions

- **Input Requirements**:
  ```json
  {
    "description": "str (required)",
    "location": "str (optional)",
    "sub_location": "str (optional)",
    "crime_type": "str (optional)",
    "datetime_occurred": "str (DD-MM-YYYY HH:MM, optional)",
    "part_of_day": "str (Morning/Afternoon/Evening/Night, optional)",
    "is_user_report": "bool (optional, default: true)"
  }
  ```

- **Output Format**:
  ```json
  {
    "predicted_risk": "Low|Medium|High",
    "confidence": 0.85,
    "probabilities": {
      "Low": 0.05,
      "Medium": 0.10,
      "High": 0.85
    },
    "reasoning": "Detailed explanation...",
    "model_used": "HybridRiskModel (BERT + Categorical Embeddings)",
    "features_analyzed": {...}
  }
  ```

#### 2. Flask API Endpoint
- **Endpoint**: `POST /predict-escalation`
- **Location**: `/server/app.py` (lines ~2145-2225)
- **Features**:
  - Validates input data
  - Calls escalation model service
  - Returns detailed prediction with reasoning
  - Handles errors gracefully with fallback responses
  - Logs prediction details for monitoring

#### 3. Model Initialization
- **Location**: `/server/app.py` (lines ~2505-2512)
- **Behavior**:
  - Initializes escalation service on server startup
  - Loads model files (`best_hybrid_risk_model.pth`, `preprocessing_info.pkl`)
  - Falls back gracefully if model files not available
  - Prints initialization status to console

### Frontend Implementation

#### 1. OfficerDashboard State Management
- **Location**: `/src/screens/OfficerDashboard.tsx`
- **New State Variables**:
  ```typescript
  const [escalationPrediction, setEscalationPrediction] = useState<{
    predicted_risk: string;
    confidence: number;
    probabilities: { Low: number; Medium: number; High: number };
    reasoning: string;
  } | null>(null);
  const [loadingEscalation, setLoadingEscalation] = useState(false);
  ```

#### 2. Prediction Function
- **Function**: `handlePredictEscalation(report: ReportSummary)`
- **Features**:
  - Extracts report data (description, location, type, timestamp, etc.)
  - Formats datetime in DD-MM-YYYY HH:MM format
  - Calls `/predict-escalation` backend endpoint
  - Updates local state with prediction results
  - Optionally saves prediction to Firestore
  - Handles errors with user-friendly alerts

#### 3. Modal UI Enhancement
- **Component**: `ReportDetailsModal`
- **New Props**:
  - `escalationPrediction`: Prediction results object
  - `loadingEscalation`: Loading state boolean
  - `onPredictEscalation`: Prediction trigger function

- **UI Sections Added**:
  1. **Header**: "Advanced Risk Analysis" with analytics icon
  2. **Subtitle**: Model description (BERT + Categorical Embeddings)
  3. **Predict Button**: Golden button with flask icon
  4. **Results Display** (when prediction available):
     - Risk level badge (color-coded: Red/Orange/Green)
     - Confidence percentage with progress bar
     - Probability distribution for all 3 risk levels
     - AI reasoning box with detailed explanation

#### 4. Styling
- **Location**: `modalStyles` in `/src/screens/OfficerDashboard.tsx`
- **New Styles Added**:
  - `advancedEscalationSection`: Container with golden border
  - `predictButton`: Golden action button
  - `predictionResults`: Dark results container
  - `riskLevelBadge`: Color-coded risk badge
  - `confidenceBar/Fill`: Progress bar for confidence
  - `probabilityRow/Bar/Fill`: Horizontal bars for probabilities
  - `reasoningBox`: Highlighted reasoning display

## Required Files

### Model Files (Need to be placed in `/server/` directory):
1. **`best_hybrid_risk_model.pth`**: Trained PyTorch model checkpoint
   - Contains model weights, vocabulary sizes, validation F1 score
   - Size: ~16-20 MB (depending on training)

2. **`preprocessing_info.pkl`**: Label encoders and mappings
   - Contains:
     - `label_encoders`: LabelEncoder objects for categorical features
     - `risk_label_map`: Risk level to numeric mapping
     - `vocab_sizes`: Vocabulary sizes for embeddings
     - `class_weights`: Class weights for balanced training

### Where to Get These Files:
From your Jupyter notebook (`IncidentEscalationFinal 1.ipynb`):
- After running the training cell, files are saved in the notebook's working directory
- Download both files using:
  ```python
  from google.colab import files
  files.download('best_hybrid_risk_model.pth')
  files.download('preprocessing_info.pkl')
  ```
- Place them in `/Users/apple/Desktop/CitizenSafeApp/server/`

## Usage Flow

### For Officers:
1. **View Report**: Click on any report in "Recent Incident Reports"
2. **Open Modal**: Report details modal opens with existing escalation prediction
3. **Advanced Analysis**: Scroll to "Advanced Risk Analysis" section
4. **Predict**: Click "Predict Escalation Risk" button
5. **View Results**:
   - See predicted risk level (Low/Medium/High)
   - Check model confidence percentage
   - Review probability distribution
   - Read AI-generated reasoning

### Data Flow:
```
Report Click → Modal Opens → 
"Predict" Button → handlePredictEscalation() → 
Format Report Data → POST /predict-escalation → 
escalation_model_service.py → predict_escalation_risk() → 
Load Model → Extract Features → 
BERT Encoding + Categorical Embeddings → 
Softmax Probabilities → Generate Reasoning → 
Return JSON → Update Frontend State → 
Display Results in Modal
```

## Model Architecture

### HybridRiskModel Components:
1. **Text Encoder**: BERT-base-uncased (768-dim)
   - Processes incident description
   - Uses [CLS] token representation
   - Dropout (0.3) for regularization

2. **Categorical Embeddings**: Dynamic embedding dimensions
   - Features: location, sub_location, crime_type, hour, part_of_day, is_user_report, day_of_week, month
   - Embedding dim: `min(50, max(4, int(vocab_size ** 0.6)))`

3. **Structured Features MLP**:
   - Input: Concatenated embeddings + numeric features
   - Layers: Dense(256) → ReLU → Dropout(0.2) → Dense(128)

4. **Fusion Classifier**:
   - Input: BERT features + Structured features
   - Layers: Dense(256) → ReLU → Dropout(0.3) → Dense(128) → Dense(3)
   - Output: 3 classes (Low, Medium, High)

### Training Details:
- **Datasets**: Mumbai Crime Data with Risk Labels
- **Optimizer**: AdamW (BERT: 1e-5, Others: 5e-4)
- **Loss**: CrossEntropyLoss with class weights
- **Validation Metric**: Macro F1 Score
- **Best Model**: Saved based on highest validation F1

## Features

### Backend Features:
- ✅ Handles missing/unknown values gracefully
- ✅ Infers part_of_day from timestamp
- ✅ Supports multiple datetime formats
- ✅ Returns detailed reasoning for predictions
- ✅ Fallback to mock predictions if model unavailable
- ✅ Comprehensive error logging

### Frontend Features:
- ✅ Real-time prediction triggering
- ✅ Loading states with activity indicators
- ✅ Color-coded risk visualization
- ✅ Interactive progress bars
- ✅ Sortable probability display (highest first)
- ✅ Responsive modal design
- ✅ Optional Firestore persistence
- ✅ Error handling with user alerts

## Testing

### Test the Backend Endpoint:
```bash
curl -X POST http://192.168.29.102:8080/predict-escalation \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Armed robbery at jewelry store",
    "location": "Bandra",
    "crime_type": "Theft",
    "datetime_occurred": "15-10-2024 22:30",
    "is_user_report": true
  }'
```

### Expected Response:
```json
{
  "predicted_risk": "High",
  "confidence": 0.87,
  "probabilities": {
    "Low": 0.03,
    "Medium": 0.10,
    "High": 0.87
  },
  "reasoning": "🔴 HIGH RISK: This incident requires immediate attention...",
  "model_used": "HybridRiskModel (BERT + Categorical Embeddings)",
  "features_analyzed": {
    "description_length": 32,
    "location": "Bandra",
    "crime_type": "Theft",
    "time": "Night",
    "user_report": true
  }
}
```

## Dependencies

### Backend (Python):
- `torch >= 2.0.0`
- `transformers >= 4.30.0`
- `pandas >= 1.5.0`
- `numpy >= 1.24.0`
- `scikit-learn >= 1.3.0`

Already installed based on requirements.txt.

### Frontend (React Native):
- `@expo/vector-icons` (already installed)
- `react-native` (already installed)
- No additional dependencies required

## Next Steps

1. **Download Model Files**:
   - Export `best_hybrid_risk_model.pth` from Colab/Jupyter
   - Export `preprocessing_info.pkl` from Colab/Jupyter
   - Place both in `/server/` directory

2. **Restart Flask Server**:
   ```bash
   cd /Users/apple/Desktop/CitizenSafeApp/server
   python3.12 app.py
   ```
   - Check for "✅ Escalation Model loaded successfully!" message
   - Verify input/output shapes match training

3. **Test Frontend**:
   - Launch app on device/emulator
   - Login as officer
   - Navigate to Recent Incident Reports
   - Click any report
   - Click "Predict Escalation Risk"
   - Verify results display correctly

4. **Monitor Performance**:
   - Check server logs for prediction times
   - Monitor Firestore for saved predictions
   - Verify model accuracy on real incidents

## Troubleshooting

### Model Not Loading:
- **Issue**: "⚠️ Model file not found"
- **Solution**: Ensure model files are in `/server/` directory with exact names
- **Check**: Server startup logs for model loading messages

### Prediction Errors:
- **Issue**: "Error during prediction"
- **Check**: Server logs for detailed error traces
- **Common Causes**:
  - Model file corrupted
  - Preprocessing info mismatch
  - BERT tokenizer download failed
  - Memory issues (model requires ~2GB RAM)

### Frontend Not Updating:
- **Issue**: Results not displaying
- **Check**: Network tab for API response
- **Verify**: Console logs for state updates
- **Solution**: Clear React Native cache and rebuild

### Performance Issues:
- **Issue**: Slow predictions (>5 seconds)
- **Causes**: CPU mode (no CUDA), large batch processing
- **Solution**: Use GPU if available, optimize model loading

## Benefits

1. **Accuracy**: BERT-based encoding captures semantic meaning
2. **Multi-modal**: Combines text + categorical + temporal features
3. **Interpretability**: Provides reasoning and confidence scores
4. **Scalability**: Can be retrained with more data
5. **Flexibility**: Handles missing values and unknown categories
6. **User-Friendly**: Clear visualization of predictions

## Future Enhancements

1. **Model Updates**:
   - Fine-tune on Mumbai-specific crime data
   - Add support for more crime categories
   - Incorporate historical incident patterns

2. **UI Improvements**:
   - Add historical prediction timeline
   - Show similar past incidents
   - Export prediction reports

3. **Backend Optimization**:
   - Cache model in memory (already done)
   - Batch prediction support
   - Model versioning and A/B testing

4. **Analytics**:
   - Track prediction accuracy over time
   - Officer feedback loop
   - Incident outcome correlation

---

**Status**: ✅ Implementation Complete
**Pending**: Model files need to be placed in `/server/` directory
**Last Updated**: 6 November 2025
