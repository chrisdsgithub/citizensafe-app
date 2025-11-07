#!/usr/bin/env python3
"""
Delete the fake gibberish report that was saved
"""
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin (if not already initialized)
try:
    firebase_admin.get_app()
except ValueError:
    cred = credentials.Certificate('hybrid-run-sa-key.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Delete the fake report
report_id = '6zblD3XRHoa0U3QdtjVQ'
print(f"🗑️  Deleting fake report: {report_id}")

try:
    # First check if it exists
    doc = db.collection('reports').document(report_id).get()
    if doc.exists:
        print(f"📋 Report data: {doc.to_dict()}")
        db.collection('reports').document(report_id).delete()
        print(f"✅ Deleted fake report from reports collection")
    else:
        print(f"❌ Report not found in reports collection")
        
    # Check if it's in flagged_reports
    flagged_doc = db.collection('flagged_reports').document(report_id).get()
    if flagged_doc.exists:
        print(f"📋 Found in flagged_reports")
        db.collection('flagged_reports').document(report_id).delete()
        print(f"✅ Deleted from flagged_reports collection")
    else:
        print(f"ℹ️  Not in flagged_reports collection")
        
except Exception as e:
    print(f"❌ Error: {e}")
