import { StyleSheet, Text, View } from "react-native";

import { theme } from "@/lib/theme";

type StatusMessageProps = {
  tone: "success" | "error" | "info";
  message: string;
};

export function StatusMessage({ tone, message }: StatusMessageProps) {
  return (
    <View style={[styles.base, tone === "success" ? styles.success : tone === "error" ? styles.error : styles.info]}>
      <Text style={[styles.text, tone === "success" ? styles.successText : tone === "error" ? styles.errorText : styles.infoText]}>
        {message}
      </Text>
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
  success: {
    backgroundColor: "#e6f5ec",
    borderColor: "#9fd0b0",
  },
  error: {
    backgroundColor: "#fbe9e9",
    borderColor: "#e2a4a4",
  },
  info: {
    backgroundColor: "#edf5fb",
    borderColor: "#b7d1e6",
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  successText: {
    color: theme.colors.success,
  },
  errorText: {
    color: theme.colors.danger,
  },
  infoText: {
    color: "#285a80",
  },
});
