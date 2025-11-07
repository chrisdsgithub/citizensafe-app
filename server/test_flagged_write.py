#!/usr/bin/env python3
"""
Quick test to verify we can write to flagged_reports collection
"""
import firebase_admin
from firebase_admin import credentials, firestore
import time

# Initialize Firebase Admin (if not already initialized)
try:
    firebase_admin.get_app()
except ValueError:
    cred = credentials.Certificate('hybrid-run-sa-key.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Create a test document
test_id = f"test_{int(time.time())}"
test_data = {
    'userId': 'test_user',
    'description': 'Test fake report',
    'location': {'city': 'Test City'},
    'timestamp': firestore.SERVER_TIMESTAMP,
    'flagged_at': firestore.SERVER_TIMESTAMP,
    'is_fake': True,
    'verification_confidence': 0.95,
    'verification_reasoning': 'Test reasoning',
    'verification_method': 'test',
    'status': 'Flagged',
    'reportType': 'Test Post',
    'userName': 'Test User'
}

print(f"📝 Creating test document: {test_id}")
try:
    db.collection('flagged_reports').document(test_id).set(test_data)
    print(f"✅ Successfully wrote to flagged_reports/{test_id}")
    
    # Verify we can read it back
    doc = db.collection('flagged_reports').document(test_id).get()
    if doc.exists:
        print(f"✅ Successfully read back document")
        print(f"📋 Data: {doc.to_dict()}")
    else:
        print(f"❌ Document not found after write!")
        
except Exception as e:
    print(f"❌ Error: {e}")
