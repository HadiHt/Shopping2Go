import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "@/lib/theme";
import type { ShoppingItem } from "@/types/models";

type ShoppingItemRowProps = {
  item: ShoppingItem;
  onToggle: (nextValue: boolean) => void;
};

export function ShoppingItemRow({ item, onToggle }: ShoppingItemRowProps) {
  return (
    <Pressable style={styles.row} onPress={() => onToggle(!item.bought)}>
      <View style={[styles.checkbox, item.bought && styles.checked]} />
      <View style={styles.copy}>
        <Text style={[styles.title, item.bought && styles.crossed]}>{item.title}</Text>
        {item.quantity ? <Text style={styles.meta}>Qty: {item.quantity}</Text> : null}
        {item.note ? <Text style={styles.meta}>{item.note}</Text> : null}
        {item.productSnapshot?.sourceName ? (
          <Text style={styles.source}>
            Imported from {item.productSnapshot.sourceName}
            {item.productSnapshot.brand ? ` · ${item.productSnapshot.brand}` : ""}
          </Text>
        ) : null}
      </View>
    </Pressable>
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    marginTop: 2,
  },
  checked: {
    backgroundColor: theme.colors.primary,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  crossed: {
    textDecorationLine: "line-through",
    color: theme.colors.mutedText,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  source: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
});
