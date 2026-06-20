import { Platform } from "react-native";

export type ReceiptScanResult = {
  rawText: string;
  total: number | null;
  purchaseDate: string | null;
  storeName: string | null;
};

const totalKeywords = ["total", "ukupno", "iznos", "za platiti", "placanje", "payment", "eur", "€"];
const storeStopwords = [
  "racun",
  "račun",
  "fiskal",
  "fiscal",
  "datum",
  "date",
  "time",
  "vrijeme",
  "total",
  "ukupno",
  "oib",
  "pdv",
  "iban",
  "pos",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const sanitized = value.replace(/[^0-9.,]/g, "");

  if (!sanitized) {
    return null;
  }

  const lastComma = sanitized.lastIndexOf(",");
  const lastDot = sanitized.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex === -1) {
    const whole = Number(sanitized);
    return Number.isFinite(whole) ? whole : null;
  }

  const whole = sanitized.slice(0, separatorIndex).replace(/[.,]/g, "");
  const fraction = sanitized.slice(separatorIndex + 1).replace(/[.,]/g, "");
  const normalized = `${whole}.${fraction}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractTotal(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  let bestKeywordAmount: number | null = null;

  for (const line of lines) {
    const lowered = line.toLowerCase();
    const matches = line.match(/\d{1,4}(?:[.,]\d{2})/g) ?? [];
    const amounts = matches.map(parseAmount).filter((value): value is number => value !== null);

    if (amounts.length === 0) {
      continue;
    }

    if (totalKeywords.some((keyword) => lowered.includes(keyword))) {
      bestKeywordAmount = Math.max(...amounts);
    }
  }

  if (bestKeywordAmount !== null) {
    return bestKeywordAmount;
  }

  const allAmounts = (text.match(/\d{1,4}(?:[.,]\d{2})/g) ?? [])
    .map(parseAmount)
    .filter((value): value is number => value !== null);

  if (allAmounts.length === 0) {
    return null;
  }

  return Math.max(...allAmounts);
}

function extractDate(text: string) {
  const patterns = [
    /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/,
    /\b(\d{1,2})[-./](\d{1,2})[-./](\d{4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    if (match[1].length === 4) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function looksLikeStoreName(line: string) {
  const lowered = line.toLowerCase();

  if (storeStopwords.some((word) => lowered.includes(word))) {
    return false;
  }

  if (/\d{3,}/.test(line)) {
    return false;
  }

  const lettersOnly = line.replace(/[^A-Za-zÀ-ž ]/g, "").trim();

  if (lettersOnly.length < 3) {
    return false;
  }

  return true;
}

function extractStoreName(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    if (looksLikeStoreName(line)) {
      return line;
    }
  }

  return null;
}

export function parseReceiptText(text: string): ReceiptScanResult {
  const normalizedText = normalizeWhitespace(text);

  return {
    rawText: normalizedText,
    total: extractTotal(text),
    purchaseDate: extractDate(text),
    storeName: extractStoreName(text),
  };
}

export async function scanReceiptImage(source: string | File): Promise<ReceiptScanResult> {
  if (Platform.OS !== "web") {
    throw new Error("Receipt scan works on web in this first version. On mobile, enter the receipt fields manually for now.");
  }

  const { recognize } = await import("tesseract.js");
  const result = await recognize(source, "eng");
  return parseReceiptText(result.data.text ?? "");
}
