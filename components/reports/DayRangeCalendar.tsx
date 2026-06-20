import { Pressable, StyleSheet, Text, View } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";
import { formatMonthLabel, monthKeyFromDate } from "@/utils/date";

type CalendarDay = {
  key: string;
  dayNumber: number;
  inVisibleMonth: boolean;
};

type DayRangeCalendarProps = {
  visibleMonth: string;
  startDay: string;
  endDay: string | null;
  onVisibleMonthChange: (monthKey: string) => void;
  onSelectDay: (dayKey: string) => void;
  tone?: AccentTone;
};

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftVisibleMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  return monthKeyFromDate(new Date(year, month - 1 + delta, 1));
}

function compareKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function normalizeRange(startDay: string, endDay: string | null) {
  if (!endDay || compareKeys(startDay, endDay) <= 0) {
    return { from: startDay, to: endDay ?? startDay };
  }

  return { from: endDay, to: startDay };
}

function buildCalendarDays(visibleMonth: string): CalendarDay[] {
  const [year, month] = visibleMonth.split("-").map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(year, month - 1, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      key: `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`,
      dayNumber: date.getDate(),
      inVisibleMonth: date.getMonth() === month - 1,
    };
  });
}

export function DayRangeCalendar({
  visibleMonth,
  startDay,
  endDay,
  onVisibleMonthChange,
  onSelectDay,
  tone = "neutral",
}: DayRangeCalendarProps) {
  const days = buildCalendarDays(visibleMonth);
  const normalizedRange = normalizeRange(startDay, endDay);
  const accent = getAccentColors(tone);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Pressable style={styles.navButton} onPress={() => onVisibleMonthChange(shiftVisibleMonth(visibleMonth, -1))}>
          <Text style={[styles.navText, { color: accent.solid }]}>Previous month</Text>
        </Pressable>
        <Text style={styles.headerLabel}>{formatMonthLabel(visibleMonth)}</Text>
        <Pressable style={styles.navButton} onPress={() => onVisibleMonthChange(shiftVisibleMonth(visibleMonth, 1))}>
          <Text style={[styles.navText, { color: accent.solid }]}>Next month</Text>
        </Pressable>
      </View>

      <View style={styles.weekdaysRow}>
        {weekdayLabels.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={styles.weekdayLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const inRange = compareKeys(day.key, normalizedRange.from) >= 0 && compareKeys(day.key, normalizedRange.to) <= 0;
          const isSingleSelection = !endDay && day.key === startDay;
          const isStart = day.key === normalizedRange.from;
          const isEnd = day.key === normalizedRange.to;
          const isEdge = isStart || isEnd;

          return (
            <Pressable
              key={day.key}
              style={[
                styles.dayCell,
                {
                  backgroundColor: theme.colors.surfaceStrong,
                  borderColor: theme.colors.border,
                },
                inRange ? { backgroundColor: accent.soft, borderColor: accent.softBorder } : null,
                isSingleSelection || isStart || isEnd ? { backgroundColor: accent.solid, borderColor: accent.solid } : null,
              ]}
              onPress={() => onSelectDay(day.key)}
            >
              <Text
                style={[
                  styles.dayText,
                  !day.inVisibleMonth ? styles.dayTextMuted : null,
                  inRange ? { color: accent.solid } : null,
                  isEdge ? styles.dayTextSelected : null,
                ]}
              >
                {day.dayNumber}
              </Text>
              {isSingleSelection || isStart || isEnd ? (
                <View
                  style={[
                    styles.selectionDot,
                    {
                      backgroundColor: isEdge ? "#ffffff" : accent.solid,
                    },
                  ]}
                />
              ) : null}
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
  weekdaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekdayCell: {
    width: "14.2857%",
    alignItems: "center",
  },
  weekdayLabel: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
    justifyContent: "space-between",
  },
  dayCell: {
    width: "14.2857%",
    minHeight: 50,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    color: theme.colors.text,
    fontFamily: theme.typography.fonts.label,
  },
  dayTextMuted: {
    color: theme.colors.mutedText,
    opacity: 0.55,
  },
  dayTextSelected: {
    color: "#ffffff",
  },
  selectionDot: {
    position: "absolute",
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 999,
  },
});
