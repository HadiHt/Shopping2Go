import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Switch, Text, View } from "react-native";

import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen } from "@/components/layout/Screen";
import { ShoppingItemRow } from "@/components/lists/ShoppingItemRow";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { addListItem, buildOngoingListId, searchProducts, subscribeListItems, toggleListItem } from "@/services/firestore";
import type { ProductSnapshot, ShoppingItem } from "@/types/models";
import { getErrorMessage } from "@/utils/errors";

export default function AnytimeListScreen() {
  const { activeHouseholdId, user } = useSession();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSnapshot[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSnapshot | null>(null);
  const [busy, setBusy] = useState<"save" | "search" | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const listId = useMemo(() => (activeHouseholdId ? buildOngoingListId(activeHouseholdId) : null), [activeHouseholdId]);

  useEffect(() => {
    if (!listId) {
      return;
    }

    return subscribeListItems(listId, setItems);
  }, [listId]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setStatus({ tone: "error", message: "Enter a product name before searching." });
      return;
    }

    try {
      setBusy("search");
      setStatus({ tone: "info", message: "Searching public catalog..." });
      const results = await searchProducts(searchTerm);
      setSearchResults(results);
      setStatus({
        tone: results.length > 0 ? "success" : "info",
        message: results.length > 0 ? `Found ${results.length} product matches.` : "No products were found for that search.",
      });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Product search is unavailable right now.") });
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    if (!activeHouseholdId || !listId || !user || !title.trim()) {
      setStatus({ tone: "error", message: "Choose a household and enter an item name before adding to the list." });
      return;
    }

    try {
      setBusy("save");
      setStatus({ tone: "info", message: "Adding item to the anytime list..." });
      await addListItem({
        householdId: activeHouseholdId,
        listId,
        title,
        note,
        quantity,
        userId: user.uid,
        addToTemplate: repeatMonthly,
        productSnapshot: selectedProduct,
      });
      setTitle("");
      setQuantity("");
      setNote("");
      setRepeatMonthly(false);
      setSelectedProduct(null);
      setSearchResults([]);
      setSearchTerm("");
      setStatus({ tone: "success", message: "Item added to the anytime list." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not add item. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Anytime shopping list</Text>
        <Text style={styles.copy}>Keep a running list for anything the household needs beyond the monthly plan.</Text>
      </Card>

      <Card>
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <Text style={styles.sectionTitle}>Import from a public product source</Text>
        <TextField
          label="Search public catalog"
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Milk, pasta, toothpaste..."
          helperText="Use your Render product-search backend for reliable web results. Without it, some public sources may block direct browser requests."
        />
        <ActionButton label="Search products" variant="secondary" onPress={handleSearch} loading={busy === "search"} />
        {searchResults.map((product) => (
          <View key={`${product.sourceName}-${product.sourceProductId}-${product.title}`} style={styles.productRow}>
            {product.imageUrl ? (
              <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <View style={styles.productImageFallback}>
                <Text style={styles.productImageFallbackText}>No image</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.productTitle}>{product.title}</Text>
              <Text style={styles.meta}>
                {product.brand || "No brand"} | {product.sourceName}
              </Text>
            </View>
            <ActionButton
              label={selectedProduct?.sourceProductId === product.sourceProductId ? "Selected" : "Use"}
              variant={selectedProduct?.sourceProductId === product.sourceProductId ? "secondary" : "ghost"}
              onPress={() => {
                setSelectedProduct(product);
                setTitle(product.title);
                setNote((previous) => previous || product.brand || "");
                setStatus({ tone: "success", message: "Product selected. You can now add it to your list." });
              }}
            />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Add an item</Text>
        <TextField label="Item name" value={title} onChangeText={setTitle} placeholder="Coffee beans" />
        <TextField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="2 bags" />
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Ground, medium roast" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.switchLabel}>Repeat monthly</Text>
            <Text style={styles.meta}>Add this item to the recurring template for future month lists.</Text>
          </View>
          <Switch value={repeatMonthly} onValueChange={setRepeatMonthly} />
        </View>
        <ActionButton label="Add to anytime list" onPress={handleAdd} loading={busy === "save"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Current items</Text>
        {items.length === 0 ? (
          <Text style={styles.meta}>No items yet. Add something you want the household to buy next.</Text>
        ) : (
          items.map((item) => <ShoppingItemRow key={item.id} item={item} onToggle={(value) => toggleListItem(item.id, value)} />)
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  switchRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  switchLabel: {
    fontWeight: "700",
    color: theme.colors.text,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  productRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  productImage: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  productImageFallback: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  productImageFallbackText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  productTitle: {
    color: theme.colors.text,
    fontWeight: "700",
  },
});
