import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  helperText?: string;
  errorText?: string;
  hasError?: boolean;
  required?: boolean;
  tone?: AccentTone;
};

export function TextField({
  label,
  helperText,
  errorText,
  hasError = false,
  required = false,
  tone = "neutral",
  ...props
}: TextFieldProps) {
  const accent = getAccentColors(tone);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, hasError ? styles.labelError : null]}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        placeholderTextColor={theme.colors.mutedText}
        style={[
          styles.input,
          {
            borderColor: hasError ? theme.colors.danger : tone === "neutral" ? theme.colors.border : accent.softBorder,
            backgroundColor: hasError ? "#FFF1F1" : theme.colors.surfaceStrong,
          },
        ]}
        {...props}
      />
      {errorText ? <Text style={styles.error}>{errorText}</Text> : helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.typography.fonts.label,
  },
  labelError: {
    color: theme.colors.danger,
  },
  input: {
    minHeight: theme.components.inputHeight,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: theme.typography.size.body,
    color: theme.colors.text,
  },
  helper: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.helper,
    lineHeight: 18,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.size.helper,
    fontFamily: theme.typography.fonts.label,
  },
});
