SocioGenix Documentation 
Version: 1.1.0
Date: April 22, 2025
Purpose: SocioGenix is a social media management platform that enables users to connect and manage multiple social media accounts (Instagram, Threads, X.com, YouTube, Reddit, TikTok) via Google OAuth, with cross-posting, analytics, monetization, and content scheduling.
New Features
Google OAuth Login:
Users sign in using Google accounts via Firebase Authentication.

Supports web (signInWithPopup) and mobile (google_sign_in package).

Social Media Account Integration:
Connect accounts via OAuth flows from the dashboard.

Supported platforms: Instagram, Threads, X.com, YouTube, Reddit, TikTok.

Displays connected accounts with usernames.

Secure Token Storage:
OAuth tokens stored in Firestore (accounts collection) with restricted access.

Setup Instructions (Updated)
Firebase Project:
Enable Google Authentication in Firebase Console:
Add Google as a sign-in provider.

Set up OAuth 2.0 credentials in Google Cloud Console (get clientId, clientSecret).

Add redirect URI for YouTube OAuth: https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/oauth/youtube/callback.

Social Media API Credentials:
Instagram/Threads:
Create a Meta Developer app, get clientId, clientSecret.

Update oauthConfigs in functions_index.js.

X.com:
Create a Twitter Developer app, get clientId, clientSecret.

Enable OAuth 1.0a.

YouTube:
Use Google Cloud Console to enable YouTube Data API.

Use same clientId, clientSecret as Google OAuth.

Reddit:
Create a Reddit app, get clientId, clientSecret.

Set redirect URI to https://YOUR_FIREBASE_PROJECT_ID.firebaseapp.com/oauth-callback.

TikTok:
Create a TikTok Developer app, get clientId, clientSecret.

Update functions_index.js:
javascript

const oauthConfigs = {
  instagram: { clientId: 'YOUR_INSTAGRAM_CLIENT_ID', clientSecret: 'YOUR_INSTAGRAM_CLIENT_SECRET', ... },
  threads: { clientId: 'YOUR_INSTAGRAM_CLIENT_ID', clientSecret: 'YOUR_INSTAGRAM_CLIENT_SECRET', ... },
  'x.com': { clientId: 'YOUR_TWITTER_CLIENT_ID', clientSecret: 'YOUR_TWITTER_CLIENT_SECRET', ... },
  youtube: { clientId: 'YOUR_GOOGLE_CLIENT_ID', clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET', ... },
  reddit: { clientId: 'YOUR_REDDIT_CLIENT_ID', clientSecret: 'YOUR_REDDIT_CLIENT_SECRET', ... },
  tiktok: { clientId: 'YOUR_TIKTOK_CLIENT_ID', clientSecret: 'YOUR_TIKTOK_CLIENT_SECRET', ... },
};

Backend (Cloud Functions):
Install new dependencies: npm install google-auth-library querystring.

Deploy: npm run deploy.

Web Frontend:
Update frontend_src_App.js with Firebase and Google OAuth configs.

Add OAuth callback handling:
jsx

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'success') {
    alert(`${params.get('platform')} connected successfully!`);
    fetchConnectedAccounts(user?.uid);
  } else if (params.get('status') === 'error') {
    alert(`Error: ${params.get('message')}`);
  }
}, [user]);

Mobile App:
Add google_sign_in to mobile_pubspec.yaml.

Configure Google Sign-In:
Android: Add google-services.json.

iOS: Add GoogleService-Info.plist and update Info.plist:
xml

<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.YOUR_GOOGLE_CLIENT_ID</string>
    </array>
  </dict>
</array>

Handle OAuth redirects via url_launcher.

Firestore Rules:
Update to secure OAuth tokens:
javascript

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /accounts/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /analytics/{doc} {
      allow read, write: if request.auth != null && resource.data.user_id == request.auth.uid;
      allow read: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /trends/{doc} {
      allow read: if true;
      allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}

Usage Guide (Updated)
Sign In:
Web: Click “Sign in with Google” to authenticate via Google OAuth.

Mobile: Tap “Sign in with Google” to use Google Sign-In.

After login, the dashboard loads with user-specific data.

Connect Social Media Accounts:
Go to “Connect Accounts” section.

Click

