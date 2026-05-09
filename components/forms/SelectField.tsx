import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { theme } from "@/lib/theme";

type SelectOption = {
  label: string;
  value: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  helperText?: string;
};

export function SelectField({ label, value, onValueChange, options, helperText }: SelectFieldProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dropdownWrap}>
        <Pressable style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed, open && styles.triggerOpen]} onPress={() => setOpen((current) => !current)}>
          <Text style={styles.triggerText}>{selectedOption?.label ?? "Select an option"}</Text>
          <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
        </Pressable>

        {open ? (
          <View style={styles.menu}>
            <ScrollView nestedScrollEnabled style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <Pressable
                    key={`${option.value}-${option.label}`}
                    style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.optionPressed]}
                    onPress={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
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
  dropdownWrap: {
    position: "relative",
    zIndex: 20,
  },
  trigger: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  triggerPressed: {
    opacity: 0.9,
  },
  triggerOpen: {
    borderColor: theme.colors.primary,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  triggerText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  chevron: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  menu: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceStrong,
    borderBottomLeftRadius: theme.radius.sm,
    borderBottomRightRadius: theme.radius.sm,
    maxHeight: 240,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  scroll: {
    maxHeight: 240,
  },
  scrollContent: {
    paddingVertical: 4,
  },
  option: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  optionPressed: {
    opacity: 0.88,
  },
  optionText: {
    color: theme.colors.text,
    fontSize: 15,
  },
  optionTextSelected: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  helper: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
});
