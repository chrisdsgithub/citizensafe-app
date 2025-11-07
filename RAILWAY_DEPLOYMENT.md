# Railway Deployment Guide for CitizenSafe Backend

## Step 1: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project **citizensafe-437b0**
3. Click **Settings** ⚙️ (gear icon in top-left)
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key** button
6. A JSON file will download (e.g., `citizensafe-437b0-xxxxx.json`)
7. **KEEP THIS FILE SECRET** - Don't commit to GitHub!

## Step 2: Convert JSON to Environment Variable

Open Terminal and run:

```bash
# macOS/Linux
cat ~/Downloads/citizensafe-437b0-xxxxx.json | tr '\n' ' ' | pbcopy

# This copies the JSON as a single line to your clipboard
```

Alternatively, view the file:
```bash
cat ~/Downloads/citizensafe-437b0-xxxxx.json
```

Copy the entire JSON content (with proper formatting).

## Step 3: Deploy to Railway

1. Go to [Railway.app](https://railway.app)
2. Click **New Project**
3. Select **Deploy from GitHub**
4. Connect your GitHub account if needed
5. Select **chrisdsgithub/citizensafe-app** repository
6. Click **Deploy**

## Step 4: Set Environment Variables in Railway

Once deployment starts:

1. Open the **Backend Service** (or the deployed service)
2. Go to **Variables** tab
3. Add the following variables:

| Key | Value |
|-----|-------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Paste your entire Firebase JSON here (as a single line) |
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `DEV_SKIP_AUTH` | `false` |
| `MOCK_MODE` | `false` |
| `PORT` | `8080` |

**To add variables:**
- Click **+ Add Variable**
- Enter Key (e.g., `FIREBASE_SERVICE_ACCOUNT_KEY`)
- Enter Value (paste the entire JSON)
- Click **Add**
- Repeat for each variable

## Step 5: Get Your Public Railway URL

1. After deployment completes, go to the **Deployments** tab
2. Click on the active deployment
3. Look for **Public URL** or **Domain**
4. It will look like: `https://citizen-safe-xxxxx.railway.app`
5. Copy this URL

## Step 6: Update Frontend with Railway URL

Once you have the Railway URL, notify me and I'll update all 8 TypeScript files:
- `src/services/riskApi.ts`
- `src/services/voiceApi.ts`
- `src/screens/OfficerDashboard.tsx`
- `src/screens/CrimeFeed.tsx`
- `src/screens/AIReportBot.tsx`
- `src/screens/CitizenSignup.tsx`
- `src/screens/ReportManagementScreen.tsx`
- And any other files using `192.168.29.169:8080`

Replace:
```
http://192.168.29.169:8080
```

With:
```
https://your-railway-url.railway.app
```

## Step 7: Test the Connection

After updating the frontend, test:
1. Create a new crime report
2. Check if predictions work
3. Verify Aadhaar verification endpoint
4. Test escalation predictions

## Troubleshooting

### "Permission denied" errors
- Ensure `FIREBASE_SERVICE_ACCOUNT_KEY` is set correctly
- Check that the JSON is on a single line (no newlines)

### "Cannot connect" to Railway URL
- Verify the URL is correct in all 8 files
- Use HTTPS (not HTTP)
- Wait 2-3 minutes for Railway to fully deploy

### "Model not found" errors
- Railway will run in `MOCK_MODE=true` if model files are missing
- Set `MOCK_MODE=false` only if you've added model files to the repo

## Important Security Notes

⚠️ **DO NOT:**
- Commit `firebase-key.json` to GitHub
- Share your Firebase service account key
- Post screenshots with credentials visible

✅ **DO:**
- Use Railway's Variables feature for secrets
- Rotate Firebase keys periodically
- Review Firebase rules regularly

## Environment Variable Reference

```bash
# Firebase credentials (REQUIRED)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"citizensafe-437b0",...}

# API Keys (REQUIRED)
GEMINI_API_KEY=AIzaSyD...

# Development flags (Optional)
DEV_SKIP_AUTH=false              # Enable Firebase auth in production
MOCK_MODE=false                  # Use ML models (true = mock mode)
FLASK_ENV=production             # Flask environment

# Port (Default: 8080)
PORT=8080
```

## Need Help?

1. Check Railway logs: Dashboard → Deployments → Logs
2. Review this guide again
3. Verify all environment variables are set
4. Check that GitHub repo has the latest code
