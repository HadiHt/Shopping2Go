import type { ProductSnapshot, SavedProduct, ShoppingItem } from "@/types/models";

const ANYTIME_AUTO_REMOVE_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeText(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function comparableTime(value: unknown) {
  const hasToDate =
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function";

  if (value instanceof Date) {
    return value.getTime();
  }

  if (hasToDate) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  return 0;
}

function parseMonthlyListMonthKey(listId: string) {
  const monthlyMarker = "_monthly_";

  if (!listId.includes(monthlyMarker)) {
    return null;
  }

  return listId.slice(listId.indexOf(monthlyMarker) + monthlyMarker.length);
}

function endOfMonthExpiry(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  if (!year || !month) {
    return null;
  }

  return new Date(year, month, 1, 0, 0, 0, 0).getTime();
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

export function getListItemAutoRemoveAt(item: ShoppingItem) {
  if (!item.bought) {
    return null;
  }

  if (item.listId.endsWith("_ongoing")) {
    const boughtAt = comparableTime(item.boughtAt) || comparableTime(item.updatedAt) || comparableTime(item.createdAt);
    return boughtAt > 0 ? boughtAt + ANYTIME_AUTO_REMOVE_WINDOW_MS : null;
  }

  const monthKey = parseMonthlyListMonthKey(item.listId);
  return monthKey ? endOfMonthExpiry(monthKey) : null;
}

export function isListItemExpired(item: ShoppingItem, now = Date.now()) {
  const expiresAt = getListItemAutoRemoveAt(item);
  return expiresAt !== null && expiresAt <= now;
}

export function formatAutoRemoveCountdown(expiresAt: number, now = Date.now()) {
  const remainingMs = Math.max(0, expiresAt - now);
  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
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
