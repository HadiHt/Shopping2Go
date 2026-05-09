import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import { theme } from "@/lib/theme";

type ActionButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export function ActionButton({ label, loading, variant = "primary", disabled, ...props }: ActionButtonProps) {
  const blocked = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={blocked}
      style={({ pressed }) => [styles.base, styles[variant], pressed && !blocked ? styles.pressed : null, blocked ? styles.blocked : null]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#ffffff" : theme.colors.primary} />
      ) : (
        <Text style={[styles.label, variant === "primary" ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primarySoft,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: theme.colors.border,
  },
  label: {
    fontWeight: "700",
    fontSize: 15,
  },
  primaryLabel: {
    color: "#ffffff",
  },
  secondaryLabel: {
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.88,
  },
  blocked: {
    opacity: 0.55,
  },
});
