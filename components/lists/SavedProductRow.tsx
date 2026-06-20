import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";
import type { SavedProduct } from "@/types/models";

type SavedProductRowProps = {
  product: SavedProduct;
  onUse: () => void;
  onDelete: () => void;
  tone?: AccentTone;
  density?: "compact" | "comfortable";
};

export function SavedProductRow({ product, onUse, onDelete, tone = "neutral", density = "comfortable" }: SavedProductRowProps) {
  const accent = getAccentColors(tone);
  const compact = density === "compact";
  const metaParts = [
    product.quantity ? `Qty: ${product.quantity}` : "",
    product.storeName ? `Store: ${product.storeName}` : "",
    product.brand ? product.brand : "",
    product.sourceName,
  ].filter(Boolean);
  const fallbackLabel = product.title.trim().charAt(0).toUpperCase() || "?";

  return (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      <View style={styles.useArea}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imageFallback, { backgroundColor: accent.soft, borderColor: accent.softBorder }]}>
            <Text style={[styles.imageFallbackText, { color: accent.solid }]}>{fallbackLabel}</Text>
          </View>
        )}
        <View style={styles.copy}>
          <Text style={styles.title}>{product.title}</Text>
          {product.pendingSync ? <Text style={[styles.pending, { color: accent.solid }]}>Saved locally. Waiting for internet.</Text> : null}
          {metaParts.length ? <Text style={styles.meta}>{metaParts.join(" • ")}</Text> : null}
          {!compact && product.note ? <Text style={styles.meta}>{product.note}</Text> : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable hitSlop={8} style={[styles.useButton, { backgroundColor: accent.soft, borderColor: accent.softBorder }]} onPress={onUse}>
          <Text style={[styles.useLabel, { color: accent.solid }]}>Add</Text>
        </Pressable>
        <Pressable hitSlop={8} style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteLabel}>Delete</Text>
        </Pressable>
      </View>
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
  useArea: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  image: {
    width: 58,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  imageFallback: {
    width: 58,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  imageFallbackText: {
    fontSize: 18,
    fontFamily: theme.typography.fonts.title,
    textAlign: "center",
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fonts.title,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
  },
  pending: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  actions: {
    gap: 8,
    minWidth: 78,
    zIndex: 1,
  },
  useButton: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  useLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  deleteLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
});
