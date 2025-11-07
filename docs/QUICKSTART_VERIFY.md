# Quick Start: Automatic Report Verification

## 🚀 Quick Setup (60 seconds)

### 1. Start Flask Backend
```bash
cd /Users/apple/Desktop/CitizenSafeApp/server
export GEMINI_API_KEY="AIzaSyBXpAJnIk6JedOS2zK9IRCtnVlqQ9KfB-I"
export DEV_SKIP_AUTH="true"
python3 app.py
```

Expected output:
```
Starting Flask server...
✅ Gemini API initialized
Server will be available at http://localhost:8080
```

### 2. Start React Native App
```bash
cd /Users/apple/Desktop/CitizenSafeApp
npm start
# or
expo start
```

### 3. Test the Feature

#### Test 1: Submit Verified Report
1. Open app → Citizens tab → File Report
2. Enter detailed report: "I witnessed a robbery at Andheri West market. Suspect was wearing red jacket, fled on motorcycle."
3. Submit
4. ✅ Should see: "Report Submitted"
5. No flagged alert = VERIFIED ✅

#### Test 2: Submit Fake Report  
1. Open app → Citizens tab → File Report
2. Enter vague report: "Something happened lol"
3. Submit
4. 🚨 Should see: "Report Flagged - Your report has been flagged as potentially inauthentic."
5. Reason will show why

#### Test 3: Officer Dashboard
1. Switch to Officer → Officer Dashboard
2. Scroll to "Incident Escalation Risks"
3. Look for verification badges:
   - **✅ VERIFIED** (green) = Genuine report
   - **🚨 FAKE** (red) = Flagged as inauthentic
4. Click on FAKE report → Should block crime prediction with alert
5. Click on VERIFIED report → Should allow crime prediction

---

## 🔧 What's New

### Backend (`server/app.py`)
- **New Endpoint:** `POST /auto-verify-report`
- **Function:** Analyzes incoming reports, stores verification in Firestore
- **Uses:** Gemini 2.0 Flash for authenticity detection

### Frontend - Citizen Submission
- **AIReportBot.tsx:** Auto-verify after submission (lines ~130-160)
- **CrimeFeed.tsx:** Auto-verify after submission (lines ~340-370)
- **Shows:** Alert if report flagged as fake

### Frontend - Officer Dashboard
- **OfficerDashboard.tsx:** Shows verification badges on reports
- **ReportSummary Interface:** Added is_fake, verification_confidence, verification_reasoning
- **Blocks:** Crime prediction for flagged reports with alert

---

## 📊 What Gets Stored

When a report is verified, Firestore stores:

```javascript
// In report document
{
  is_fake: false,                           // boolean
  verification_confidence: 0.95,            // 0-1 score
  verification_reasoning: "Report seems...", // why it's fake/real
  verified_at: Timestamp                    // when verified
}

// In reports/{id}/verification/latest
{
  is_fake: false,
  confidence: 0.95,
  reasoning: "..."
  credibility_penalty: 0,
  verified_by: "gemini-api"
}

// User's credibility score
{
  credibilityScore: 75  // Reduced by 5-25 points if flagged
}
```

---

## ✨ Key Features

| Feature | Status | Details |
|---------|--------|---------|
| Auto-verify on submit | ✅ | Citizen submission → Backend verification → Result stored |
| Display badge | ✅ | Officer Dashboard shows ✅ VERIFIED or 🚨 FAKE |
| Block crime prediction | ✅ | Officers can't predict crime type for fake reports |
| Credibility penalty | ✅ | User score reduced if reports flagged |
| Gemini AI | ✅ | Uses gemini-2.0-flash for analysis |
| Fallback mode | ✅ | Keyword-based detection if Gemini unavailable |

---

## 🛠️ Testing Commands

### Check if backend is running:
```bash
curl http://localhost:8080/
# Should return: {"ok": true, "service": "citizen-safe-ml"}
```

### Manual verification test:
```bash
curl -X POST http://localhost:8080/auto-verify-report \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "test123",
    "report_text": "I saw a suspicious person",
    "location": "Andheri",
    "time_of_occurrence": "2024-11-04T14:30:00Z",
    "user_id": "user123"
  }'
```

Expected response:
```json
{
  "is_fake": false,
  "confidence": 0.87,
  "reasoning": "Report appears genuine with specific details",
  "credibility_penalty": 0,
  "verification_stored": true
}
```

---

## 🔍 Monitoring

### Watch Flask Logs for:
```
✅ Report auto-verified: {'is_fake': false, 'confidence': 0.95}
🚨 This report has been flagged as suspicious (3 red flags)
❌ Auto-verification error: [error details]
⚠️  Could not auto-verify report: [network error]
```

### Check Firestore:
1. Open Firebase Console
2. Go to Firestore → Collections → reports
3. Click on any report document
4. Look for fields: `is_fake`, `verification_confidence`, `verification_reasoning`

---

## 🎯 Common Scenarios

### Scenario 1: Genuine Report
```
Citizen: "I witnessed a robbery at the market on Main St at 3 PM"
Result: ✅ VERIFIED
Officer: Can predict crime type
Backend: No credibility penalty
```

### Scenario 2: Suspicious Report
```
Citizen: "Something bad lol"
Result: 🚨 FAKE
Officer: Cannot predict crime type (blocked)
Backend: Credibility score reduced by 15 points
```

### Scenario 3: Unverified Report
```
Report not yet checked
Result: ⏳ VERIFYING
Officer: Can attempt prediction (at own risk)
```

---

## 📱 User Experience Flow

### For Citizens:
```
1. File Report
   ↓
2. Submit
   ↓
3. Report Saved to Firestore
   ↓
4. Backend Verifies (automatic, 1-2 seconds)
   ↓
5a. If GENUINE → "Report Submitted" ✅
5b. If FAKE → "Report Flagged - Reason: ..." 🚨
```

### For Officers:
```
1. Open Officer Dashboard
   ↓
2. View Recent Reports with Badges
   ✅ VERIFIED (green)
   🚨 FAKE (red)
   ↓
3a. Click VERIFIED → Can predict crime type
3b. Click FAKE → Blocked with alert
```

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Verification not working | Check Flask running: `curl http://localhost:8080` |
| No badges showing | Refresh Officer Dashboard |
| "Report Flagged" for genuine report | Adjust Gemini prompt in `/auto-verify-report` endpoint |
| Firestore errors | Check security rules allow writes to `reports/{id}/verification/latest` |
| Network error on submit | Verify backend is accessible at `http://localhost:8080` |

---

## 📚 More Info

For comprehensive documentation:
- **AUTO_VERIFY_SETUP.md** - Full system design and API details
- **IMPLEMENTATION_SUMMARY.md** - Complete list of changes
- **GEMINI_SETUP.md** - Gemini API configuration

---

**Last Updated:** November 4, 2025
**Version:** 1.0
**Status:** ✅ Ready to Use
