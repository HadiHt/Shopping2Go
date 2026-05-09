import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const usdaApiKey = (process.env.USDA_API_KEY || "DEMO_KEY").trim();

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

function normalizeOffSearchResults(products) {
  return products
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
}

function normalizeUsdaResults(foods) {
  return foods
    .filter((food) => food?.description)
    .map((food) => ({
      title: food.description,
      brand: typeof food.brandOwner === "string" ? food.brandOwner : typeof food.brandName === "string" ? food.brandName : "",
      price: null,
      currency: null,
      imageUrl: null,
      sourceName: "USDA FoodData Central",
      sourceProductId: food.fdcId ? String(food.fdcId) : null,
      productUrl: food.fdcId ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients` : null,
    }));
}

async function fetchOpenFoodFactsSearch(query) {
  const upstreamUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`;
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "Shopping2Go Product Proxy/1.0",
      Accept: "application/json",
    },
  });

  if (!upstreamResponse.ok) {
    const upstreamBody = await upstreamResponse.text();
    throw new Error(`Open Food Facts returned ${upstreamResponse.status} ${upstreamResponse.statusText}: ${upstreamBody.slice(0, 200)}`);
  }

  const data = await upstreamResponse.json();
  const products = Array.isArray(data.products) ? data.products : [];
  return normalizeOffSearchResults(products);
}

async function fetchUsdaSearch(query) {
  const upstreamUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaApiKey)}&query=${encodeURIComponent(query)}&pageSize=12&dataType=Branded`;
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!upstreamResponse.ok) {
    const upstreamBody = await upstreamResponse.text();
    throw new Error(`USDA returned ${upstreamResponse.status} ${upstreamResponse.statusText}: ${upstreamBody.slice(0, 200)}`);
  }

  const data = await upstreamResponse.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  return normalizeUsdaResults(foods);
}

async function fetchOpenFoodFactsBarcode(barcode) {
  const upstreamUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=code,product_name,brands,image_front_small_url,image_url,url`;
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "Shopping2Go Product Proxy/1.0",
      Accept: "application/json",
    },
  });

  if (!upstreamResponse.ok) {
    const upstreamBody = await upstreamResponse.text();
    throw new Error(`Open Food Facts barcode lookup returned ${upstreamResponse.status} ${upstreamResponse.statusText}: ${upstreamBody.slice(0, 200)}`);
  }

  const data = await upstreamResponse.json();
  const product = data?.product;

  if (!product?.product_name) {
    return [];
  }

  return [
    {
      title: product.product_name,
      brand: typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() || "" : "",
      price: null,
      currency: null,
      imageUrl: product.image_front_small_url || product.image_url || null,
      sourceName: "Open Food Facts (Barcode)",
      sourceProductId: typeof product.code === "string" ? product.code : barcode,
      productUrl: typeof product.url === "string" ? product.url : null,
    },
  ];
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "shopping2go-product-proxy" });
});

app.get("/api/products/search", async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";

  if (!query) {
    response.status(400).json({ error: "Query parameter q is required." });
    return;
  }

  const sourcesTried = [];

  try {
    sourcesTried.push("open-food-facts");
    const offResults = await fetchOpenFoodFactsSearch(query);

    if (offResults.length > 0) {
      response.json({ results: offResults, sourceUsed: "open-food-facts", sourcesTried });
      return;
    }
  } catch (error) {
    console.error("Open Food Facts search failed", error);
  }

  try {
    sourcesTried.push("usda");
    const usdaResults = await fetchUsdaSearch(query);
    response.json({ results: usdaResults, sourceUsed: "usda", sourcesTried });
  } catch (error) {
    console.error("USDA fallback search failed", error);
    response.status(502).json({
      error: error instanceof Error ? error.message : "Product search failed across all configured sources.",
      sourcesTried,
    });
  }
});

app.get("/api/products/barcode/:code", async (request, response) => {
  const barcode = typeof request.params.code === "string" ? request.params.code.trim() : "";

  if (!barcode) {
    response.status(400).json({ error: "Barcode path parameter is required." });
    return;
  }

  try {
    const results = await fetchOpenFoodFactsBarcode(barcode);
    response.json({ results, sourceUsed: "open-food-facts-barcode" });
  } catch (error) {
    console.error("Barcode lookup failed", error);
    response.status(502).json({
      error: error instanceof Error ? error.message : "Barcode lookup failed.",
    });
  }
});

app.listen(port, () => {
  console.log(`Shopping2Go product proxy listening on port ${port}`);
});
