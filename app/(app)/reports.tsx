import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActionButton } from "@/components/forms/ActionButton";
import { InfoHint } from "@/components/feedback/InfoHint";
import { Card, EmptyState, Screen, ScreenHeader } from "@/components/layout/Screen";
import { DayRangeCalendar } from "@/components/reports/DayRangeCalendar";
import { MonthRangePicker } from "@/components/reports/MonthRangePicker";
import { StatTile } from "@/components/reports/StatTile";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { subscribeReceipts } from "@/services/firestore";
import type { ReceiptEntry, SpendingRange } from "@/types/models";
import {
  currentDayKey,
  currentMonthKey,
  currentYearKey,
  displayDate,
  formatDayLabel,
  formatMonthLabel,
  shiftYear,
} from "@/utils/date";

const ranges: SpendingRange[] = ["day", "month", "year"];

export default function ReportsScreen() {
  const { activeHouseholdId } = useSession();
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [range, setRange] = useState<SpendingRange>("month");
  const [selectedDayStart, setSelectedDayStart] = useState(currentDayKey());
  const [selectedDayEnd, setSelectedDayEnd] = useState<string | null>(null);
  const [visibleDayMonth, setVisibleDayMonth] = useState(currentMonthKey());
  const [selectedMonthStart, setSelectedMonthStart] = useState(currentMonthKey());
  const [selectedMonthEnd, setSelectedMonthEnd] = useState<string | null>(null);
  const [visibleMonthYear, setVisibleMonthYear] = useState(currentYearKey());
  const [selectedYear, setSelectedYear] = useState(currentYearKey());

  useEffect(() => {
    if (!activeHouseholdId) {
      return;
    }

    return subscribeReceipts(activeHouseholdId, setReceipts);
  }, [activeHouseholdId]);

  const normalizedDayRange = useMemo(() => {
    if (!selectedDayEnd || selectedDayStart <= selectedDayEnd) {
      return { from: selectedDayStart, to: selectedDayEnd ?? selectedDayStart };
    }

    return { from: selectedDayEnd, to: selectedDayStart };
  }, [selectedDayEnd, selectedDayStart]);

  const normalizedMonthRange = useMemo(() => {
    if (!selectedMonthEnd || selectedMonthStart <= selectedMonthEnd) {
      return { from: selectedMonthStart, to: selectedMonthEnd ?? selectedMonthStart };
    }

    return { from: selectedMonthEnd, to: selectedMonthStart };
  }, [selectedMonthEnd, selectedMonthStart]);

  const selectedLabel =
    range === "day"
      ? normalizedDayRange.from === normalizedDayRange.to
        ? formatDayLabel(normalizedDayRange.from)
        : `${formatDayLabel(normalizedDayRange.from)} to ${formatDayLabel(normalizedDayRange.to)}`
      : range === "month"
        ? normalizedMonthRange.from === normalizedMonthRange.to
          ? formatMonthLabel(normalizedMonthRange.from)
          : `${formatMonthLabel(normalizedMonthRange.from)} to ${formatMonthLabel(normalizedMonthRange.to)}`
        : selectedYear;

  const periodReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      if (range === "day") {
        return receipt.purchaseDate >= normalizedDayRange.from && receipt.purchaseDate <= normalizedDayRange.to;
      }

      if (range === "month") {
        const receiptMonth = receipt.purchaseDate.slice(0, 7);
        return receiptMonth >= normalizedMonthRange.from && receiptMonth <= normalizedMonthRange.to;
      }

      return receipt.purchaseDate.startsWith(selectedYear);
    });
  }, [normalizedDayRange.from, normalizedDayRange.to, normalizedMonthRange.from, normalizedMonthRange.to, range, receipts, selectedYear]);

  const total = useMemo(() => periodReceipts.reduce((sum, receipt) => sum + receipt.total, 0), [periodReceipts]);

  const periodCurrency = useMemo(() => {
    const uniqueCurrencies = [...new Set(periodReceipts.map((receipt) => receipt.currency).filter(Boolean))];

    if (uniqueCurrencies.length === 1) {
      return uniqueCurrencies[0];
    }

    if (uniqueCurrencies.length > 1) {
      return "mixed";
    }

    return "";
  }, [periodReceipts]);

  const buckets = useMemo(() => {
    if (range === "day") {
      return periodReceipts
        .slice()
        .sort((left, right) => left.purchaseDate.localeCompare(right.purchaseDate))
        .map((receipt) => ({
          key: receipt.id,
          label: receipt.storeName?.trim() || "Store not noted",
          subtitle: displayDate(receipt.purchaseDate),
          total: receipt.total,
          currency: receipt.currency,
        }));
    }

    const grouped = new Map<string, number>();
    const bucketStores = new Map<string, Set<string>>();
    const bucketCurrencies = new Map<string, Set<string>>();

    for (const receipt of periodReceipts) {
      const date = new Date(receipt.purchaseDate);

      if (Number.isNaN(date.getTime())) {
        continue;
      }

      const key = range === "month" ? receipt.purchaseDate : `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;

      grouped.set(key, (grouped.get(key) ?? 0) + receipt.total);
      const stores = bucketStores.get(key) ?? new Set<string>();
      const currencies = bucketCurrencies.get(key) ?? new Set<string>();

      if (receipt.storeName?.trim()) {
        stores.add(receipt.storeName.trim());
      }

      if (receipt.currency?.trim()) {
        currencies.add(receipt.currency.trim());
      }

      bucketStores.set(key, stores);
      bucketCurrencies.set(key, currencies);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, bucketTotal]) => ({
        key,
        total: bucketTotal,
        label: range === "month" ? displayDate(key) : formatMonthLabel(key),
        currency: (() => {
          const currencies = [...(bucketCurrencies.get(key) ?? new Set<string>())];

          if (currencies.length === 1) {
            return currencies[0];
          }

          if (currencies.length > 1) {
            return "mixed";
          }

          return "";
        })(),
        subtitle: (() => {
          const stores = [...(bucketStores.get(key) ?? new Set<string>())];

          if (stores.length === 0) {
            return "No store noted";
          }

          if (stores.length <= 3) {
            return stores.join(", ");
          }

          return `${stores.slice(0, 3).join(", ")} +${stores.length - 3} more`;
        })(),
      }));
  }, [periodReceipts, range]);

  const handleDaySelect = (dayKey: string) => {
    if (!selectedDayStart || (selectedDayStart && selectedDayEnd)) {
      setSelectedDayStart(dayKey);
      setSelectedDayEnd(null);
      return;
    }

    if (dayKey === selectedDayStart) {
      setSelectedDayEnd(null);
      return;
    }

    setSelectedDayEnd(dayKey);
  };

  const handleMonthSelect = (monthKey: string) => {
    if (!selectedMonthStart || (selectedMonthStart && selectedMonthEnd)) {
      setSelectedMonthStart(monthKey);
      setSelectedMonthEnd(null);
      return;
    }

    if (monthKey === selectedMonthStart) {
      setSelectedMonthEnd(null);
      return;
    }

    setSelectedMonthEnd(monthKey);
  };

  const handleReset = () => {
    if (range === "day") {
      setSelectedDayStart(currentDayKey());
      setSelectedDayEnd(null);
      setVisibleDayMonth(currentMonthKey());
      return;
    }

    if (range === "month") {
      setSelectedMonthStart(currentMonthKey());
      setSelectedMonthEnd(null);
      setVisibleMonthYear(currentYearKey());
      return;
    }

    setSelectedYear(currentYearKey());
  };

  return (
    <Screen>
      <ScreenHeader
        badge="Reports"
        title="Spending trends"
        description="Review shopping totals by day, month, or year based on saved receipts without overpowering the two shopping flows."
      >
        <View style={styles.headerHintRow}>
          <InfoHint message="Choose one period for a focused snapshot, or select a second date/month to compare a range." />
        </View>
      </ScreenHeader>

      <Card>
        <View style={styles.filterRow}>
          {ranges.map((value) => (
            <Pressable key={value} onPress={() => setRange(value)} style={[styles.pill, range === value ? styles.pillActive : null]}>
              <Text style={[styles.pillText, range === value ? styles.pillTextActive : null]}>{value.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.selectionHint}>
          {range === "day"
            ? "Tap one day for a single-day report. Tap a different second day only if you want a range."
            : range === "month"
              ? "Tap one month for a single-month report. Tap a different second month only if you want a range."
              : "Use previous and next to move between years."}
        </Text>

        {range === "day" ? (
          <DayRangeCalendar
            tone="neutral"
            visibleMonth={visibleDayMonth}
            startDay={selectedDayStart}
            endDay={selectedDayEnd}
            onVisibleMonthChange={setVisibleDayMonth}
            onSelectDay={handleDaySelect}
          />
        ) : range === "month" ? (
          <MonthRangePicker
            tone="neutral"
            visibleYear={visibleMonthYear}
            startMonth={selectedMonthStart}
            endMonth={selectedMonthEnd}
            onVisibleYearChange={setVisibleMonthYear}
            onSelectMonth={handleMonthSelect}
          />
        ) : (
          <View style={styles.yearRow}>
            <ActionButton label="Previous" tone="neutral" variant="secondary" onPress={() => setSelectedYear((value) => shiftYear(value, -1))} buttonStyle={styles.yearNavButton} />
            <Text style={styles.periodLabel}>{selectedYear}</Text>
            <ActionButton label="Next" tone="neutral" variant="secondary" onPress={() => setSelectedYear((value) => shiftYear(value, 1))} buttonStyle={styles.yearNavButton} />
          </View>
        )}

        <ActionButton
          label={range === "day" ? "Reset to today" : range === "month" ? "Reset to this month" : "Reset to this year"}
          tone="neutral"
          variant="ghost"
          onPress={handleReset}
        />
      </Card>

      <View style={styles.statsRow}>
        <StatTile tone="neutral" label={selectedLabel} value={`${total.toFixed(2)}${periodCurrency ? ` ${periodCurrency}` : ""}`} />
        <StatTile tone="neutral" label="Receipts in period" value={`${periodReceipts.length}`} />
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Breakdown</Text>
        {buckets.length === 0 ? (
          <EmptyState tone="neutral" title="No receipts for this period" description="Try another date, month, or year after more receipts have been added." />
        ) : (
          buckets.map((bucket) => (
            <View key={bucket.key} style={styles.bucketRow}>
              <View style={styles.bucketCopy}>
                <Text style={styles.bucketLabel}>{bucket.label}</Text>
                {bucket.subtitle ? <Text style={styles.bucketSubtitle}>{bucket.subtitle}</Text> : null}
              </View>
              <Text style={styles.bucketValue}>
                {bucket.total.toFixed(2)}
                {bucket.currency ? ` ${bucket.currency}` : ""}
              </Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerHintRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  selectionHint: {
    color: theme.colors.mutedText,
    lineHeight: 20,
    fontSize: 13,
  },
  pill: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 84,
  },
  pillActive: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceAlt,
  },
  pillText: {
    color: theme.colors.mutedText,
    fontFamily: theme.typography.fonts.label,
    textAlign: "center",
  },
  pillTextActive: {
    color: theme.colors.text,
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  yearNavButton: {
    minWidth: 94,
  },
  periodLabel: {
    flex: 1,
    textAlign: "center",
    color: theme.colors.text,
    fontSize: 20,
    fontFamily: theme.typography.fonts.title,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.size.section,
    fontFamily: theme.typography.fonts.title,
  },
  bucketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 12,
  },
  bucketCopy: {
    flex: 1,
    gap: 3,
  },
  bucketLabel: {
    color: theme.colors.text,
    fontFamily: theme.typography.fonts.title,
  },
  bucketSubtitle: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  bucketValue: {
    color: theme.colors.text,
    fontFamily: theme.typography.fonts.heading,
  },
});
