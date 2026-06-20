import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

type ActionButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  tone?: AccentTone;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  buttonStyle?: StyleProp<ViewStyle>;
};

export function ActionButton({
  label,
  loading,
  tone = "neutral",
  variant = "primary",
  disabled,
  buttonStyle,
  style,
  ...props
}: ActionButtonProps) {
  const blocked = disabled || loading;
  const accent = getAccentColors(tone);
  const buttonStyles = getButtonStyles(variant, accent);
  const indicatorColor = variant === "primary" || variant === "danger" ? "#ffffff" : accent.solid;

  return (
    <Pressable
      {...props}
      disabled={blocked}
      style={(state) => [
        styles.base,
        buttonStyles.button,
        state.pressed && !blocked ? styles.pressed : null,
        blocked ? styles.blocked : null,
        buttonStyle,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {loading ? <ActivityIndicator color={indicatorColor} /> : <Text style={[styles.label, buttonStyles.label]}>{label}</Text>}
    </Pressable>
  );
}

function getButtonStyles(variant: ActionButtonProps["variant"], accent: ReturnType<typeof getAccentColors>) {
  if (variant === "danger") {
    return {
      button: {
        backgroundColor: theme.colors.danger,
        borderColor: theme.colors.danger,
      },
      label: {
        color: "#ffffff",
      },
    };
  }

  if (variant === "secondary") {
    return {
      button: {
        backgroundColor: accent.soft,
        borderColor: accent.softBorder,
      },
      label: {
        color: accent.solid,
      },
    };
  }

  if (variant === "ghost") {
    return {
      button: {
        backgroundColor: theme.colors.surfaceStrong,
        borderColor: theme.colors.border,
      },
      label: {
        color: theme.colors.text,
      },
    };
  }

  return {
    button: {
      backgroundColor: accent.solid,
      borderColor: accent.solid,
    },
    label: {
      color: accent.contrast,
    },
  };
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.components.buttonHeight,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 15,
    textAlign: "center",
    fontFamily: theme.typography.fonts.action,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  blocked: {
    opacity: 0.55,
  },
});
