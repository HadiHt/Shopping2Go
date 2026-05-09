import { StyleSheet, Text, View } from "react-native";

import { theme } from "@/lib/theme";

type StatTileProps = {
  label: string;
  value: string;
};

export function StatTile({ label, value }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.md,
    padding: 16,
    gap: 8,
  },
  label: {
    color: theme.colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: "800",
  },
});
