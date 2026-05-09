import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { theme } from "@/lib/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  helperText?: string;
};

export function TextField({ label, helperText, ...props }: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={theme.colors.mutedText} style={styles.input} {...props} />
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  helper: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
});
