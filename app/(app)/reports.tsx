import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Screen } from "@/components/layout/Screen";
import { StatTile } from "@/components/reports/StatTile";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { subscribeReceipts } from "@/services/firestore";
import type { ReceiptEntry, SpendingRange } from "@/types/models";
import { aggregateSpending } from "@/utils/date";

const ranges: SpendingRange[] = ["day", "month", "year"];

export default function ReportsScreen() {
  const { activeHouseholdId } = useSession();
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [range, setRange] = useState<SpendingRange>("month");

  useEffect(() => {
    if (!activeHouseholdId) {
      return;
    }

    return subscribeReceipts(activeHouseholdId, setReceipts);
  }, [activeHouseholdId]);

  const buckets = useMemo(() => aggregateSpending(receipts, range), [range, receipts]);
  const total = useMemo(() => receipts.reduce((sum, receipt) => sum + receipt.total, 0), [receipts]);
  const latest = buckets.at(-1);

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Spending reports</Text>
        <Text style={styles.copy}>Review shopping totals by day, month, or year based on saved receipts.</Text>
        <View style={styles.filterRow}>
          {ranges.map((value) => (
            <Pressable key={value} onPress={() => setRange(value)} style={[styles.pill, range === value && styles.pillActive]}>
              <Text style={[styles.pillText, range === value && styles.pillTextActive]}>{value.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.statsRow}>
        <StatTile label="All receipts" value={total.toFixed(2)} />
        <StatTile label={`Latest ${range}`} value={latest ? latest.total.toFixed(2) : "0.00"} />
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Breakdown</Text>
        {buckets.length === 0 ? (
          <Text style={styles.meta}>Add receipts first. The report will start grouping totals here automatically.</Text>
        ) : (
          buckets.map((bucket) => (
            <View key={bucket.key} style={styles.bucketRow}>
              <Text style={styles.bucketLabel}>{bucket.label}</Text>
              <Text style={styles.bucketValue}>{bucket.total.toFixed(2)}</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
  },
  pill: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  pillText: {
    fontWeight: "700",
    color: theme.colors.mutedText,
  },
  pillTextActive: {
    color: theme.colors.primary,
  },
  statsRow: {
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  bucketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  bucketLabel: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  bucketValue: {
    color: theme.colors.primary,
    fontWeight: "800",
  },
});
