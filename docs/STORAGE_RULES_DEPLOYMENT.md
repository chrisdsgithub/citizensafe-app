# Deploy Storage Rules to Firebase

## Quick Steps:

### 1. Install Firebase CLI (if not already installed)
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Deploy Storage Rules
```bash
firebase deploy --only storage
```

## What the Rules Allow:

✅ **Officers can upload their badges to:**
- `officer_badges/{userId}/{fileName}`

✅ **Citizens can upload:**
- Profile pictures: `profile_pictures/{userId}/{fileName}`
- Report media: `report_media/{userId}/{fileName}`
- Aadhaar cards: `aadhaar_cards/{userId}/{fileName}`

✅ **All authenticated users can:**
- Read all public uploads
- Upload to their own user folders

## Security Features:

- 🔐 Only authenticated users can upload
- 👤 Users can only upload to their own folder
- 📊 File size limits enforced:
  - Profile pictures: unlimited
  - Report media: 10MB max
  - Aadhaar cards: 5MB max
  - Chat attachments: 15MB max

## Troubleshooting:

If you get "User does not have permission", the storage.rules haven't been deployed yet.

**To check current rules:**
```bash
firebase storage:get rules
```

**To see which rules to deploy:**
```bash
firebase deploy --only storage --dry-run
```

## After Deployment:

Officers will be able to upload their badges immediately! 🎉
