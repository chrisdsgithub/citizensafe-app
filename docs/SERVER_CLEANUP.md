# Server Folder Cleanup Guide

## Files to KEEP (Required)

### Core Application
- ✅ `app.py` - Main Flask server
- ✅ `voice_sentiment_service.py` - Voice analysis functions
- ✅ `requirements.txt` - Python dependencies

### Model Files (Production)
- ✅ `hybrid_risk_model.pth` - Trained crime prediction model
- ✅ `label_encoders.pkl` - City/time/risk encoders
- ✅ `mfcc_scaler.pkl` - Audio feature scaler

### Configuration
- ✅ `Dockerfile` - For production deployment
- ✅ `README.md` - Documentation

---

## Files to REMOVE (Unnecessary)

### Documentation (Duplicates - already at root level)
- ❌ `EXECUTIVE_SUMMARY.py` - Duplicate docs
- ❌ `FUNCTIONS.md` - Duplicate docs
- ❌ `MOCK_vs_REAL.py` - Duplicate docs
- ❌ `TECHNICAL_BREAKDOWN.py` - Duplicate docs

### Model Training Files (Old/Unused)
- ❌ `final_model.keras` - Unused Keras model
- ❌ `voice_sentiment_model_simple.keras` - Broken model (Attention layer issue)
- ❌ `build_simple_model.py` - Training script (old)
- ❌ `train_production_model.py` - Training script (old)
- ❌ `train_voice_model.py` - Training script (old)

### Testing & Debug Files
- ❌ `test_sentiment.py` - Test script (can be removed after testing)
- ❌ `test_inference.py` - Test script (old)
- ❌ `demo_predictions.py` - Demo script (old)
- ❌ `inspect_ckpt.py` - Debug script (old)
- ❌ `test_emulator_connection.sh` - Test script
- ❌ `quick_test.sh` - Test script

### Data Files (Training data)
- ❌ `X_features.npy` - Feature data
- ❌ `y_labels.npy` - Label data
- ❌ `train_history.npy` - Training history

### Credentials & Logs (Sensitive)
- ⚠️ `hybrid-run-sa-key.json` - Firebase credentials (keep if needed, but don't commit to git)
- ❌ `server.log` - Log file (old)
- ❌ `evaluation_report.txt` - Report (old)
- ❌ `confusion_matrix.png` - Image (old)

### Cached Files
- ❌ `__pycache__/` - Python cache (auto-generated)

---

## Summary

**KEEP:** 6 files
- app.py
- voice_sentiment_service.py
- requirements.txt
- hybrid_risk_model.pth
- label_encoders.pkl
- mfcc_scaler.pkl
- Dockerfile
- README.md
- hybrid-run-sa-key.json (sensitive - consider moving to env vars)

**REMOVE:** 22+ files

**Result:** 75% smaller, cleaner production-ready structure

