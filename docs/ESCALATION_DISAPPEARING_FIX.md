# FIX: Escalation Predictions Disappearing After 2 Seconds

## Problem Description
Escalation predictions were appearing briefly in the "Recent Escalation Predictions" section for about 2 seconds, then **disappearing completely**.

**User Report:** "its saving for 2 seconds and then disappearing"

## Root Cause Analysis

### Timeline of Events:
1. ✅ User clicks "Analyze with AI Model"
2. ✅ Backend predicts escalation (High/Medium/Low)
3. ✅ `handlePredictEscalation()` saves to Firestore with `serverTimestamp()`
4. ✅ **Local state immediately updated** with `new Date()` timestamp
5. ✅ **Prediction appears in UI** (from local state)
6. ⏱️ **~2 seconds pass** (Firestore processing time)
7. 🔔 **Firestore listener fires** with snapshot update
8. ❌ **Listener OVERWRITES local state** with data that's missing escalation fields
9. ❌ **Prediction disappears from UI**

### The Core Issue
The Firestore `onSnapshot` listener (lines 621-708) was **not fetching escalation fields** when building the `ReportSummary` objects. It was fetching:
- ✅ `riskLevelText`, `escalationRiskScore` (old ML fields)
- ✅ `auto_crime_type`, `auto_extracted_location` (classification fields)
- ✅ `is_fake`, `verification_reasoning` (fake report fields)
- ❌ **Missing:** `escalation_prediction`, `escalation_confidence`, `escalation_probabilities`, `escalation_reasoning`, `escalation_predicted_at`

When the listener updated `recentReports` with `setRecentReports(allReportsData)`, it **completely replaced** the array, losing the locally-added escalation fields.

## Why It Appeared for 2 Seconds

The local state update worked perfectly:
```typescript
// This successfully added escalation fields to local state
setRecentReports((prev) => 
  prev.map(r => r.id === report.id ? { ...r, ...localUpdate } : r)
);
```

But ~2 seconds later, the Firestore listener received the update (because we saved to Firestore), and it overwrote the local state with incomplete data:
```typescript
// This REPLACED the entire array without escalation fields
setRecentReports(allReportsData); // ❌ Missing escalation fields!
```

## Solution Implemented

### Fix 1: Fetch Escalation Fields from Firestore
Added escalation fields to the listener's data mapping (lines 677-686):

```typescript
return {
  id: docSnapshot.id,
  reportId: `REP-${docSnapshot.id.substring(0, 5).toUpperCase()}`, 
  type: reportType,
  location: data.location?.city || 'Location Unknown',
  status: data.status || 'Pending', 
  // ... existing fields ...
  userName: userName,
  // ✅ NEW: Escalation prediction fields (from AI Model)
  escalation_prediction: data.escalation_prediction || undefined,
  escalation_confidence: data.escalation_confidence || undefined,
  escalation_probabilities: data.escalation_probabilities || undefined,
  escalation_reasoning: data.escalation_reasoning || undefined,
  escalation_predicted_at: data.escalation_predicted_at || undefined,
} as ReportSummary;
```

### Fix 2: Added Debug Logging
Added console log to track when Firestore listener updates (line 690):

```typescript
console.log('🔄 Firestore listener update - reports with escalation:', 
  allReportsData.filter(r => r.escalation_prediction).length);
setRecentReports(allReportsData);
```

This helps verify:
- When the listener fires
- How many reports have escalation predictions
- If Firestore data includes the escalation fields

## Expected Behavior After Fix

### Before Fix:
```
[0s] User clicks "Analyze with AI Model"
[1s] Prediction appears ✅
[2s] Firestore listener fires
[3s] Prediction disappears ❌ (listener overwrites with incomplete data)
```

### After Fix:
```
[0s] User clicks "Analyze with AI Model"
[1s] Prediction appears ✅ (local state)
[2s] Firestore listener fires with complete data ✅
[3s] Prediction STAYS visible ✅ (Firestore data includes escalation fields)
[4s+] Prediction persists across app refreshes ✅
```

## Testing Instructions

### Test 1: Basic Persistence
1. Open Officer Dashboard
2. Click any report → "Analyze with AI Model"
3. Wait for prediction
4. **Expected:** Prediction appears immediately
5. **Expected:** Prediction STAYS visible (doesn't disappear after 2 seconds)
6. **Expected:** Console shows: `🔄 Firestore listener update - reports with escalation: 1`

### Test 2: Multiple Predictions
1. Analyze 5 different reports
2. **Expected:** All 5 predictions stay visible
3. **Expected:** Latest 3 appear in "Recent Escalation Predictions"
4. **Expected:** Console shows: `🔄 Firestore listener update - reports with escalation: 5`

### Test 3: App Refresh
1. Analyze a report
2. Close and reopen the app
3. **Expected:** Prediction still visible (loaded from Firestore)
4. **Expected:** Appears in "Recent Escalation Predictions" immediately

### Test 4: Real-time Sync
1. Officer A analyzes a report
2. Officer B refreshes dashboard
3. **Expected:** Officer B sees Officer A's prediction
4. **Expected:** Console on both devices shows updated count

## Console Output Examples

### Successful Save + Persistence:
```
📊 Requesting escalation prediction for: {...}
✅ Escalation prediction result: { predicted_risk: "High", confidence: 0.95, ... }
🔄 Updated recentReports: [
  { id: 'abc123', hasEscalation: true, escalation: 'High', timestamp: Date {...} }
]
✅ Escalation prediction saved to Firestore and local state updated
📦 Local update data: { escalation_prediction: 'High', ... }

[~2 seconds later]
🔄 Firestore listener update - reports with escalation: 1
🎯 Recent Escalation Predictions rendering...
📝 Total recentReports: 10
📋 All reports: [
  { id: 'abc123', hasEscalation: true, hasTimestamp: true },
  ...
]
🔍 Checking report abc123: { has_escalation_prediction: true, has_escalation_predicted_at: true, ... }
📊 Total reports with escalation: 1
📋 Sorted reports (latest 3): [{ id: 'abc123', risk: 'High', time: Timestamp {...} }]
```

## Related Files Modified

1. **src/screens/OfficerDashboard.tsx** (lines 677-686)
   - Added escalation field mapping in Firestore listener
   - Fields: `escalation_prediction`, `escalation_confidence`, `escalation_probabilities`, `escalation_reasoning`, `escalation_predicted_at`

2. **src/screens/OfficerDashboard.tsx** (line 690)
   - Added debug logging: `🔄 Firestore listener update`

## Why Local State Update Alone Wasn't Enough

Some might wonder: "Why not just keep the local state and not rely on Firestore?"

**Reasons we need Firestore sync:**
1. **Real-time collaboration**: Multiple officers viewing the same report need to see the same prediction
2. **Persistence**: Predictions should survive app restarts
3. **Data integrity**: Firestore is the source of truth
4. **Audit trail**: All predictions logged in database with timestamps
5. **Dashboard updates**: Other parts of the app (like IncidentEscalationRisks screen) need the data

The solution is **not** to skip Firestore, but to ensure the listener fetches **all** fields, including escalation predictions.

## State Management Flow (Correct Implementation)

### Save Flow:
```
User clicks "Analyze" 
→ API call to backend
→ Get prediction result
→ Save to Firestore (serverTimestamp)
→ Update local state immediately (new Date)
→ UI shows prediction instantly ✅
```

### Sync Flow:
```
Firestore processes save
→ Listener receives snapshot
→ Fetch ALL fields (including escalation)
→ Update recentReports with complete data
→ UI stays updated ✅
```

## Prevention of Similar Issues

To prevent this issue with future fields:

1. **When adding new fields to Firestore:**
   - ✅ Add to TypeScript interface (`ReportSummary`)
   - ✅ Add to Firestore save operation
   - ✅ Add to local state update
   - ✅ **Add to listener data mapping** ← This was missed!

2. **Add validation logging:**
   ```typescript
   console.log('Firestore data:', {
     hasEscalation: !!data.escalation_prediction,
     hasConfidence: !!data.escalation_confidence,
     // ... other critical fields
   });
   ```

3. **Test the full lifecycle:**
   - Save → Check local state ✅
   - Wait 3 seconds → Check if data persists ✅
   - Refresh app → Check if data loads ✅

## Related Fixes in This Session

1. **Child Safety Upgrade** - Forces High Risk for child-related incidents
2. **Life-Threatening Upgrade** - Forces High Risk (95%) for hostages/armed threats
3. **Kidnapping Classification** - Properly detects kidnapping (not theft)
4. **Local State Updates** - Immediate UI updates while Firestore processes
5. **Dashboard Display** - Show only 3 latest predictions with View All button
6. **Firestore Field Mapping** ← **Current fix** - Listener now fetches escalation fields

---

**Issue**: Predictions disappearing after 2 seconds  
**Root Cause**: Firestore listener not fetching escalation fields, overwriting local state  
**Fix**: Added escalation field mapping to listener data transformation  
**Status**: ✅ Fixed  
**Date**: November 6, 2025
