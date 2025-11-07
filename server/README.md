Cloud Run model inference server

## Local Development

For testing the risk prediction API locally with your React Native app:

1. Install Python dependencies:
```bash
cd server
pip install -r requirements.txt
```

2. Set environment variables for local development:
```bash
export DEV_SKIP_AUTH=true  # Skip Firebase auth for local testing
export MOCK_MODE=true      # Use mock mode if you don't have PyTorch installed
```

3. Run the server:
```bash
python app.py
```

The server will start on `http://localhost:8080`. Your React Native app will automatically use this local endpoint when running in development mode.

## Production Deployment

1. Export your trained model and encoders with fixed filenames (from the notebook):

```python
# After training in notebook
torch.save({
    'model_state_dict': best_model_state,
    'num_cities': num_cities,
    'num_parts_of_day': num_parts_of_day,
    'num_classes': num_classes,
}, 'hybrid_risk_model.pth')

with open('label_encoders.pkl', 'wb') as f:
    pickle.dump({
        'city_encoder': city_encoder,
        'part_of_day_encoder': part_of_day_encoder,
        'risk_label_encoder': risk_label_encoder
    }, f)
```

2. Place `hybrid_risk_model.pth` and `label_encoders.pkl` into this `/server` folder.

3. Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set to a service account JSON on your local machine for testing:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

4. Build and push Docker image, then deploy to Cloud Run:

```bash
# From /server
docker build -t gcr.io/YOUR_PROJECT_ID/hybrid-risk:latest .
docker push gcr.io/YOUR_PROJECT_ID/hybrid-risk:latest

# Deploy to Cloud Run
gcloud run deploy hybrid-risk --image gcr.io/YOUR_PROJECT_ID/hybrid-risk:latest --region YOUR_REGION --platform managed --allow-unauthenticated=false
```

5. Configure authentication: Cloud Run should require authentication. The mobile app will get a Firebase ID token and send it in the Authorization header as `Bearer <token>`.

6. Test with curl (you need an ID token):

```bash
curl -X POST "https://YOUR_CLOUD_RUN_URL/predict" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Suspicious individual seen looking into car windows", "city":"Greenwood", "time_of_occurrence":"28-07-2024 22:05"}'
```
