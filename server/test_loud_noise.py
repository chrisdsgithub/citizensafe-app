#!/usr/bin/env python3
"""
Test script to verify the improved escalation prediction logic
for handling generic reports like "loud noises"
"""

import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from escalation_model_service import predict_escalation_risk, load_escalation_model

# Initialize model
print("Loading model...")
load_escalation_model()
print("Model loaded!\n")

# Test case: Generic "loud noises" report
test_incident = {
    "description": "I heard loud noises from my Neighbors house",
    "location": "Mumbai, Maharashtra, 400058, India",
    "crime_type": "Citizen Post",
    "datetime_occurred": "06-11-2025 03:41",
    "is_user_report": True,
    "part_of_day": "",
    "sub_location": ""
}

print("=" * 70)
print("TEST: Generic 'loud noises' report")
print("=" * 70)
print(f"Description: {test_incident['description']}")
print(f"Location: {test_incident['location']}")
print(f"Crime Type: {test_incident['crime_type']}")
print()

result = predict_escalation_risk(test_incident)

print("PREDICTION RESULT:")
print("-" * 70)
print(f"Predicted Risk: {result['predicted_risk']}")
print(f"Confidence: {result['confidence']*100:.1f}%")
print(f"\nProbabilities:")
for risk, prob in sorted(result['probabilities'].items(), key=lambda x: x[1], reverse=True):
    print(f"  {risk:8s}: {prob*100:5.1f}%")
print(f"\nReasoning:")
print(f"  {result['reasoning']}")
print()

if 'unknown_categories' in result.get('features_analyzed', {}):
    unknown = result['features_analyzed']['unknown_categories']
    if unknown:
        print(f"⚠️  Unknown categories: {unknown}")
print("=" * 70)

# Expected behavior:
# - Should classify as LOW (not HIGH)
# - Should show warnings about unknown categories
# - Should mention generic description + override
# - Confidence should be adjusted (~60%)

print("\n✅ EXPECTED BEHAVIOR:")
print("  - Risk: Low (NOT High)")
print("  - Confidence: ~60% (NOT 100%)")
print("  - Override message about generic description")
print("  - Warnings about unknown categories")
print("  - Note about generic/brief description")
print()

# Check results
if result['predicted_risk'] == 'Low':
    print("✅ PASS: Correctly classified as Low Risk")
else:
    print(f"❌ FAIL: Still showing {result['predicted_risk']} Risk")

if result['confidence'] < 0.8:
    print("✅ PASS: Confidence appropriately adjusted")
else:
    print(f"❌ FAIL: Confidence too high ({result['confidence']*100:.1f}%)")

if '🔄' in result['reasoning']:
    print("✅ PASS: Override reasoning included")
else:
    print("⚠️  WARN: No override message (might be OK)")

if result['probabilities']['Low'] > result['probabilities']['High']:
    print("✅ PASS: Probabilities favor Low Risk")
else:
    print("❌ FAIL: Probabilities still favor High Risk")
