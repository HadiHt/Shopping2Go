import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { InfoHint } from "@/components/feedback/InfoHint";
import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { TextField } from "@/components/forms/TextField";
import { Card, EmptyState, ModeBadge, Screen, ScreenHeader, SectionCard } from "@/components/layout/Screen";
import { SavedProductRow } from "@/components/lists/SavedProductRow";
import { ShoppingItemRow } from "@/components/lists/ShoppingItemRow";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useSession } from "@/hooks/useSession";
import { readCachedListItems } from "@/lib/offline";
import { showNotice } from "@/lib/notify";
import { getAccentColors, theme } from "@/lib/theme";
import {
  addListItem,
  buildMonthlyListId,
  deleteListItem,
  deleteMonthlyTemplate,
  deleteSavedProduct,
  ensureMonthlyList,
  saveSavedProduct,
  subscribeListItems,
  subscribeSavedProducts,
  subscribeTemplates,
  toggleListItem,
  untickAllListItems,
  updateListItem,
} from "@/services/firestore";
import type { MonthlyTemplate, ProductSnapshot, SavedProduct, ShoppingItem } from "@/types/models";
import { buildSavedProductSnapshot, findMergeableListItem, parseQuantityValue } from "@/utils/listItems";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/utils/date";
import { getErrorMessage } from "@/utils/errors";

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

function debugMonthlyScreen(event: string, details?: Record<string, unknown>) {
  console.log("[monthly-screen]", event, details ?? {});
}

export default function MonthlyScreen() {
  const { activeHouseholdId, user } = useSession();
  const { isOnline } = useConnectivity();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [templates, setTemplates] = useState<MonthlyTemplate[]>([]);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [storeName, setStoreName] = useState("");
  const [note, setNote] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductSnapshot | null>(null);
  const [saveToTemplate, setSaveToTemplate] = useState(true);
  const [busy, setBusy] = useState<"save" | "clear" | "stash" | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [removingSavedProductId, setRemovingSavedProductId] = useState<string | null>(null);
  const [removingTemplateId, setRemovingTemplateId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const [savedLoadStatus, setSavedLoadStatus] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showRecurringItems, setShowRecurringItems] = useState(true);
  const monthlyAccent = getAccentColors("monthly");

  const listId = useMemo(() => (activeHouseholdId ? buildMonthlyListId(activeHouseholdId, monthKey) : null), [activeHouseholdId, monthKey]);

  useEffect(() => {
    if (!activeHouseholdId || !listId) {
      debugMonthlyScreen("effect-reset-no-household-or-list", {
        activeHouseholdId,
        listId,
        monthKey,
      });
      setItems([]);
      setLoadStatus(null);
      return;
    }

    debugMonthlyScreen("effect-ensure-monthly-list-start", {
      activeHouseholdId,
      listId,
      monthKey,
    });

    ensureMonthlyList(activeHouseholdId, monthKey)
      .then(async () => {
        const cachedItems = await readCachedListItems(activeHouseholdId, listId);

        debugMonthlyScreen("effect-ensure-monthly-list-finished", {
          activeHouseholdId,
          listId,
          monthKey,
          cachedItemCountAfterEnsure: cachedItems.length,
          cachedItemsAfterEnsure: cachedItems.map((item) => ({
            id: item.id,
            title: item.title,
            bought: item.bought,
            pendingSync: item.pendingSync ?? false,
          })),
        });

        if (cachedItems.length > 0) {
          setItems(sortItemsForDisplay(cachedItems));
        }
      })
      .catch((error) => {
        debugMonthlyScreen("effect-ensure-monthly-list-error", {
          activeHouseholdId,
          listId,
          monthKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return subscribeListItems(
      activeHouseholdId,
      listId,
      (nextItems) => {
        debugMonthlyScreen("subscribe-list-items-callback", {
          activeHouseholdId,
          listId,
          monthKey,
          nextItemCount: nextItems.length,
          nextItems: nextItems.map((item) => ({
            id: item.id,
            title: item.title,
            bought: item.bought,
            pendingSync: item.pendingSync ?? false,
          })),
        });
        setLoadStatus(null);
        setItems(sortItemsForDisplay(nextItems));
      },
      (error) => {
        debugMonthlyScreen("subscribe-list-items-error", {
          activeHouseholdId,
          listId,
          monthKey,
          error: error instanceof Error ? error.message : String(error),
        });
        setLoadStatus(getErrorMessage(error, "The monthly list could not be loaded from Firestore."));
      },
    );
  }, [activeHouseholdId, listId, monthKey]);

  useEffect(() => {
    if (!activeHouseholdId) {
      debugMonthlyScreen("templates-reset-no-household", {});
      setTemplates([]);
      return;
    }

    return subscribeTemplates(activeHouseholdId, (nextTemplates) => {
      debugMonthlyScreen("subscribe-templates-callback", {
        activeHouseholdId,
        monthKey,
        templateCount: nextTemplates.length,
        templates: nextTemplates.map((template) => ({
          id: template.id,
          title: template.title,
          quantity: template.quantity ?? null,
          storeName: template.storeName ?? "",
          pendingSync: template.pendingSync ?? false,
        })),
      });
      setTemplates(nextTemplates);
    });
  }, [activeHouseholdId]);

  useEffect(() => {
    if (!activeHouseholdId || !listId || templates.length === 0) {
      debugMonthlyScreen("template-seed-effect-skipped", {
        activeHouseholdId,
        listId,
        monthKey,
        templateCount: templates.length,
      });
      return;
    }

    debugMonthlyScreen("template-seed-effect-start", {
      activeHouseholdId,
      listId,
      monthKey,
      templateCount: templates.length,
    });

    ensureMonthlyList(activeHouseholdId, monthKey)
      .then(async () => {
        const cachedItems = await readCachedListItems(activeHouseholdId, listId);

        debugMonthlyScreen("template-seed-effect-finished", {
          activeHouseholdId,
          listId,
          monthKey,
          cachedItemCountAfterSeed: cachedItems.length,
          cachedItemsAfterSeed: cachedItems.map((item) => ({
            id: item.id,
            title: item.title,
            bought: item.bought,
            pendingSync: item.pendingSync ?? false,
          })),
        });

        if (cachedItems.length > 0) {
          setItems(sortItemsForDisplay(cachedItems));
        }
      })
      .catch((error) => {
        debugMonthlyScreen("template-seed-effect-error", {
          activeHouseholdId,
          listId,
          monthKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [activeHouseholdId, listId, monthKey, templates]);

  useEffect(() => {
    if (!activeHouseholdId) {
      debugMonthlyScreen("saved-products-reset-no-household", {});
      setSavedProducts([]);
      setSavedLoadStatus(null);
      return;
    }

    return subscribeSavedProducts(
      activeHouseholdId,
      (nextProducts) => {
        debugMonthlyScreen("subscribe-saved-products-callback", {
          activeHouseholdId,
          productCount: nextProducts.length,
        });
        setSavedLoadStatus(null);
        setSavedProducts(nextProducts);
      },
      (error) => {
        debugMonthlyScreen("subscribe-saved-products-error", {
          activeHouseholdId,
          error: error instanceof Error ? error.message : String(error),
        });
        setSavedLoadStatus(getErrorMessage(error, "Saved products could not be loaded right now."));
      },
    );
  }, [activeHouseholdId]);

  useEffect(() => {
    debugMonthlyScreen("render-state", {
      activeHouseholdId,
      listId,
      monthKey,
      templateCount: templates.length,
      itemCount: items.length,
      itemTitles: items.map((item) => item.title),
      templateTitles: templates.map((template) => template.title),
      loadStatus,
    });
  }, [activeHouseholdId, listId, monthKey, templates, items, loadStatus]);

  const resetForm = () => {
    setTitle("");
    setQuantity("1");
    setNote("");
    setSelectedProduct(null);
    setShowValidation(false);
  };

  const upsertMonthlyItem = async (input: {
    title: string;
    quantity: number;
    storeName?: string;
    note?: string;
    productSnapshot?: ProductSnapshot | null;
    addToTemplate?: boolean;
  }) => {
    if (!activeHouseholdId || !listId || !user) {
      throw new Error("Choose a household before adding a monthly item.");
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
      quantity: input.quantity,
      storeName: normalizedStoreName,
      note: normalizedNote,
      userId: user.uid,
      addToTemplate: input.addToTemplate,
      productSnapshot,
      ensureList: "monthly",
      monthKey,
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

  const handleAdd = async () => {
    if (busy === "save") {
      return;
    }

    const normalizedTitle = title.trim();
    const normalizedStoreName = storeName.trim();
    const normalizedQuantity = quantity.trim();
    setShowValidation(true);

    if (!activeHouseholdId || !listId || !user) {
      showNotice("Choose a household before adding a monthly item.", "error");
      return;
    }

    if (!normalizedTitle || !normalizedStoreName || !normalizedQuantity) {
      showNotice("Fill in item name, quantity, and store before adding a monthly item.", "error");
      return;
    }

    const parsedQuantity = Number(normalizedQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      showNotice("Quantity must be a number greater than 0.", "error");
      return;
    }

    try {
      setBusy("save");
      const result = await upsertMonthlyItem({
        title: normalizedTitle,
        quantity: parsedQuantity,
        storeName: normalizedStoreName,
        note,
        productSnapshot: selectedProduct,
        addToTemplate: saveToTemplate,
      });
      resetForm();
      showNotice(
        result.pendingSync
          ? result.mode === "merged"
            ? `${result.item.title} was updated locally and will sync once you reconnect.`
            : "Monthly item saved locally. It will sync when the app reconnects."
          : result.mode === "merged"
            ? `${result.item.title} quantity is now ${result.quantity}.`
            : "Monthly item added successfully.",
        result.pendingSync ? "info" : "success",
      );
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not add monthly item. Please try again."), "error");
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
      const result = await upsertMonthlyItem({
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
            : "Saved product added to this month.",
        result.pendingSync ? "info" : "success",
      );
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not add the saved product right now."), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (item: ShoppingItem) => {
    try {
      setRemovingItemId(item.id);
      const result = await deleteListItem(item, !isOnline);
      setItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id));
      showNotice(result.pendingSync ? "Item removed locally. The delete will sync when you are back online." : "Item removed from the monthly list.", result.pendingSync ? "info" : "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not remove the monthly item. Please try again."), "error");
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
      showNotice(getErrorMessage(error, "Could not update that monthly item right now."), "error");
    }
  };

  const handleUntickAll = async () => {
    if (!activeHouseholdId || !listId) {
      return;
    }

    try {
      setBusy("clear");
      await untickAllListItems(activeHouseholdId, listId);
      showNotice("All monthly items were unticked.", "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not untick all monthly items. Please try again."), "error");
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

  const handleDeleteTemplate = async (template: MonthlyTemplate) => {
    try {
      setRemovingTemplateId(template.id);
      const result = await deleteMonthlyTemplate(template);
      setTemplates((currentTemplates) => currentTemplates.filter((currentTemplate) => currentTemplate.id !== template.id));
      showNotice(result.pendingSync ? "Recurring item removed locally. The delete will sync when you are back online." : "Recurring item removed.", result.pendingSync ? "info" : "success");
    } catch (error) {
      showNotice(getErrorMessage(error, "Could not remove the recurring item right now."), "error");
    } finally {
      setRemovingTemplateId(null);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        tone="monthly"
        badge="Monthly"
        title="Plan the month"
        description="Start from your recurring staples, then layer in extra items for this month without losing the bigger rhythm."
      >
        <View style={styles.monthHero}>
          <ActionButton label="Previous" tone="monthly" variant="secondary" onPress={() => setMonthKey((value) => shiftMonth(value, -1))} buttonStyle={styles.navButton} />
          <View style={styles.monthCenter}>
            <Text style={[styles.monthLabel, { color: monthlyAccent.solid }]}>{formatMonthLabel(monthKey)}</Text>
            <Text style={styles.monthCaption}>{templates.length} recurring item{templates.length === 1 ? "" : "s"} ready to seed this plan</Text>
          </View>
          <ActionButton label="Next" tone="monthly" variant="secondary" onPress={() => setMonthKey((value) => shiftMonth(value, 1))} buttonStyle={styles.navButton} />
        </View>
      </ScreenHeader>

      <Card>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>Recurring items</Text>
            <InfoHint tone="monthly" message="These are your monthly staples. Keep them clean and the monthly plan starts from a strong baseline." />
          </View>
          <Pressable style={styles.inlineToggle} onPress={() => setShowRecurringItems((value) => !value)}>
            <Text style={[styles.inlineToggleText, { color: monthlyAccent.solid }]}>{showRecurringItems ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        {showRecurringItems ? (
          templates.length === 0 ? (
            <EmptyState tone="monthly" title="No recurring staples yet" description="Turn on “Keep recurring” when adding monthly items and your base plan will start building itself." />
          ) : (
            templates.map((template) => (
              <View key={template.id} style={styles.templateRow}>
                <View style={styles.templateCopy}>
                  <Text style={styles.templateTitle}>{template.title}</Text>
                  {template.pendingSync ? <Text style={[styles.pending, { color: monthlyAccent.solid }]}>Saved locally. Waiting for internet.</Text> : null}
                  <Text style={styles.meta}>
                    {[template.quantity ? `Qty: ${template.quantity}` : "", template.storeName ? `Store: ${template.storeName}` : "", template.note]
                      .filter(Boolean)
                      .join(" • ") || "Recurring staple"}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  style={[styles.templateDelete, removingTemplateId === template.id ? styles.templateDeleteBusy : null]}
                  onPress={() => {
                    if (removingTemplateId !== template.id) {
                      void handleDeleteTemplate(template);
                    }
                  }}
                >
                  <Text style={styles.templateDeleteText}>{removingTemplateId === template.id ? "Removing..." : "Remove"}</Text>
                </Pressable>
              </View>
            ))
          )
        ) : null}
      </Card>

      <SectionCard tone="monthly">
        {!items.length && loadStatus ? <StatusMessage tone="error" message={loadStatus} /> : null}
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>Add extra item</Text>
          <InfoHint tone="monthly" message="Use this for one-off monthly additions. Leave “Keep recurring” on only when it should become a staple." />
        </View>

        {selectedProduct ? (
          <View style={[styles.selectedProductBanner, { backgroundColor: theme.colors.surfaceStrong, borderColor: monthlyAccent.softBorder }]}>
            <Text style={styles.selectedProductTitle}>Selected saved product: {selectedProduct.title}</Text>
            <Text style={styles.selectedProductMeta}>
              {[selectedProduct.brand, selectedProduct.sourceName].filter(Boolean).join(" • ") || "Imported product"}
            </Text>
          </View>
        ) : null}

        <TextField
          label="Item name"
          value={title}
          onChangeText={setTitle}
          placeholder="Laundry detergent"
          required
          tone="monthly"
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
            tone="monthly"
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
            tone="monthly"
            hasError={showValidation && !storeName.trim()}
            errorText={showValidation && !storeName.trim() ? "Required." : undefined}
          />
        </View>
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Sensitive skin version" tone="monthly" />
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>Keep recurring</Text>
            <Text style={styles.meta}>Save this into recurring monthly staples too.</Text>
          </View>
          <Switch value={saveToTemplate} onValueChange={setSaveToTemplate} />
        </View>
        <View style={styles.actionRow}>
          <ActionButton label="Add to month" tone="monthly" onPress={handleAdd} loading={busy === "save"} buttonStyle={styles.primaryAction} />
          <ActionButton
            label="Save for later"
            tone="monthly"
            variant="secondary"
            onPress={handleSaveProduct}
            loading={busy === "stash"}
            buttonStyle={styles.secondaryAction}
          />
        </View>
      </SectionCard>

      <Card>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{formatMonthLabel(monthKey)} items</Text>
          <ActionButton
            label="Untick all"
            tone="monthly"
            variant="ghost"
            onPress={handleUntickAll}
            loading={busy === "clear"}
            disabled={!items.some((item) => item.bought)}
          />
        </View>
        {items.length === 0 ? (
          <EmptyState tone="monthly" title="This month is still empty" description="Recurring staples and extra one-offs will land here with the orange monthly treatment." />
        ) : (
          items.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              tone="monthly"
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
          <EmptyState tone="monthly" title="No saved products yet" description="Save useful one-offs here so you can bring them into a future month in one tap." />
        ) : (
          savedProducts.map((product) => (
            <SavedProductRow
              key={product.id}
              product={product}
              tone="monthly"
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navButton: {
    minWidth: 92,
  },
  monthCenter: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  monthLabel: {
    fontSize: 24,
    fontFamily: theme.typography.fonts.heading,
  },
  monthCaption: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
    textAlign: "center",
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
  templateRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  templateCopy: {
    flex: 1,
    gap: 4,
  },
  templateTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fonts.title,
  },
  templateDelete: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 88,
    alignItems: "center",
  },
  templateDeleteBusy: {
    opacity: 0.6,
  },
  templateDeleteText: {
    color: theme.colors.text,
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
  pending: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
    lineHeight: theme.typography.lineHeight.meta,
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
  splitRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
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
});
