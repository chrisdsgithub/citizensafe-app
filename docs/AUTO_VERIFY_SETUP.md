# Automatic Report Verification System

## Overview

The Citizen Safe App now includes an **automatic fake report detection system** that verifies the authenticity of incoming citizen crime reports. When a citizen submits a report, the system automatically checks if it's genuine or fake, stores the verification result in Firestore, and displays the verification status on the Officer Dashboard.

## Architecture

### Flow Diagram

```
Citizen Submits Report
        ↓
Saved to Firestore (reports collection)
        ↓
Backend Calls /auto-verify-report Endpoint
        ↓
Gemini AI Analyzes Report for Authenticity
        ↓
Results Stored in Firestore
  - is_fake: boolean
  - confidence: 0-100
  - reasoning: string
        ↓
Officer Dashboard Displays Badge
  - ✅ VERIFIED (green) or 🚨 FAKE (red)
        ↓
Officers Can Only Predict Crime Type for VERIFIED Reports
```

## Components

### 1. Backend: `/auto-verify-report` Endpoint

**Location:** `server/app.py` (lines ~985-1095)

**Purpose:** Automatically verifies incoming citizen reports using Gemini AI

**Request Body:**
```json
{
  "report_id": "firestore_document_id",
  "report_text": "crime description",
  "location": "crime location",
  "time_of_occurrence": "ISO timestamp",
  "user_id": "citizen_user_id"
}
```

**Response:**
```json
{
  "is_fake": false,
  "confidence": 0.95,
  "reasoning": "Report appears genuine with specific details",
  "credibility_penalty": 0,
  "verification_stored": true
}
```

**Verification Logic:**
- Analyzes content authenticity
- Detects suspicious patterns (exaggeration, inconsistencies)
- Checks for false claims or fabricated evidence
- Validates time/location consistency
- Considers user credibility score (low-score users are more likely to file false reports)
- Performs language analysis

**Firestore Updates:**
- Adds verification subcollection: `reports/{reportId}/verification/latest`
- Updates report document with verification fields:
  - `is_fake`: boolean
  - `verification_confidence`: 0-1 score
  - `verification_reasoning`: string
  - `verified_at`: timestamp
- Reduces user credibility score if report is flagged (penalty: 5-25 points)

### 2. Frontend: Automatic Verification on Submit

**Locations:** 
- `src/screens/AIReportBot.tsx` (lines ~114-160)
- `src/screens/CrimeFeed.tsx` (lines ~315-380)

**When Triggered:** When a citizen submits a new report

**Process:**
1. Report is added to Firestore
2. Frontend calls `/auto-verify-report` endpoint with report details
3. Results are fetched and displayed to citizen
4. If fake: Shows alert with reason, stores flag in Firestore
5. If verified: Silently confirms in backend

**User Experience:**
- Citizens see alert if report is flagged as fake with reason
- Citizens receive confirmation message regardless
- Report is always saved to Firestore (even if flagged)

### 3. Officer Dashboard: Verification Badge Display

**Location:** `src/screens/OfficerDashboard.tsx`

**Components Updated:**
- `ReportSummary` interface: Added verification fields
- `IncidentRisk` component: Now shows verification badge alongside risk score
- `getVerificationColor()` function: Returns color based on verification status
- `getVerificationBadge()` function: Returns badge text (✅ Verified, 🚨 FAKE, ⏳ Verifying)

**Badge Display:**
```
HIGH RISK (85%)  ✅ VERIFIED
HIGH RISK (85%)  🚨 FAKE
HIGH RISK (85%)  ⏳ VERIFYING
```

**Colors:**
- **Green (#27AE60):** Verified genuine report
- **Red (#E74C3C):** Flagged as fake
- **Gray (#95A5A6):** Pending verification

### 4. Officer Dashboard: Predict Crime Type Block

**Location:** `src/screens/OfficerDashboard.tsx` → `handleOpenDetails()` function

**Behavior:**
- When officer clicks on a report to view details
- System checks if `report.is_fake === true`
- If fake: Shows alert blocking crime prediction
- If verified or unverified: Allows prediction to proceed

**Alert Message:**
```
"This report has been flagged as inauthentic and cannot be used for crime prediction.
Reason: [verification_reasoning]"
```

## Gemini AI Analysis

The system uses **Gemini 2.0 Flash** model to analyze reports for authenticity.

### Red Flags Detected:
1. **Vague descriptions** - Lacking specific details
2. **Suspicious keywords** - "obviously fake", "just kidding", "lol", etc.
3. **Implausible numbers** - "1000 robbers", "1 million damage"
4. **Contradictions** - Conflicting information in report
5. **Low credibility user** - User with score < 30
6. **Impossible scenarios** - Physically impossible events

### Credibility Penalties:
- Low credibility user: -2 points
- Vague description: -2 points
- Suspicious keywords: -3 points
- Implausible numbers: -3 points
- Report contradictions: -1 point
- Total possible penalty: -5 to -25 points

## Firestore Schema

### Report Document Structure
```javascript
reports/{reportId} {
  userId: string,
  description: string,
  location: {
    latitude: number,
    longitude: number,
    city: string
  },
  timestamp: Timestamp,
  
  // Verification fields (added by /auto-verify-report)
  is_fake: boolean,
  verification_confidence: number (0-1),
  verification_reasoning: string,
  verified_at: Timestamp,
  
  // Risk prediction fields (added by officer prediction)
  riskLevelText: string,
  escalationRiskScore: number,
  mlUpdatedAt: Timestamp
}
```

### Verification Subcollection
```javascript
reports/{reportId}/verification/latest {
  is_fake: boolean,
  confidence: number (0-1),
  reasoning: string,
  credibility_penalty: number,
  verified_at: Timestamp,
  verified_by: string ("gemini-api" or "keyword-fallback")
}
```

### User Document Structure
```javascript
users/{userId} {
  credibilityScore: number (0-100), // Reduced by penalties
  // ... other fields
}
```

## Testing the System

### Manual Testing Steps:

1. **Submit a Verified Report:**
   - Open app → Citizens Tab → File Report
   - Enter detailed, authentic-sounding report
   - Submit
   - ✅ Should show "Report Submitted" without flags
   - Check Officer Dashboard → Green verification badge

2. **Submit a Fake Report:**
   - Enter vague description or suspicious keywords
   - Example: "Someone did something bad lol"
   - Submit
   - 🚨 Should show alert about flagged report
   - Check Officer Dashboard → Red verification badge

3. **Try to Predict Crime Type:**
   - As officer, click on a fake report
   - 🚨 Should see alert: "This report has been flagged as inauthentic..."
   - Click on verified report
   - ✅ Should proceed to crime prediction

### Debugging:

Monitor Flask server output for verification logs:
```
✅ Report auto-verified: {'is_fake': false, 'confidence': 0.95, ...}
❌ Auto-verification error: [error details]
⚠️ Could not auto-verify report: [network error]
```

## Configuration

### Environment Variables

In `server/app.py`:
```bash
export GEMINI_API_KEY="your-gemini-api-key"
export DEV_SKIP_AUTH="true"  # For local development
```

### Flask Endpoints

- `/auto-verify-report` - POST - Automatic verification (citizen submission)
- `/detect-fake-report` - POST - Manual fake detection (officer use)
- `/predict` - POST - Risk escalation assessment
- `/predict-crime-type` - POST - Crime type classification

## Fallback Mode

If Gemini API is unavailable, the system uses keyword-based fake detection:

```python
if GEMINI_API_KEY:
    # Use Gemini AI analysis
else:
    # Fallback to keyword matching
    # Checks for: vague descriptions, suspicious keywords,
    # implausible numbers, contradictions, low credibility
```

## Future Enhancements

1. **Machine Learning Model:** Replace Gemini with trained ML model for faster inference
2. **Historical Pattern Analysis:** Track user's past reports to improve credibility scoring
3. **Community Validation:** Allow officers to vote on report authenticity
4. **Detailed Analytics:** Dashboard showing fake report statistics by district/type
5. **Automated Response:** Auto-delete extreme fake reports or suspend repeat offenders
6. **Multi-language Support:** Analyze reports in multiple languages
7. **Image Verification:** Analyze attached images for manipulation or authenticity

## Troubleshooting

### Issue: Reports not being verified
- **Check:** Is Flask server running with Gemini API key?
- **Check:** Is `/auto-verify-report` endpoint accessible?
- **Check:** Are Firestore security rules allowing writes to verification subcollection?
- **Solution:** Enable `DEV_SKIP_AUTH` for local testing

### Issue: Badges not showing on Officer Dashboard
- **Check:** Is report document updated with `is_fake` field?
- **Check:** Is `ReportSummary` interface including verification fields?
- **Solution:** Refresh app or re-fetch reports

### Issue: False positive fake reports
- **Solution:** Adjust Gemini prompt in `/auto-verify-report` to be less strict
- **Solution:** Increase confidence threshold for flagging as fake

### Issue: Gemini API errors
- **Check:** Is API key valid and not rate-limited?
- **Solution:** Fallback to keyword-based detection (automatic)
- **Check:** Flask server logs for detailed error messages

## References

- Gemini API Documentation: https://ai.google.dev/documentation
- Firestore Schema Design: https://firebase.google.com/docs/firestore/best-practices
- Report Verification Endpoint: `server/app.py` lines 985-1095
- Officer Dashboard: `src/screens/OfficerDashboard.tsx`
- Citizen Report Submission: `src/screens/AIReportBot.tsx`, `src/screens/CrimeFeed.tsx`

---

**Last Updated:** November 4, 2025
**Status:** ✅ Active
**Version:** 1.0
