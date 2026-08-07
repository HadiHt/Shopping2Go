import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";
import type { ShoppingItem } from "@/types/models";
import { formatAutoRemoveCountdown } from "@/utils/listItems";

type ShoppingItemRowProps = {
  item: ShoppingItem;
  onToggle: (nextValue: boolean) => void;
  onRemove: () => void;
  tone?: AccentTone;
  density?: "compact" | "comfortable";
  autoRemoveAt?: number | null;
};

export function ShoppingItemRow({
  item,
  onToggle,
  onRemove,
  tone = "neutral",
  density = "comfortable",
  autoRemoveAt = null,
}: ShoppingItemRowProps) {
  const accent = getAccentColors(tone);
  const compact = density === "compact";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!item.bought || autoRemoveAt === null) {
      return;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);

    setNow(Date.now());

    return () => {
      clearInterval(intervalId);
    };
  }, [autoRemoveAt, item.bought]);

  const autoRemoveLabel =
    item.bought && autoRemoveAt !== null ? `Auto-removes in ${formatAutoRemoveCountdown(autoRemoveAt, now)}` : null;

  return (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      <Pressable style={styles.toggleArea} onPress={() => onToggle(!item.bought)}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: accent.solid,
              backgroundColor: item.bought ? accent.solid : theme.colors.surfaceStrong,
            },
          ]}
        />
        <View style={styles.copy}>
          <Text style={[styles.title, item.bought ? styles.crossed : null]}>{item.title}</Text>
          {item.pendingSync ? <Text style={[styles.pending, { color: accent.solid }]}>Saved locally. Waiting for internet.</Text> : null}
          {autoRemoveLabel ? <Text style={[styles.pending, { color: accent.solid }]}>{autoRemoveLabel}</Text> : null}
          {item.quantity ? <Text style={styles.meta}>Qty: {item.quantity}</Text> : null}
          {item.storeName ? <Text style={styles.meta}>Store: {item.storeName}</Text> : null}
          {!compact && item.note ? <Text style={styles.meta}>{item.note}</Text> : null}
          {item.productSnapshot?.sourceName ? (
            <Text style={[styles.source, { color: accent.solid }]}>
              Imported from {item.productSnapshot.sourceName}
              {item.productSnapshot.brand ? ` • ${item.productSnapshot.brand}` : ""}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable hitSlop={8} style={styles.removeButton} onPress={onRemove}>
        <Text style={styles.removeLabel}>Remove</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowCompact: {
    paddingVertical: 10,
  },
  toggleArea: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    marginTop: 2,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    color: theme.colors.text,
    fontFamily: theme.typography.fonts.title,
  },
  crossed: {
    textDecorationLine: "line-through",
    color: theme.colors.mutedText,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
  },
  source: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  pending: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  removeButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
    zIndex: 1,
  },
  removeLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
});
