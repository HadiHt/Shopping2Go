import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

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
  tone?: AccentTone;
};

export function SelectField({ label, value, onValueChange, options, helperText, tone = "neutral" }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const accent = getAccentColors(tone);

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? options[0], [options, value]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dropdownWrap}>
        <Pressable
          style={({ pressed }) => [
            styles.trigger,
            {
              borderColor: open ? accent.solid : tone === "neutral" ? theme.colors.border : accent.softBorder,
            },
            pressed ? styles.triggerPressed : null,
            open ? styles.triggerOpen : null,
          ]}
          onPress={() => setOpen((current) => !current)}
        >
          <Text style={styles.triggerText}>{selectedOption?.label ?? "Select an option"}</Text>
          <Text style={[styles.chevron, { color: accent.solid }]}>{open ? "▲" : "▼"}</Text>
        </Pressable>

        {open ? (
          <View style={[styles.menu, { borderColor: accent.solid }]}>
            <ScrollView nestedScrollEnabled style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <Pressable
                    key={`${option.value}-${option.label}`}
                    style={({ pressed }) => [
                      styles.option,
                      selected ? { backgroundColor: accent.soft } : null,
                      pressed ? styles.optionPressed : null,
                    ]}
                    onPress={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, selected ? { color: accent.solid, fontFamily: theme.typography.fonts.label } : null]}>
                      {option.label}
                    </Text>
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
    fontSize: 14,
    fontFamily: theme.typography.fonts.label,
  },
  dropdownWrap: {
    position: "relative",
    zIndex: 20,
  },
  trigger: {
    minHeight: theme.components.inputHeight,
    borderWidth: 1,
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  triggerPressed: {
    opacity: 0.9,
  },
  triggerOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  triggerText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.size.body,
  },
  chevron: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  menu: {
    borderWidth: 1,
    borderTopWidth: 0,
    backgroundColor: theme.colors.surfaceStrong,
    borderBottomLeftRadius: theme.radius.sm,
    borderBottomRightRadius: theme.radius.sm,
    maxHeight: 240,
    overflow: "hidden",
    ...theme.shadow.card,
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
  optionPressed: {
    opacity: 0.88,
  },
  optionText: {
    color: theme.colors.text,
    fontSize: theme.typography.size.body,
  },
  helper: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.helper,
    lineHeight: 18,
  },
});
