import { Pressable, StyleSheet, Text, View } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

type MonthRangePickerProps = {
  visibleYear: string;
  startMonth: string;
  endMonth: string | null;
  onVisibleYearChange: (yearKey: string) => void;
  onSelectMonth: (monthKey: string) => void;
  tone?: AccentTone;
};

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function compareKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function normalizeRange(startMonth: string, endMonth: string | null) {
  if (!endMonth || compareKeys(startMonth, endMonth) <= 0) {
    return { from: startMonth, to: endMonth ?? startMonth };
  }

  return { from: endMonth, to: startMonth };
}

export function MonthRangePicker({
  visibleYear,
  startMonth,
  endMonth,
  onVisibleYearChange,
  onSelectMonth,
  tone = "neutral",
}: MonthRangePickerProps) {
  const normalizedRange = normalizeRange(startMonth, endMonth);
  const accent = getAccentColors(tone);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Pressable style={styles.navButton} onPress={() => onVisibleYearChange(`${Number(visibleYear) - 1}`)}>
          <Text style={[styles.navText, { color: accent.solid }]}>Previous year</Text>
        </Pressable>
        <Text style={styles.headerLabel}>{visibleYear}</Text>
        <Pressable style={styles.navButton} onPress={() => onVisibleYearChange(`${Number(visibleYear) + 1}`)}>
          <Text style={[styles.navText, { color: accent.solid }]}>Next year</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {monthLabels.map((label, index) => {
          const monthKey = `${visibleYear}-${`${index + 1}`.padStart(2, "0")}`;
          const inRange = compareKeys(monthKey, normalizedRange.from) >= 0 && compareKeys(monthKey, normalizedRange.to) <= 0;
          const isSingleSelection = !endMonth && monthKey === startMonth;
          const isStart = monthKey === normalizedRange.from;
          const isEnd = monthKey === normalizedRange.to;
          const isEdge = isStart || isEnd;

          return (
            <Pressable
              key={monthKey}
              style={[
                styles.monthCell,
                {
                  backgroundColor: theme.colors.surfaceStrong,
                  borderColor: theme.colors.border,
                },
                inRange ? { backgroundColor: accent.soft, borderColor: accent.softBorder } : null,
                isSingleSelection || isStart || isEnd ? { backgroundColor: accent.solid, borderColor: accent.solid } : null,
              ]}
              onPress={() => onSelectMonth(monthKey)}
            >
              <Text style={[styles.monthText, inRange ? { color: accent.solid } : null, isEdge ? styles.monthTextSelected : null]}>{label}</Text>
              {isSingleSelection ? <Text style={styles.edgeLabel}>Selected</Text> : null}
              {isStart && !isSingleSelection ? <Text style={styles.edgeLabel}>Start</Text> : null}
              {isEnd && !isStart ? <Text style={styles.edgeLabel}>End</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  navButton: {
    paddingVertical: 8,
  },
  navText: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
  headerLabel: {
    flex: 1,
    textAlign: "center",
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: theme.typography.fonts.title,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  monthCell: {
    width: "31%",
    minHeight: 56,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  monthText: {
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.fonts.label,
  },
  monthTextSelected: {
    color: "#ffffff",
  },
  edgeLabel: {
    position: "absolute",
    bottom: 5,
    fontSize: 9,
    fontFamily: theme.typography.fonts.label,
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
