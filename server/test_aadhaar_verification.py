#!/usr/bin/env python3
"""
Test script for /verify-aadhaar endpoint
Usage: python test_aadhaar_verification.py
"""

import requests
import json

# Configuration
BASE_URL = "http://192.168.29.102:8080"
VERIFY_ENDPOINT = f"{BASE_URL}/verify-aadhaar"

# Test data - replace with actual Firebase Storage URLs
TEST_DATA = {
    "user_id": "test_user_123",
    "aadhar_url": "https://example.com/path/to/aadhaar.jpg",  # Replace with real URL
    "profile_picture_url": "https://example.com/path/to/profile.jpg",  # Replace with real URL
    "user_full_name": "John Doe"  # Replace with real name
}

def test_verify_aadhaar():
    """Test the /verify-aadhaar endpoint"""
    print("🧪 Testing Aadhaar Verification Endpoint")
    print("=" * 60)
    print(f"Endpoint: {VERIFY_ENDPOINT}")
    print(f"Test User: {TEST_DATA['user_full_name']}")
    print("=" * 60)
    
    try:
        # Make POST request
        print("\n📤 Sending verification request...")
        response = requests.post(VERIFY_ENDPOINT, json=TEST_DATA, timeout=30)
        
        # Check status code
        print(f"\n📊 Response Status: {response.status_code}")
        
        # Parse response
        if response.status_code == 200:
            result = response.json()
            print("\n✅ Verification Successful!")
            print("=" * 60)
            print(json.dumps(result, indent=2))
            print("=" * 60)
            
            # Summary
            print("\n📋 Verification Summary:")
            print(f"  Auto-verified: {result.get('auto_verified', False)}")
            print(f"  Status: {result.get('verification_status', 'N/A')}")
            print(f"  Name Match Score: {result.get('name_match_score', 0)}%")
            
            face_score = result.get('face_match_score')
            if face_score is not None:
                print(f"  Face Match Score: {face_score}%")
            else:
                print(f"  Face Match Score: Not available")
            
            print(f"  Extracted Name: {result.get('extracted_name', 'N/A')}")
            print(f"  Aadhaar Number: {result.get('aadhaar_number', 'N/A')}")
            print(f"  DOB: {result.get('dob', 'N/A')}")
            
        else:
            error = response.json() if response.headers.get('content-type') == 'application/json' else response.text
            print(f"\n❌ Verification Failed!")
            print("=" * 60)
            print(json.dumps(error, indent=2) if isinstance(error, dict) else error)
            print("=" * 60)
    
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Connection Error: Could not connect to {BASE_URL}")
        print("   Make sure the Flask server is running!")
    except requests.exceptions.Timeout:
        print(f"\n❌ Timeout Error: Request took longer than 30 seconds")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    print("""
⚠️  IMPORTANT: Before running this test, update TEST_DATA in this file with:
   1. Real Firebase Storage URLs for Aadhaar document and profile picture
   2. Actual user name from signup
   3. Valid user_id from Firebase Auth
   
   Example URLs:
   aadhar_url: "https://firebasestorage.googleapis.com/v0/b/your-app.appspot.com/o/aadhar_documents%2Fuser123%2Faadhaar.jpg?alt=media&token=..."
   profile_picture_url: "https://firebasestorage.googleapis.com/v0/b/your-app.appspot.com/o/profile_pictures%2Fuser123%2Fprofile.jpg?alt=media&token=..."
    """)
    
    input("Press Enter to continue with test (or Ctrl+C to cancel)...")
    test_verify_aadhaar()
