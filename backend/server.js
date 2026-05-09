import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS."));
    },
  }),
);

app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "shopping2go-product-proxy" });
});

app.get("/api/products/search", async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";

  if (!query) {
    response.status(400).json({ error: "Query parameter q is required." });
    return;
  }

  const upstreamUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Shopping2Go Product Proxy/1.0",
        Accept: "application/json",
      },
    });

    if (!upstreamResponse.ok) {
      response.status(502).json({ error: "Upstream product source returned an error." });
      return;
    }

    const data = await upstreamResponse.json();
    const products = Array.isArray(data.products) ? data.products : [];
    const results = products
      .filter((product) => product?.product_name)
      .map((product) => ({
        title: product.product_name,
        brand: typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() || "" : "",
        price: null,
        currency: null,
        imageUrl: product.image_front_small_url || product.image_url || null,
        sourceName: "Open Food Facts",
        sourceProductId: typeof product.code === "string" ? product.code : null,
        productUrl: typeof product.url === "string" ? product.url : null,
      }));

    response.json({ results });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected product search proxy error.",
    });
  }
});

app.listen(port, () => {
  console.log(`Shopping2Go product proxy listening on port ${port}`);
});
