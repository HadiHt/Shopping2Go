import { StyleSheet, Text, View } from "react-native";

import { theme } from "@/lib/theme";

type StatusMessageProps = {
  tone: "success" | "error" | "info";
  message: string;
};

const toneStyles = {
  success: {
    backgroundColor: "#EAF6EF",
    borderColor: "#BADFC7",
    color: theme.colors.success,
  },
  error: {
    backgroundColor: "#FCEEEE",
    borderColor: "#E7B6B6",
    color: theme.colors.danger,
  },
  info: {
    backgroundColor: "#EDF4FA",
    borderColor: "#C5D7E6",
    color: theme.colors.info,
  },
} as const;

export function StatusMessage({ tone, message }: StatusMessageProps) {
  const palette = toneStyles[tone];

  return (
    <View style={[styles.base, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}>
      <Text style={[styles.text, { color: palette.color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: theme.typography.fonts.label,
  },
});
