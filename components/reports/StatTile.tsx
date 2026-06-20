import { StyleSheet, Text, View } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

type StatTileProps = {
  label: string;
  value: string;
  tone?: AccentTone;
};

export function StatTile({ label, value, tone = "neutral" }: StatTileProps) {
  const accent = getAccentColors(tone);

  return (
    <View style={[styles.tile, { backgroundColor: accent.soft, borderColor: accent.softBorder }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accent.solid }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 140,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  label: {
    color: theme.colors.mutedText,
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
  value: {
    fontSize: 24,
    fontFamily: theme.typography.fonts.heading,
  },
});
