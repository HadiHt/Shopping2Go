# Shopping2Go Product Proxy

This backend is a small Render-friendly Express service that proxies product search requests so the web app avoids browser CORS failures.

## Local run

1. Copy `.env.example` to `.env`
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm run dev
```

The API will expose:

- `GET /health`
- `GET /api/products/search?q=pilos+yogurt`

## Render setup

- Create a new Web Service from the `backend` folder
- Build command: `npm install`
- Start command: `npm start`
- Set `ALLOWED_ORIGINS` to your local web URL and deployed frontend URL

Example:

```txt
http://localhost:8081,https://shopping2go-d7675.web.app
```

## Frontend setup

Add this to the root frontend `.env`:

```env
EXPO_PUBLIC_PRODUCT_SEARCH_API_BASE_URL=https://your-render-service.onrender.com
```
