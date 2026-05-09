import type { NullableTimestamp, ReceiptEntry, SpendingBucket, SpendingRange } from "@/types/models";

export function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

export function currentMonthKey() {
  return monthKeyFromDate(new Date());
}

export function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return monthKeyFromDate(date);
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function displayDate(value: string | NullableTimestamp) {
  const hasToDate =
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function";
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (hasToDate) {
    date = value.toDate();
  } else if (typeof value === "string") {
    date = new Date(value);
  }

  if (!date) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

export function aggregateSpending(receipts: ReceiptEntry[], range: SpendingRange): SpendingBucket[] {
  const buckets = new Map<string, number>();

  for (const receipt of receipts) {
    const date = new Date(receipt.purchaseDate);

    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const key =
      range === "day"
        ? date.toISOString().slice(0, 10)
        : range === "month"
          ? monthKeyFromDate(date)
          : `${date.getFullYear()}`;

    buckets.set(key, (buckets.get(key) ?? 0) + receipt.total);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, total]) => ({
      key,
      total,
      label:
        range === "day"
          ? displayDate(key)
          : range === "month"
            ? formatMonthLabel(key)
            : key,
    }));
}
