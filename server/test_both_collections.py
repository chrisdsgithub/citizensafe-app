#!/usr/bin/env python3
"""
Test writing to reports collection (should work)
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

# Test writing to reports collection
test_id = f"test_report_{int(time.time())}"
test_data = {
    'userId': 'test_user',
    'description': 'Test report',
    'timestamp': firestore.SERVER_TIMESTAMP,
}

print(f"📝 Testing write to reports collection: {test_id}")
try:
    db.collection('reports').document(test_id).set(test_data)
    print(f"✅ Successfully wrote to reports/{test_id}")
    
    # Clean up
    db.collection('reports').document(test_id).delete()
    print(f"✅ Cleaned up test document")
        
except Exception as e:
    print(f"❌ Error writing to reports: {e}")

# Test writing to flagged_reports collection
test_id2 = f"test_flagged_{int(time.time())}"
print(f"\n📝 Testing write to flagged_reports collection: {test_id2}")
try:
    db.collection('flagged_reports').document(test_id2).set(test_data)
    print(f"✅ Successfully wrote to flagged_reports/{test_id2}")
    
    # Clean up
    db.collection('flagged_reports').document(test_id2).delete()
    print(f"✅ Cleaned up test document")
        
except Exception as e:
    print(f"❌ Error writing to flagged_reports: {e}")
