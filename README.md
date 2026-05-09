# Shopping2Go

Shopping2Go is an Expo + Web household shopping app starter backed entirely by Firebase.

## Included foundation

- Firebase Auth account flow
- Shared households with invite codes
- Ongoing shopping list
- Monthly lists generated from recurring templates
- Text-only receipt entries for free-tier Firebase
- Spending summaries by day, month, and year
- Optional Render-backed product search proxy using Open Food Facts as a starter source
- Firebase Hosting and Firestore rules files

## Local setup

1. Copy `.env.example` to `.env`.
2. Add your Firebase web app values.
3. Optional: add `EXPO_PUBLIC_PRODUCT_SEARCH_API_BASE_URL` if you deploy the backend proxy.
4. Install dependencies:

```bash
npm install
```

5. Start Expo:

```bash
npm run web
```

## Firebase

- Deploy Firestore rules with `firebase deploy --only firestore:rules`
- Deploy web hosting after `npm run build`

The app intentionally avoids custom backend logic. Store-source import stays client-only, so any source that needs secrets, server-side scraping, or bypass logic should be added in a later backend-enabled phase. Receipt images are intentionally disabled in this version so the app stays on Firebase's free path.

## Render backend

This repo also includes a small Render-ready backend in [backend](C:/Users/hadih/Repos/Shopping2Go/backend/package.json:1) for proxying product search requests.

- Install backend dependencies in `backend`
- Deploy it as a Render web service
- Set `EXPO_PUBLIC_PRODUCT_SEARCH_API_BASE_URL` in the frontend `.env`

The frontend will call `GET /api/products/search?q=...` on that backend when the env var is present.
