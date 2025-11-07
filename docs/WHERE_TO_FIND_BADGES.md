# 👀 Where to Find the Verification Badges

## Navigation Path

```
Open App
    ↓
Switch to OFFICER tab (bottom navigation)
    ↓
Tap on Officer Dashboard
    ↓
Scroll DOWN past KPI cards
    ↓
Find "Incident Escalation Risks" section ← HERE!
    ↓
See verification badges on each report
```

## On-Screen Location

### Mobile Screen Layout

```
┌────────────────────────────────────────┐
│  Officer Dashboard                     │
├────────────────────────────────────────┤
│  📊 Active Alerts: 5                   │
│  📋 Reports Filed: 23                  │
│  👮 Officers on Duty: 8                │
├────────────────────────────────────────┤
│  🗺️  View Map (3 Geo-Tagged)          │
├────────────────────────────────────────┤
│  📊 Recent Reports                     │
│  [Table with all reports]              │
├────────────────────────────────────────┤
│  ⚠️  INCIDENT ESCALATION RISKS    ← START HERE
│  ─────────────────────────────────────│
│  1. Robbery at market...              │
│     [HIGH RISK 95%] [✅ VERIFIED]    │ ← SEE BADGES HERE
│     Andheri West                      │
│                                       │
│  2. Something happened...             │
│     [MEDIUM RISK 45%] [🚨 FAKE]     │ ← OR HERE
│     Unknown Location                  │
│                                       │
│  3. Assault near metro...             │
│     [HIGH RISK 78%] [⏳ VERIFYING]   │ ← OR HERE
│     Downtown Metro                    │
└────────────────────────────────────────┘
```

## Close-Up View of Each Badge

### Report with VERIFIED Badge ✅
```
┌─────────────────────────────────────────────┐
│ Robbery witnessed at Andheri market...      │
│                                             │
│ ┏━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━┓        │
│ ┃ HIGH RISK 95% ┃ ✅ VERIFIED    ┃        │
│ ┗━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━┛        │
│  (Bright Red)    (Bright Green)            │
│                                             │
│ Andheri West Market                         │
└─────────────────────────────────────────────┘
```

### Report with FAKE Badge 🚨
```
┌─────────────────────────────────────────────┐
│ Something bad happened lol...               │
│                                             │
│ ┏━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━┓           │
│ ┃ MEDIUM 45%    ┃ 🚨 FAKE      ┃           │
│ ┗━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━┛           │
│  (Orange)        (Bright Red)              │
│                                             │
│ Unknown Location                            │
└─────────────────────────────────────────────┘
```

### Report with VERIFYING Badge ⏳
```
┌─────────────────────────────────────────────┐
│ Assault near metro station...               │
│                                             │
│ ┏━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━┓           │
│ ┃ HIGH RISK 78% ┃ ⏳ VERIFYING ┃           │
│ ┗━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━┛           │
│  (Bright Red)    (Gray)                    │
│                                             │
│ Downtown Metro                              │
└─────────────────────────────────────────────┘
```

## Badge Details

### Left Badge: Risk Level
- Shows the escalation risk: LOW, MEDIUM, HIGH
- Color coded: Green, Orange, Red
- Includes percentage: (50%), (75%), (95%)
- Always present
- Shows on all reports

### Right Badge: Verification Status
- Shows verification result: VERIFIED, FAKE, VERIFYING
- Color coded: Green, Red, Gray
- Includes emoji: ✅, 🚨, ⏳
- Shows automatically after report is verified
- New feature in this update!

---

## Interactive Actions

### Clicking a VERIFIED Report ✅
```
Tap on [✅ VERIFIED] report
    ↓
Modal opens with report details
    ↓
Message: "Report analysis in progress..."
    ↓
Crime type prediction: ✅ AVAILABLE
You can proceed with analysis
```

### Clicking a FAKE Report 🚨
```
Tap on [🚨 FAKE] report
    ↓
Alert appears:
"Report Flagged
This report has been flagged as inauthentic 
and cannot be used for crime prediction.
Reason: [verification_reasoning]"
    ↓
Crime type prediction: ❌ BLOCKED
You cannot proceed with analysis
```

### Clicking a VERIFYING Report ⏳
```
Tap on [⏳ VERIFYING] report
    ↓
Modal opens with report details
    ↓
Crime type prediction: ⚠️  May attempt
(Verification still processing)
```

---

## Color Legend

### Risk Level Colors (Left Badge)
```
🟢 LOW RISK     → Green (#27AE60)
🟠 MEDIUM RISK  → Orange (#E67E22)
🔴 HIGH RISK    → Red (#C0392B)
```

### Verification Status Colors (Right Badge)
```
🟢 ✅ VERIFIED  → Green (#27AE60)
🔴 🚨 FAKE      → Red (#E74C3C)
⚪ ⏳ VERIFYING  → Gray (#95A5A6)
```

---

## Step-by-Step Instructions

### To See the Badges:

**Step 1:**
- Open the Citizen Safe App
- Tap **OFFICER** at the bottom

**Step 2:**
- Tap **Officer Dashboard**

**Step 3:**
- Scroll down (past the KPI cards)

**Step 4:**
- Look for section: **"Incident Escalation Risks"**

**Step 5:**
- Each report shows TWO badges:
  - Left: Risk level (always)
  - Right: Verification status (new!)

**Step 6:**
- Tap any report to interact:
  - ✅ VERIFIED → Can analyze
  - 🚨 FAKE → Blocked
  - ⏳ VERIFYING → Maybe analyze

---

## Verification Status Meanings

| Status | Symbol | Color | Meaning | Action |
|--------|--------|-------|---------|--------|
| VERIFIED | ✅ | Green | Report is genuine | Can predict crime |
| FAKE | 🚨 | Red | Report is inauthentic | Crime prediction blocked |
| VERIFYING | ⏳ | Gray | Still checking | May attempt predict |

---

## Example Workflow

### Scenario 1: Genuine Report
```
1. Citizen submits: "Robbery at Andheri market at 3 PM"
2. System verifies: Detailed, specific, plausible
3. Officer Dashboard shows: [HIGH RISK 95%] [✅ VERIFIED]
4. Officer clicks report
5. Can proceed to crime prediction analysis
```

### Scenario 2: Suspicious Report
```
1. Citizen submits: "Something bad happened lol"
2. System verifies: Vague, suspicious keywords
3. Officer Dashboard shows: [MEDIUM RISK 45%] [🚨 FAKE]
4. Officer clicks report
5. Gets alert: "Report flagged as inauthentic"
6. Cannot proceed with crime prediction
```

### Scenario 3: Report Still Being Verified
```
1. Citizen submits: New report
2. System is analyzing: Still processing
3. Officer Dashboard shows: [LOW RISK 20%] [⏳ VERIFYING]
4. Officer can click but verification not complete
5. Badges update when verification done
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No badges showing | Reload app (press R in Expo) |
| Only left badge visible | Refresh or rebuild app |
| Badge colors wrong | Clear app cache |
| Badges on wrong section | Make sure looking at "Incident Escalation Risks" |
| No reports in section | Submit reports from Citizens tab first |

---

## Summary

✅ Verification badges show on **Officer Dashboard**
✅ In the **"Incident Escalation Risks"** section
✅ **Two badges per report:** Risk (left) + Verification (right)
✅ **Color coded:** Green = Good, Red = Bad, Gray = Pending
✅ **Interactive:** Click to view details or get blocked

**Now reload your app and check!** 🚀
