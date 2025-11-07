#!/bin/bash

# Test script for fake report detection endpoint

echo "🧪 Testing Fake Report Detection Endpoint"
echo "========================================="

# Test 1: Report with "ghost" keyword
echo ""
echo "Test 1: Report with 'ghost' keyword (SHOULD BE FAKE)"
echo "-----"
curl -X POST http://localhost:8080/auto-verify-report \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "test_ghost_123",
    "user_id": "user_abc",
    "report_text": "A ghost broke into my apartment and rearranged the furniture",
    "location": "Downtown Mumbai",
    "time_of_occurrence": "3:45 PM Yesterday"
  }' | python3 -m json.tool
echo ""

# Test 2: Report with "alien" keyword
echo ""
echo "Test 2: Report with 'alien' keyword (SHOULD BE FAKE)"
echo "-----"
curl -X POST http://localhost:8080/auto-verify-report \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "test_alien_456",
    "user_id": "user_def",
    "report_text": "An alien landed in my backyard last night",
    "location": "Sector 5, Mumbai",
    "time_of_occurrence": "11:00 PM"
  }' | python3 -m json.tool
echo ""

# Test 3: Legitimate report
echo ""
echo "Test 3: Legitimate Report (SHOULD BE GENUINE)"
echo "-----"
curl -X POST http://localhost:8080/auto-verify-report \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "test_genuine_789",
    "user_id": "user_ghi",
    "report_text": "A man snatched a womans handbag near the central railway station at 3:30 PM. He wore a blue shirt and was about 510 tall. Police car was passing by.",
    "location": "Central Railway Station",
    "time_of_occurrence": "3:30 PM Today"
  }' | python3 -m json.tool
echo ""

# Test 4: Report with obvious fake scenario
echo ""
echo "Test 4: Report with 'invisible man' keyword (SHOULD BE FAKE)"
echo "-----"
curl -X POST http://localhost:8080/auto-verify-report \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "test_invisible_101",
    "user_id": "user_jkl",
    "report_text": "An invisible man stole my watch from my wrist in broad daylight",
    "location": "Market Street",
    "time_of_occurrence": "2:00 PM"
  }' | python3 -m json.tool
echo ""

echo "✅ Test Complete!"
