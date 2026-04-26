# Google Ads Integration — Setup Guide

## Overview

The dashboard supports Google Ads alongside Meta Ads. This document covers how to obtain and configure the required credentials.

## Required Environment Variables

```env
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token
GOOGLE_ADS_CLIENT_ID=your-oauth-client-id
GOOGLE_ADS_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_ADS_REFRESH_TOKEN=your-refresh-token
GOOGLE_ADS_LOGIN_CUSTOMER_ID=your-mcc-id  # Optional, only if using MCC
```

## Step-by-Step Setup

### 1. Get a Developer Token

1. Sign in to your Google Ads account at [ads.google.com](https://ads.google.com)
2. Go to **Tools & Settings** > **API Center**
3. If you don't have a developer token yet, apply for one
4. Copy the **Developer Token** (it will be in "Test" mode initially — apply for "Basic" access for production use)

### 2. Create OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable the **Google Ads API** in the API Library
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth client ID**
6. Application type: **Web application**
7. Add `http://localhost:3000/oauth/callback` as an authorized redirect URI
8. Copy the **Client ID** and **Client Secret**

### 3. Generate a Refresh Token

The easiest way is using Google's OAuth2 Playground or a script:

#### Option A: OAuth2 Playground

1. Go to [Google OAuth2 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (top right) and check **Use your own OAuth credentials**
3. Enter your Client ID and Client Secret
4. In the left panel, find **Google Ads API v17** and select `https://www.googleapis.com/auth/adwords`
5. Click **Authorize APIs** and sign in with the Google account that has access to the Ads account
6. Click **Exchange authorization code for tokens**
7. Copy the **Refresh Token**

#### Option B: Node.js Script

```js
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'urn:ietf:wg:oauth:2.0:oob'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/adwords'],
  prompt: 'consent',
});

console.log('Authorize this app by visiting:', url);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter the code from that page: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('Refresh Token:', tokens.refresh_token);
  rl.close();
});
```

### 4. Find Your Customer ID

1. Sign in to Google Ads
2. The Customer ID is the 10-digit number shown in the top-right corner (format: `XXX-XXX-XXXX`)
3. Remove the dashes when setting the env var (e.g., `1234567890`)

### 5. MCC (Manager Account) — Optional

If you manage accounts through an MCC (My Client Center):
- Set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` to the MCC account ID (no dashes)
- Each sub-account can be connected individually via the dashboard UI

## Connecting an Account in the Dashboard

Once env vars are configured:

1. Navigate to the dashboard
2. The Google Ads section will appear (only if `GOOGLE_ADS_DEVELOPER_TOKEN` is set)
3. Click "Connect Google Ads Account"
4. Enter the Customer ID for the account (e.g., ULTRAMALHAS)
5. Data will start flowing immediately

## API Endpoints (tRPC)

| Procedure | Description |
|-----------|-------------|
| `googleAds.isConfigured` | Check if API credentials are set |
| `googleAds.accounts` | List connected Google Ads accounts |
| `googleAds.connectAccount` | Connect a new account by Customer ID |
| `googleAds.disconnectAccount` | Soft-delete an account |
| `googleAds.summary` | Account-level KPIs for a date range |
| `googleAds.campaigns` | Campaign performance with metrics |
| `googleAds.adGroups` | Ad Group breakdown per campaign |
| `googleAds.ads` | Individual ad performance per campaign |
| `googleAds.diagnose` | Health check for all connected accounts |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Token refresh failed: 400` | Invalid refresh token | Re-generate refresh token (Step 3) |
| `PERMISSION_DENIED` | Account not accessible | Ensure the Google account used for OAuth has access to the Ads account |
| `DEVELOPER_TOKEN_NOT_APPROVED` | Token in test mode | Apply for Basic access in API Center, or use test account |
| `LOGIN_CUSTOMER_ID_NOT_FOUND` | Wrong MCC ID | Verify the MCC account ID or remove the env var if not using MCC |
