import type { ProductSnapshot, SavedProduct, ShoppingItem } from "@/types/models";

function normalizeText(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function parseQuantityValue(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function buildSavedProductSnapshot(product: SavedProduct): ProductSnapshot | null {
  if (product.sourceName === "Saved manually") {
    return null;
  }

  return {
    title: product.title,
    brand: product.brand ?? "",
    storeName: product.storeName ?? "",
    price: product.price ?? null,
    currency: product.currency ?? null,
    imageUrl: product.imageUrl ?? null,
    sourceName: product.sourceName,
    sourceProductId: product.sourceProductId ?? null,
    productUrl: product.productUrl ?? null,
  };
}

export function findMergeableListItem(
  items: ShoppingItem[],
  candidate: {
    title: string;
    productSnapshot?: ProductSnapshot | null;
  },
) {
  const normalizedTitle = normalizeText(candidate.title);
  const candidateSourceProductId = candidate.productSnapshot?.sourceProductId?.trim() ?? "";

  return (
    items.find((item) => {
      if (item.bought) {
        return false;
      }

      const itemSourceProductId = item.productSnapshot?.sourceProductId?.trim() ?? "";

      if (candidateSourceProductId && itemSourceProductId) {
        return candidateSourceProductId === itemSourceProductId;
      }

      return normalizeText(item.title) === normalizedTitle;
    }) ?? null
  );
}
