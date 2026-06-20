import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { InfoHint } from "@/components/feedback/InfoHint";
import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { TextField } from "@/components/forms/TextField";
import { Card, EmptyState, ModeBadge, Screen, ScreenHeader, SectionCard } from "@/components/layout/Screen";
import { SavedProductRow } from "@/components/lists/SavedProductRow";
import { ShoppingItemRow } from "@/components/lists/ShoppingItemRow";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useSession } from "@/hooks/useSession";
import { showNotice } from "@/lib/notify";
import { getAccentColors, theme } from "@/lib/theme";
import {
  addListItem,
  buildOngoingListId,
  deleteListItem,
  deleteSavedProduct,
  ensureOngoingList,
  saveSavedProduct,
  searchProductByBarcode,
  searchProducts,
  subscribeListItems,
  subscribeSavedProducts,
  toggleListItem,
  untickAllListItems,
  updateListItem,
} from "@/services/firestore";
import type { ProductSnapshot, SavedProduct, ShoppingItem } from "@/types/models";
import { buildSavedProductSnapshot, findMergeableListItem, parseQuantityValue } from "@/utils/listItems";
import { getErrorMessage } from "@/utils/errors";

function deriveStoreName(product: ProductSnapshot) {
  if (product.storeName?.trim()) {
    return product.storeName.trim();
  }

  const sourceName = product.sourceName.trim();
  const genericSources = new Set(["Open Food Facts", "Open Food Facts (Barcode)", "USDA FoodData Central"]);
  return genericSources.has(sourceName) ? "" : sourceName;
}

function comparableTime(value: unknown) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  return 0;
}

function sortItemsForDisplay(items: ShoppingItem[]) {
  return items.slice().sort((left, right) => {
    if (left.bought !== right.bought) {
      return left.bought ? 1 : -1;
    }

    return comparableTime(left.createdAt) - comparableTime(right.createdAt);
  });
}

function sortItemsWithLocal(currentItems: ShoppingItem[], nextItem: ShoppingItem) {
  const mergedItems = [...currentItems.filter((item) => item.id !== nextItem.id), nextItem];
  return sortItemsForDisplay(mergedItems);
}

function sortSavedProductsWithLocal(currentProducts: SavedProduct[], nextProduct: SavedProduct) {
  const mergedProducts = [...currentProducts.filter((product) => product.id !== nextProduct.id), nextProduct];
  return mergedProducts.sort(
    (left, right) => comparableTime(right.updatedAt ?? right.createdAt) - comparableTime(left.updatedAt ?? left.createdAt),
  );
}

export default function AnytimeListScreen() {
  const { activeHouseholdId, user } = useSession();
  const { isOnline } = useConnectivity();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [storeName, setStoreName] = useState("");
  const [note, setNote] = useState("");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcode, setBarcode] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSnapshot[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSnapshot | null>(null);
  const [busy, setBusy] = useState<"save" | "search" | "barcode" | "clear" | "stash" | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [removingSavedProductId, setRemovingSavedProductId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const [savedLoadStatus, setSavedLoadStatus] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showQuickAddDetails, setShowQuickAddDetails] = useState(false);
  const anytimeAccent = getAccentColors("anytime");

  const listId = useMemo(() => (activeHouseholdId ? buildOngoingListId(activeHouseholdId) : null), [activeHouseholdId]);

  useEffect(() => {
    if (!activeHouseholdId || !listId) {
      setItems([]);
      setLoadStatus(null);
      return;
    }

    ensureOngoingList(activeHouseholdId).catch((error) => {
      setLoadStatus(getErrorMessage(error, "The anytime list could not be prepared."));
    });

    return subscribeListItems(
      activeHouseholdId,
      listId,
      (nextItems) => {
        setLoadStatus(null);
        setItems(sortItemsForDisplay(nextItems));
      },
      (error) => {
        setLoadStatus(getErrorMessage(error, "The anytime list could not be loaded from Firestore."));
      },
    );
  }, [activeHouseholdId, listId]);

  useEffect(() => {
    if (!activeHouseholdId) {
      setSavedProducts([]);
      setSavedLoadStatus(null);
      return;
    }

    return subscribeSavedProducts(
      activeHouseholdId,
      (nextProducts) => {
        setSavedLoadStatus(null);
        setSavedProducts(nextProducts);
      },
      (error) => {
        setSavedLoadStatus(getErrorMessage(error, "Saved products could not be loaded right now."));
      },
    );
  }, [activeHouseholdId]);

  const resetForm = () => {
    setTitle("");
    setQuantity("1");
    setNote("");
    setRepeatMonthly(false);
    setSelectedProduct(null);
    setSearchResults([]);
    setSearchTerm("");
    setBarcode("");
    setShowValidation(false);
  };

  const upsertListItemOnList = async (input: {
    title: string;
    quantity: number;
    storeName?: string;
    note?: string;
    productSnapshot?: ProductSnapshot | null;
    addToTemplate?: boolean;
  }) => {
    if (!activeHouseholdId || !listId || !user) {
      throw new Error("Choose a household before adding to the list.");
    }

    const normalizedTitle = input.title.trim();
    const normalizedStoreName = input.storeName?.trim() ?? "";
    const normalizedNote = input.note?.trim() ?? "";
    const productSnapshot = input.productSnapshot ?? null;
    const existingItem = findMergeableListItem(items, {
      title: normalizedTitle,
      productSnapshot,
    });

    if (existingItem) {
      const nextQuantity = parseQuantityValue(existingItem.quantity) + input.quantity;
      const result = await updateListItem(
        existingItem,
        {
          quantity: nextQuantity,
          storeName: existingItem.storeName?.trim() || normalizedStoreName,
          note: existingItem.note?.trim() || normalizedNote,
          productSnapshot: existingItem.productSnapshot ?? productSnapshot,
        },
        !isOnline,
      );

      setItems((currentItems) => sortItemsWithLocal(currentItems, result.item));
      setLoadStatus(null);
      return {
        mode: "merged" as const,
        item: result.item,
        pendingSync: result.pendingSync,
        quantity: nextQuantity,
      };
    }

    const createdItem = await addListItem({
      householdId: activeHouseholdId,
      listId,
      title: normalizedTitle,
      note: normalizedNote,
      quantity: input.quantity,
      storeName: normalizedStoreName,
      userId: user.uid,
      addToTemplate: input.addToTemplate,
      productSnapshot,
      ensureList: "ongoing",
      preferOffline: !isOnline,
    });

    setItems((currentItems) => sortItemsWithLocal(currentItems, createdItem));
    setLoadStatus(null);
    return {
      mode: "created" as const,
      item: createdItem,
      pendingSync: createdItem.pendingSync ?? false,
      quantity: input.quantity,
    };
  };

  const handleSearch = async () => {
    if (!isOnline) {
      showNotice("Public product import is unavailable offline. Reconnect to search again.", "info");
      return;
    }

    if (!searchTerm.trim()) {
      showNotice("Enter a product name before searching.", "error");
      return;
    }

    try {
      setBusy("search");
      const results = await searchProducts(searchTerm);
      setSearchResults(results);
      showNotice(results.length > 0 ? `Found ${results.length} product matches.` : "No products were found for that search.", results.length > 0 ? "success" : "info");
    } catch (error) {
      showNotice(getErrorMessage(error, "Product search is unavailable right now."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    if (busy === "save") {
      return;
    }

    const normalizedTitle = title.trim();
    const normalizedStoreName = storeName.trim();
    const normalizedQuantity = quantity.trim();
    setShowValidation(true);

    if (!activeHouseholdId || !listId || !user) {
      showNotice("Choose a household before adding to the list.", "error");
      return;
    }

    if (!normalizedTitle || !normalizedStoreName || !normalizedQuantity) {
      showNotice("Fill in item name, quantity, and store before adding to the list.", "error");
      return;
    }

    const parsedQuantity = Number(normalizedQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      showNotice("Quantity must be a number greater than 0.", "error");
      return;
    }

    try {
      setBusy("save");
      const result = await upsertListItemOnList({
        title: normalizedTitle,
        quantity: parsedQuantity,
        storeName: normalizedStoreName,
        note,
        productSnapshot: selectedProduct,
        addToTemplate: repeatMonthly,
      });
      resetForm();
      showNotice(
        result.pendingSync
          ? result.mode === "merged"
            ? `${result.item.title} was updated locally and will sync once you reconnect.`
            : "Item saved locally. It will sync to the household once you are online again."
          : result.mode === "merged"
            ? `${result.item.title} quantity is now ${result.quantity}.`
            : "Item added to the anytime list.",
        result.pendingSync ? "info" : "success",
      );
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not add item. Please try again."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveProduct = async () => {
    const normalizedTitle = title.trim();
    const normalizedStoreName = storeName.trim();
    const normalizedQuantity = quantity.trim();
    setShowValidation(true);

    if (!activeHouseholdId || !user) {
      showNotice("Choose a household before saving a product for later.", "error");
      return;
    }

    if (!normalizedTitle || !normalizedStoreName || !normalizedQuantity) {
      showNotice("Fill in item name, quantity, and store before saving a product.", "error");
      return;
    }

    const parsedQuantity = Number(normalizedQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      showNotice("Quantity must be a number greater than 0.", "error");
      return;
    }

    try {
      setBusy("stash");
      const savedProduct = await saveSavedProduct({
        householdId: activeHouseholdId,
        userId: user.uid,
        title: normalizedTitle,
        note,
        quantity: parsedQuantity,
        storeName: normalizedStoreName,
        productSnapshot: selectedProduct,
      });
      setSavedProducts((currentProducts) => sortSavedProductsWithLocal(currentProducts, savedProduct));
      showNotice(savedProduct.pendingSync ? "Product saved locally. It will sync once the app is back online." : "Product saved for later.", savedProduct.pendingSync ? "info" : "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not save this product right now."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleUseSavedProduct = async (product: SavedProduct) => {
    if (busy === "save") {
      return;
    }

    try {
      setBusy("save");
      const parsedQuantity = Math.max(parseQuantityValue(product.quantity, 1), 1);
      const result = await upsertListItemOnList({
        title: product.title,
        quantity: parsedQuantity,
        storeName: product.storeName ?? "",
        note: product.note ?? "",
        productSnapshot: buildSavedProductSnapshot(product),
      });
      showNotice(
        result.pendingSync
          ? result.mode === "merged"
            ? `${result.item.title} was updated locally and will sync later.`
            : "Saved product added locally. It will sync when you reconnect."
          : result.mode === "merged"
            ? `${result.item.title} quantity is now ${result.quantity}.`
            : "Saved product added to the anytime list.",
        result.pendingSync ? "info" : "success",
      );
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not add the saved product right now."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleBarcodeSearch = async () => {
    if (!isOnline) {
      showNotice("Barcode lookup is unavailable offline. Reconnect to search again.", "info");
      return;
    }

    if (!barcode.trim()) {
      showNotice("Enter a barcode before looking up a product.", "error");
      return;
    }

    try {
      setBusy("barcode");
      const results = await searchProductByBarcode(barcode);
      setSearchResults(results);
      showNotice(results.length > 0 ? `Found ${results.length} barcode match.` : "No product was found for that barcode.", results.length > 0 ? "success" : "info");
    } catch (error) {
      showNotice(getErrorMessage(error, "Barcode lookup is unavailable right now."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (item: ShoppingItem) => {
    try {
      setRemovingItemId(item.id);
      const result = await deleteListItem(item, !isOnline);
      setItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id));
      showNotice(result.pendingSync ? "Item removed locally. The delete will sync when you are back online." : "Item removed from the anytime list.", result.pendingSync ? "info" : "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not remove the item. Please try again."), "error");
    } finally {
      setRemovingItemId(null);
    }
  };

  const handleToggleItem = async (item: ShoppingItem, nextBought: boolean) => {
    const previousItem = item;
    const optimisticItem = {
      ...item,
      bought: nextBought,
      boughtAt: nextBought ? item.boughtAt ?? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    } satisfies ShoppingItem;

    setItems((currentItems) => sortItemsWithLocal(currentItems, optimisticItem));

    try {
      const result = await toggleListItem(item, nextBought, !isOnline);
      setItems((currentItems) => sortItemsWithLocal(currentItems, result.item));
    } catch (error) {
      setItems((currentItems) => sortItemsWithLocal(currentItems, previousItem));
      showNotice(getErrorMessage(error, "Could not update that item right now."), "error");
    }
  };

  const handleUntickAll = async () => {
    if (!activeHouseholdId || !listId) {
      return;
    }

    try {
      setBusy("clear");
      await untickAllListItems(activeHouseholdId, listId);
      showNotice("All items were unticked.", "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not untick all items. Please try again."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteSavedProduct = async (product: SavedProduct) => {
    try {
      setRemovingSavedProductId(product.id);
      const result = await deleteSavedProduct(product);
      setSavedProducts((currentProducts) => currentProducts.filter((currentProduct) => currentProduct.id !== product.id));
      showNotice(result.pendingSync ? "Saved product removed locally. The delete will sync when you are back online." : "Saved product removed.", result.pendingSync ? "info" : "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not remove the saved product. Please try again."), "error");
    } finally {
      setRemovingSavedProductId(null);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        tone="anytime"
        badge="Anytime"
        title="Fast household shopping"
        description="Use this running list for everything the house needs between bigger monthly planning sessions."
      >
        <View style={styles.headerMeta}>
          <ModeBadge tone="anytime">{items.filter((item) => !item.bought).length} open</ModeBadge>
          {!isOnline ? <ModeBadge tone="neutral">Offline</ModeBadge> : null}
        </View>
      </ScreenHeader>

      <SectionCard tone="anytime">
        {!items.length && loadStatus ? <StatusMessage tone="error" message={loadStatus} /> : null}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>Quick add</Text>
            <InfoHint tone="anytime" message="Start with the basics first. Extra details stay tucked away so the list stays fast." />
          </View>
          <Pressable style={[styles.inlineToggle, { borderColor: anytimeAccent.softBorder, backgroundColor: theme.colors.surfaceStrong }]} onPress={() => setShowQuickAddDetails((value) => !value)}>
            <Text style={[styles.inlineToggleText, { color: anytimeAccent.solid }]}>{showQuickAddDetails ? "Less details" : "More details"}</Text>
          </Pressable>
        </View>

        {selectedProduct ? (
          <View style={[styles.selectedProductBanner, { backgroundColor: theme.colors.surfaceStrong, borderColor: anytimeAccent.softBorder }]}>
            <Text style={styles.selectedProductTitle}>Selected import: {selectedProduct.title}</Text>
            <Text style={styles.selectedProductMeta}>
              {[selectedProduct.brand, selectedProduct.sourceName].filter(Boolean).join(" • ") || "Imported product"}
            </Text>
          </View>
        ) : null}

        <TextField
          label="Item name"
          value={title}
          onChangeText={setTitle}
          placeholder="Coffee beans"
          required
          tone="anytime"
          hasError={showValidation && !title.trim()}
          errorText={showValidation && !title.trim() ? "Item name is required." : undefined}
        />
        <View style={styles.splitRow}>
          <TextField
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="1"
            keyboardType="number-pad"
            required
            tone="anytime"
            hasError={showValidation && (!quantity.trim() || !Number.isFinite(Number(quantity.trim())) || Number(quantity.trim()) <= 0)}
            errorText={
              !showValidation
                ? undefined
                : !quantity.trim()
                  ? "Required."
                  : !Number.isFinite(Number(quantity.trim())) || Number(quantity.trim()) <= 0
                    ? "Use a number > 0."
                    : undefined
            }
          />
          <TextField
            label="Store"
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Lidl, Spar..."
            required
            tone="anytime"
            hasError={showValidation && !storeName.trim()}
            errorText={showValidation && !storeName.trim() ? "Required." : undefined}
          />
        </View>

        {showQuickAddDetails ? (
          <>
            <TextField label="Note" value={note} onChangeText={setNote} placeholder="Ground, medium roast" tone="anytime" />
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>Repeat monthly</Text>
                <Text style={styles.meta}>Send this item to monthly recurring items too.</Text>
              </View>
              <Switch value={repeatMonthly} onValueChange={setRepeatMonthly} />
            </View>
          </>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton label="Add to anytime" tone="anytime" onPress={handleAdd} loading={busy === "save"} buttonStyle={styles.primaryAction} />
          <ActionButton
            label="Save for later"
            tone="anytime"
            variant="secondary"
            onPress={handleSaveProduct}
            loading={busy === "stash"}
            buttonStyle={styles.secondaryAction}
          />
        </View>
      </SectionCard>

      <Card>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Current items</Text>
          <ActionButton
            label="Untick all"
            tone="anytime"
            variant="ghost"
            onPress={handleUntickAll}
            loading={busy === "clear"}
            disabled={!items.some((item) => item.bought)}
          />
        </View>
        {items.length === 0 ? (
          <EmptyState tone="anytime" title="No anytime items yet" description="Add something quick for the household and it will appear here with the green anytime treatment." />
        ) : (
          items.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              tone="anytime"
              density="compact"
              onToggle={(value) => {
                void handleToggleItem(item, value);
              }}
              onRemove={() => {
                if (removingItemId !== item.id) {
                  void handleRemove(item);
                }
              }}
            />
          ))
        )}
      </Card>

      <Card>
        {savedLoadStatus ? <StatusMessage tone="error" message={savedLoadStatus} /> : null}
        <Text style={styles.sectionTitle}>Saved products</Text>
        {savedProducts.length === 0 ? (
          <EmptyState tone="anytime" title="Reusable shelf is empty" description="Save products from the quick-add composer so frequent items are one tap away." />
        ) : (
          savedProducts.map((product) => (
            <SavedProductRow
              key={product.id}
              product={product}
              tone="anytime"
              density="compact"
              onUse={() => {
                void handleUseSavedProduct(product);
              }}
              onDelete={() => {
                if (removingSavedProductId !== product.id) {
                  void handleDeleteSavedProduct(product);
                }
              }}
            />
          ))
        )}
      </Card>

      <Card>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>Import from public products</Text>
            <InfoHint tone="anytime" message="Keep this collapsed unless you want product details auto-filled from search or barcode." />
          </View>
          <Pressable style={styles.inlineToggle} onPress={() => setShowImport((value) => !value)}>
            <Text style={[styles.inlineToggleText, { color: anytimeAccent.solid }]}>{showImport ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        {showImport ? (
          <View style={styles.importSection}>
            <TextField
              label="Search public catalog"
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Milk, pasta, toothpaste..."
              helperText="Text search tries Open Food Facts first and falls back to USDA through your backend when configured."
              tone="anytime"
            />
            <ActionButton label="Search products" tone="anytime" variant="secondary" onPress={handleSearch} loading={busy === "search"} disabled={!isOnline} />
            <TextField
              label="Barcode lookup"
              value={barcode}
              onChangeText={setBarcode}
              placeholder="3017624010701"
              keyboardType="number-pad"
              helperText="Barcode lookup uses Open Food Facts through the backend."
              tone="anytime"
            />
            <ActionButton label="Lookup barcode" tone="anytime" variant="ghost" onPress={handleBarcodeSearch} loading={busy === "barcode"} disabled={!isOnline} />

            {searchResults.map((product) => (
              <View key={`${product.sourceName}-${product.sourceProductId}-${product.title}`} style={styles.productRow}>
                {product.imageUrl ? (
                  <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.productImageFallback, { backgroundColor: anytimeAccent.soft, borderColor: anytimeAccent.softBorder }]}>
                    <Text style={[styles.productImageFallbackText, { color: anytimeAccent.solid }]}>No image</Text>
                  </View>
                )}
                <View style={styles.productCopy}>
                  <Text style={styles.productTitle}>{product.title}</Text>
                  <Text style={styles.meta}>
                    {product.brand || "No brand"} • {product.sourceName}
                  </Text>
                </View>
                <ActionButton
                  label={selectedProduct?.sourceProductId === product.sourceProductId ? "Selected" : "Pick"}
                  tone="anytime"
                  variant={selectedProduct?.sourceProductId === product.sourceProductId ? "secondary" : "ghost"}
                  onPress={() => {
                    setSelectedProduct(product);
                    setTitle(product.title);
                    setStoreName((previous) => previous || deriveStoreName(product));
                    showNotice("Product picked. You can edit the fields before adding it.", "success");
                  }}
                />
              </View>
            ))}

            {!isOnline ? (
              <View style={styles.importOfflineState}>
                <Text style={styles.importOfflineTitle}>Public import is unavailable offline.</Text>
                <Text style={styles.importOfflineCopy}>Reconnect to search or scan. Manual entry and saved products still work.</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerMeta: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.size.section,
    fontFamily: theme.typography.fonts.title,
  },
  splitRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  selectedProductBanner: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    padding: 14,
    gap: 4,
  },
  selectedProductTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.fonts.label,
  },
  selectedProductMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
  },
  inlineToggle: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.surfaceStrong,
  },
  inlineToggleText: {
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
  switchRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.fonts.label,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
    lineHeight: theme.typography.lineHeight.meta,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  primaryAction: {
    flex: 1.25,
  },
  secondaryAction: {
    flex: 1,
  },
  importSection: {
    position: "relative",
    gap: 12,
  },
  importOfflineState: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 16,
    gap: 6,
    alignItems: "center",
  },
  importOfflineTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: theme.typography.fonts.title,
    textAlign: "center",
  },
  importOfflineCopy: {
    color: theme.colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  productRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  productCopy: {
    flex: 1,
    gap: 4,
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
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  productImageFallbackText: {
    fontSize: 11,
    fontFamily: theme.typography.fonts.label,
    textAlign: "center",
  },
  productTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.fonts.title,
  },
});
