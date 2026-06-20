import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  enqueuePendingMutation,
  mergeById,
  mergeRemoteWithPendingById,
  readCachedHouseholds,
  readCachedListItems,
  readCachedReceipts,
  readCachedSavedProducts,
  readCachedTemplates,
  readPendingMutations,
  removePendingMutation,
  writePendingMutations,
  writeCachedHouseholds,
  writeCachedListItems,
  writeCachedReceipts,
  writeCachedSavedProducts,
  writeCachedTemplates,
  type PendingAddListItemMutation,
  type PendingCreateReceiptMutation,
  type PendingDeleteListItemMutation,
  type PendingDeleteMonthlyTemplateMutation,
  type PendingDeleteSavedProductMutation,
  type PendingMutation,
  type PendingSaveSavedProductMutation,
  type PendingToggleListItemMutation,
  type PendingUpdateListItemMutation,
} from "@/lib/offline";
import { db } from "@/lib/firebase";
import type {
  Household,
  HouseholdMember,
  MonthlyTemplate,
  ProductSnapshot,
  ReceiptEntry,
  SavedProduct,
  ShoppingItem,
  ShoppingList,
} from "@/types/models";
import { currentMonthKey } from "@/utils/date";
import { generateInviteCode } from "@/utils/invite";

function dataWithId<T>(id: string, data: Record<string, unknown>) {
  return { id, ...(data as T) };
}

function normalizeQuantity(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }

  return null;
}

function comparableTime(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  return 0;
}

function isoNow() {
  return new Date().toISOString();
}

function hoursAgo(hours: number) {
  return Date.now() - hours * 60 * 60 * 1000;
}

const BOUGHT_ITEM_AUTO_REMOVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const listItemCacheListeners = new Map<string, Set<(items: ShoppingItem[]) => void>>();
const boughtItemCleanupTimers = new Map<
  string,
  {
    timeoutId: ReturnType<typeof setTimeout>;
    householdId: string;
    listId: string;
    boughtAt: number;
  }
>();

function normalizeText(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function debugMonthlyRecurring(event: string, details?: Record<string, unknown>) {
  console.log("[monthly-recurring]", event, details ?? {});
}

function listItemCacheListenerKey(householdId: string, listId: string) {
  return `${householdId}::${listId}`;
}

function emitListItemCacheListeners(householdId: string, listId: string, items: ShoppingItem[]) {
  const listeners = listItemCacheListeners.get(listItemCacheListenerKey(householdId, listId));

  if (!listeners || listeners.size === 0) {
    return;
  }

  listeners.forEach((listener) => {
    listener(sortByCreatedAt(items));
  });
}

function subscribeListItemCacheChanges(householdId: string, listId: string, listener: (items: ShoppingItem[]) => void) {
  const key = listItemCacheListenerKey(householdId, listId);
  const listeners = listItemCacheListeners.get(key) ?? new Set<(items: ShoppingItem[]) => void>();
  listeners.add(listener);
  listItemCacheListeners.set(key, listeners);

  return () => {
    const currentListeners = listItemCacheListeners.get(key);

    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);

    if (currentListeners.size === 0) {
      listItemCacheListeners.delete(key);
    }
  };
}

function sortByCreatedAt<T extends { createdAt?: unknown }>(items: T[]) {
  return items.slice().sort((left, right) => comparableTime(left.createdAt) - comparableTime(right.createdAt));
}

function sortByUpdatedAtDesc<T extends { createdAt?: unknown; updatedAt?: unknown }>(items: T[]) {
  return items
    .slice()
    .sort((left, right) => comparableTime(right.updatedAt ?? right.createdAt) - comparableTime(left.updatedAt ?? left.createdAt));
}

function sortReceipts(items: ReceiptEntry[]) {
  return items.slice().sort((left, right) => comparableTime(right.purchaseDate) - comparableTime(left.purchaseDate));
}

function isLikelyOfflineError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("offline") ||
    message.includes("network") ||
    message.includes("unavailable") ||
    message.includes("failed-precondition") ||
    message.includes("client is offline")
  );
}

function buildPendingItem(input: {
  itemId: string;
  householdId: string;
  listId: string;
  title: string;
  note?: string;
  quantity?: number | null;
  storeName?: string;
  userId: string;
  productSnapshotId?: string | null;
  productSnapshot?: ProductSnapshot | null;
  pendingSync?: boolean;
}) {
  const now = isoNow();

  return {
    id: input.itemId,
    householdId: input.householdId,
    listId: input.listId,
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    quantity: input.quantity ?? null,
    storeName: input.storeName?.trim() ?? "",
    bought: false,
    boughtAt: null,
    createdBy: input.userId,
    productSnapshotId: input.productSnapshotId ?? undefined,
    productSnapshot: input.productSnapshot ?? null,
    createdAt: now,
    updatedAt: now,
    pendingSync: input.pendingSync ?? true,
  } satisfies ShoppingItem;
}

function buildUpdatedListItem(
  item: ShoppingItem,
  changes: {
    title?: string;
    note?: string;
    quantity?: number | null;
    storeName?: string;
    productSnapshot?: ProductSnapshot | null;
  },
) {
  const productSnapshot = changes.productSnapshot !== undefined ? changes.productSnapshot ?? null : item.productSnapshot ?? null;

  return {
    ...item,
    title: changes.title !== undefined ? changes.title.trim() : item.title,
    note: changes.note !== undefined ? changes.note?.trim() ?? "" : item.note?.trim() ?? "",
    quantity: changes.quantity !== undefined ? changes.quantity ?? null : item.quantity ?? null,
    storeName: changes.storeName !== undefined ? changes.storeName?.trim() ?? "" : item.storeName?.trim() ?? "",
    productSnapshot,
    productSnapshotId: productSnapshot ? item.productSnapshotId : undefined,
    updatedAt: isoNow(),
  } satisfies ShoppingItem;
}

function buildPendingSavedProduct(input: {
  savedProductId: string;
  householdId: string;
  userId: string;
  title: string;
  note?: string;
  quantity?: number | null;
  storeName?: string;
  productSnapshot?: ProductSnapshot | null;
  pendingSync?: boolean;
}) {
  const now = isoNow();

  return {
    id: input.savedProductId,
    householdId: input.householdId,
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    quantity: input.quantity ?? null,
    storeName: input.storeName?.trim() ?? "",
    brand: input.productSnapshot?.brand ?? "",
    price: input.productSnapshot?.price ?? null,
    currency: input.productSnapshot?.currency ?? null,
    imageUrl: input.productSnapshot?.imageUrl ?? null,
    sourceName: input.productSnapshot?.sourceName ?? "Saved manually",
    sourceProductId: input.productSnapshot?.sourceProductId ?? null,
    productUrl: input.productSnapshot?.productUrl ?? null,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
    pendingSync: input.pendingSync ?? true,
  } satisfies SavedProduct;
}

function buildPendingReceipt(input: {
  receiptId: string;
  householdId: string;
  userId: string;
  total: number;
  currency: string;
  purchaseDate: string;
  linkedMonth?: string;
  storeName?: string;
  note?: string;
  pendingSync?: boolean;
}) {
  const now = isoNow();

  return {
    id: input.receiptId,
    householdId: input.householdId,
    total: input.total,
    currency: input.currency,
    purchaseDate: input.purchaseDate,
    linkedMonth: input.linkedMonth ?? null,
    storeName: input.storeName?.trim() ?? "",
    note: input.note?.trim() ?? "",
    imagePath: null,
    imageUrl: null,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
    pendingSync: input.pendingSync ?? true,
  } satisfies ReceiptEntry;
}

async function hydrateCachedCollection<T>(loader: () => Promise<T[]>, callback: (items: T[]) => void) {
  const cached = await loader();

  if (cached.length > 0) {
    callback(cached);
  }
}

async function readPendingDeletionIds(kind: PendingMutation["kind"]) {
  const pendingMutations = await readPendingMutations();

  if (kind === "deleteListItem") {
    return new Set(
      pendingMutations
        .filter((mutation): mutation is PendingDeleteListItemMutation => mutation.kind === "deleteListItem")
        .map((mutation) => mutation.itemId),
    );
  }

  if (kind === "deleteSavedProduct") {
    return new Set(
      pendingMutations
        .filter((mutation): mutation is PendingDeleteSavedProductMutation => mutation.kind === "deleteSavedProduct")
        .map((mutation) => mutation.productId),
    );
  }

  if (kind === "deleteMonthlyTemplate") {
    return new Set(
      pendingMutations
        .filter((mutation): mutation is PendingDeleteMonthlyTemplateMutation => mutation.kind === "deleteMonthlyTemplate")
        .map((mutation) => mutation.templateId),
    );
  }

  return new Set<string>();
}

async function readPendingListItemToggleMap() {
  const pendingMutations = await readPendingMutations();
  const toggleMap = new Map<string, PendingToggleListItemMutation>();

  pendingMutations.forEach((mutation) => {
    if (mutation.kind === "toggleListItem") {
      toggleMap.set(mutation.itemId, mutation);
    }
  });

  return toggleMap;
}

async function readPendingListItemUpdateMap() {
  const pendingMutations = await readPendingMutations();
  const updateMap = new Map<string, PendingUpdateListItemMutation>();

  pendingMutations.forEach((mutation) => {
    if (mutation.kind === "updateListItem") {
      updateMap.set(mutation.item.id, mutation);
    }
  });

  return updateMap;
}

function applyPendingListItemState(
  items: ShoppingItem[],
  updateMap: Map<string, PendingUpdateListItemMutation>,
  toggleMap: Map<string, PendingToggleListItemMutation>,
) {
  return items.map((item) => {
    const pendingUpdate = updateMap.get(item.id);
    const pendingToggle = toggleMap.get(item.id);
    const resolvedItem = pendingUpdate?.item ?? item;

    if (!pendingToggle) {
      return resolvedItem;
    }

    return {
      ...resolvedItem,
      bought: pendingToggle.bought,
      boughtAt: pendingToggle.boughtAt ?? null,
      updatedAt: pendingToggle.updatedAt,
    } satisfies ShoppingItem;
  });
}

async function clearSyncedPendingListItems(items: ShoppingItem[]) {
  const pendingMutations = await readPendingMutations();
  const pendingItemIds = new Set<string>();

  pendingMutations.forEach((mutation) => {
    if (mutation.kind === "addListItem" || mutation.kind === "updateListItem") {
      pendingItemIds.add(mutation.item.id);
      return;
    }

    if (mutation.kind === "toggleListItem" || mutation.kind === "deleteListItem") {
      pendingItemIds.add(mutation.itemId);
    }
  });

  return items.map((item) => {
    if (!item.pendingSync || pendingItemIds.has(item.id)) {
      return item;
    }

    return {
      ...item,
      pendingSync: false,
    } satisfies ShoppingItem;
  });
}

async function removeExpiredBoughtItems(items: ShoppingItem[]) {
  const expiredItems = items.filter((item) => item.bought && comparableTime(item.boughtAt) > 0 && comparableTime(item.boughtAt) <= hoursAgo(24));

  if (expiredItems.length === 0) {
    return items;
  }

  await Promise.all(expiredItems.map((item) => deleteListItem(item)));
  const expiredIds = new Set(expiredItems.map((item) => item.id));
  return items.filter((item) => !expiredIds.has(item.id));
}

async function upsertPendingMutation(mutation: PendingMutation) {
  const pendingMutations = await readPendingMutations();
  const nextMutations = [...pendingMutations.filter((item) => item.id !== mutation.id), mutation];
  await writePendingMutations(nextMutations);
}

async function removePendingMutationsByPrefix(prefix: string) {
  const pendingMutations = await readPendingMutations();
  await writePendingMutations(pendingMutations.filter((mutation) => !mutation.id.startsWith(prefix)));
}

function getPendingAddListItemMutation(pendingMutations: PendingMutation[], itemId: string) {
  return (
    pendingMutations.find(
      (mutation): mutation is PendingAddListItemMutation => mutation.kind === "addListItem" && mutation.item.id === itemId,
    ) ?? null
  );
}

function isListItemMutationForItem(mutation: PendingMutation, itemId: string) {
  if (mutation.kind === "addListItem" || mutation.kind === "updateListItem") {
    return mutation.item.id === itemId;
  }

  if (mutation.kind === "toggleListItem" || mutation.kind === "deleteListItem") {
    return mutation.itemId === itemId;
  }

  return false;
}

async function cacheListItem(item: ShoppingItem) {
  const cachedItems = await readCachedListItems(item.householdId, item.listId);
  const nextItems = sortByCreatedAt(mergeById([item], cachedItems));
  await writeCachedListItems(item.householdId, item.listId, nextItems);
  reconcileBoughtItemCleanupTimers(item.householdId, item.listId, nextItems);
  emitListItemCacheListeners(item.householdId, item.listId, nextItems);
}

async function removeCachedListItem(item: ShoppingItem) {
  const cachedItems = await readCachedListItems(item.householdId, item.listId);
  const nextItems = sortByCreatedAt(cachedItems.filter((cachedItem) => cachedItem.id !== item.id));
  await writeCachedListItems(item.householdId, item.listId, nextItems);
  reconcileBoughtItemCleanupTimers(item.householdId, item.listId, nextItems);
  emitListItemCacheListeners(item.householdId, item.listId, nextItems);
}

function clearBoughtItemCleanupTimer(itemId: string) {
  const timer = boughtItemCleanupTimers.get(itemId);

  if (!timer) {
    return;
  }

  clearTimeout(timer.timeoutId);
  boughtItemCleanupTimers.delete(itemId);
}

async function runBoughtItemAutoCleanup(householdId: string, listId: string, itemId: string) {
  boughtItemCleanupTimers.delete(itemId);

  try {
    const cachedItems = await readCachedListItems(householdId, listId);
    const currentItem = cachedItems.find((item) => item.id === itemId);

    if (!currentItem || !currentItem.bought) {
      return;
    }

    const boughtAt = comparableTime(currentItem.boughtAt);

    if (boughtAt <= 0) {
      return;
    }

    const expiresAt = boughtAt + BOUGHT_ITEM_AUTO_REMOVE_WINDOW_MS;

    if (expiresAt > Date.now()) {
      scheduleBoughtItemCleanup(currentItem);
      return;
    }

    await deleteListItem(currentItem);
  } catch (error) {
    console.error("[list-cleanup] auto-remove-failed", {
      householdId,
      listId,
      itemId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function scheduleBoughtItemCleanup(item: ShoppingItem) {
  clearBoughtItemCleanupTimer(item.id);

  if (!item.bought) {
    return;
  }

  const boughtAt = comparableTime(item.boughtAt);

  if (boughtAt <= 0) {
    return;
  }

  const expiresAt = boughtAt + BOUGHT_ITEM_AUTO_REMOVE_WINDOW_MS;
  const delay = expiresAt - Date.now();

  if (delay <= 0) {
    void runBoughtItemAutoCleanup(item.householdId, item.listId, item.id);
    return;
  }

  const timeoutId = setTimeout(() => {
    void runBoughtItemAutoCleanup(item.householdId, item.listId, item.id);
  }, delay);

  boughtItemCleanupTimers.set(item.id, {
    timeoutId,
    householdId: item.householdId,
    listId: item.listId,
    boughtAt,
  });
}

function reconcileBoughtItemCleanupTimers(householdId: string, listId: string, items: ShoppingItem[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  boughtItemCleanupTimers.forEach((timer, itemId) => {
    if (timer.householdId !== householdId || timer.listId !== listId) {
      return;
    }

    const item = itemsById.get(itemId);

    if (!item || !item.bought || comparableTime(item.boughtAt) <= 0) {
      clearBoughtItemCleanupTimer(itemId);
    }
  });

  items.forEach((item) => {
    if (!item.bought) {
      clearBoughtItemCleanupTimer(item.id);
      return;
    }

    const boughtAt = comparableTime(item.boughtAt);
    const existingTimer = boughtItemCleanupTimers.get(item.id);

    if (existingTimer && existingTimer.householdId === householdId && existingTimer.listId === listId && existingTimer.boughtAt === boughtAt) {
      return;
    }

    scheduleBoughtItemCleanup(item);
  });
}

async function cacheSavedProduct(product: SavedProduct) {
  const cachedProducts = await readCachedSavedProducts(product.householdId);
  await writeCachedSavedProducts(product.householdId, sortByUpdatedAtDesc(mergeById([product], cachedProducts)));
}

async function removeCachedSavedProduct(product: SavedProduct) {
  const cachedProducts = await readCachedSavedProducts(product.householdId);
  await writeCachedSavedProducts(
    product.householdId,
    sortByUpdatedAtDesc(cachedProducts.filter((cachedProduct) => cachedProduct.id !== product.id)),
  );
}

async function removeCachedTemplate(template: MonthlyTemplate) {
  const cachedTemplates = await readCachedTemplates(template.householdId);
  await writeCachedTemplates(
    template.householdId,
    sortByCreatedAt(cachedTemplates.filter((cachedTemplate) => cachedTemplate.id !== template.id)),
  );
}

export function buildOngoingListId(householdId: string) {
  return `${householdId}_ongoing`;
}

export function buildMonthlyListId(householdId: string, monthKey: string) {
  return `${householdId}_monthly_${monthKey}`;
}

function isRecurringTemplatePresentInList(items: ShoppingItem[], template: MonthlyTemplate) {
  const templateTitle = normalizeText(template.title);

  if (!templateTitle) {
    return true;
  }

  const isPresent = items.some((item) => {
    const isExpiredBoughtItem =
      item.bought && comparableTime(item.boughtAt) > 0 && comparableTime(item.boughtAt) <= hoursAgo(24);

    if (isExpiredBoughtItem) {
      return false;
    }

    return normalizeText(item.title) === templateTitle;
  });

  debugMonthlyRecurring("template-presence-check", {
    templateId: template.id,
    templateTitle: template.title,
    normalizedTemplateTitle: templateTitle,
    isPresent,
    candidateItemTitles: items.map((item) => ({
      id: item.id,
      title: item.title,
      normalizedTitle: normalizeText(item.title),
      bought: item.bought,
      boughtAt: item.boughtAt ?? null,
      pendingSync: item.pendingSync ?? false,
      listId: item.listId,
    })),
  });

  return isPresent;
}

async function syncRecurringTemplatesIntoMonthlyList(householdId: string, listId: string, monthKey: string) {
  debugMonthlyRecurring("sync-start", {
    householdId,
    listId,
    monthKey,
  });

  const [
    templateSnapshot,
    itemSnapshot,
    cachedTemplates,
    cachedListItems,
    pendingDeletedTemplateIds,
    pendingDeletedItemIds,
    pendingUpdateMap,
    pendingToggleMap,
  ] = await Promise.all([
    getDocs(query(collection(db, "monthlyTemplates"), where("householdId", "==", householdId))).catch(() => null),
    getDocs(query(collection(db, "listItems"), where("householdId", "==", householdId))).catch(() => null),
    readCachedTemplates(householdId),
    readCachedListItems(householdId, listId),
    readPendingDeletionIds("deleteMonthlyTemplate"),
    readPendingDeletionIds("deleteListItem"),
    readPendingListItemUpdateMap(),
    readPendingListItemToggleMap(),
  ]);

  debugMonthlyRecurring("sync-source-results", {
    householdId,
    listId,
    monthKey,
    remoteTemplateCount: templateSnapshot?.docs.length ?? 0,
    remoteItemCount: itemSnapshot?.docs.length ?? 0,
    cachedTemplateCount: cachedTemplates.length,
    cachedListItemCount: cachedListItems.length,
    pendingDeletedTemplateIds: [...pendingDeletedTemplateIds],
    pendingDeletedItemIds: [...pendingDeletedItemIds],
    pendingUpdateItemIds: [...pendingUpdateMap.keys()],
    pendingToggleItemIds: [...pendingToggleMap.keys()],
  });

  const remoteTemplates = (templateSnapshot?.docs ?? [])
    .map((item) => dataWithId<MonthlyTemplate>(item.id, item.data()))
    .filter((template) => !pendingDeletedTemplateIds.has(template.id));
  const filteredCachedTemplates = cachedTemplates.filter((template) => !pendingDeletedTemplateIds.has(template.id));
  const templates = sortByCreatedAt(mergeRemoteWithPendingById(remoteTemplates, filteredCachedTemplates));
  const remoteItems = (itemSnapshot?.docs ?? [])
    .map((item) => dataWithId<ShoppingItem>(item.id, item.data()))
    .filter((item) => item.listId === listId && !pendingDeletedItemIds.has(item.id));
  const filteredCachedItems = cachedListItems.filter((item) => !pendingDeletedItemIds.has(item.id));
  let currentItems = sortByCreatedAt(
    applyPendingListItemState(mergeRemoteWithPendingById(remoteItems, filteredCachedItems), pendingUpdateMap, pendingToggleMap),
  ).filter((item) => !(item.bought && comparableTime(item.boughtAt) > 0 && comparableTime(item.boughtAt) <= hoursAgo(24)));

  debugMonthlyRecurring("sync-merged-state", {
    householdId,
    listId,
    monthKey,
    templateCount: templates.length,
    templates: templates.map((template) => ({
      id: template.id,
      title: template.title,
      quantity: template.quantity ?? null,
      storeName: template.storeName ?? "",
      pendingSync: template.pendingSync ?? false,
    })),
    currentItemCount: currentItems.length,
    currentItems: currentItems.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity ?? null,
      storeName: item.storeName ?? "",
      bought: item.bought,
      pendingSync: item.pendingSync ?? false,
      listId: item.listId,
    })),
  });

  for (const template of templates) {
    if (isRecurringTemplatePresentInList(currentItems, template)) {
      debugMonthlyRecurring("sync-skip-existing-template", {
        householdId,
        listId,
        monthKey,
        templateId: template.id,
        templateTitle: template.title,
      });
      continue;
    }

    debugMonthlyRecurring("sync-create-from-template", {
      householdId,
      listId,
      monthKey,
      templateId: template.id,
      templateTitle: template.title,
      templateQuantity: template.quantity ?? null,
      templateStoreName: template.storeName ?? "",
      templatePendingSync: template.pendingSync ?? false,
    });

    const createdItem = await addListItem({
      householdId,
      listId,
      title: template.title,
      note: template.note ?? "",
      quantity: typeof template.quantity === "number" ? template.quantity : Number(template.quantity ?? 0) || null,
      storeName: template.storeName ?? "",
      userId: template.createdBy ?? "template",
      ensureList: "monthly",
      monthKey,
    });

    debugMonthlyRecurring("sync-created-item", {
      householdId,
      listId,
      monthKey,
      templateId: template.id,
      createdItemId: createdItem.id,
      createdItemTitle: createdItem.title,
      createdItemPendingSync: createdItem.pendingSync ?? false,
    });

    currentItems = sortByCreatedAt(mergeById([createdItem], currentItems));
  }

  await writeCachedListItems(householdId, listId, currentItems);

  debugMonthlyRecurring("sync-finished", {
    householdId,
    listId,
    monthKey,
    finalItemCount: currentItems.length,
    finalItems: currentItems.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity ?? null,
      storeName: item.storeName ?? "",
      bought: item.bought,
      pendingSync: item.pendingSync ?? false,
    })),
  });
}

export async function ensureOngoingList(householdId: string) {
  const listId = buildOngoingListId(householdId);
  const listRef = doc(db, "lists", listId);
  const listSnapshot = await getDoc(listRef);

  if (listSnapshot.exists()) {
    return listId;
  }

  await setDoc(listRef, {
    householdId,
    name: "Anytime list",
    type: "ongoing",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return listId;
}

export async function createHousehold(input: {
  userId: string;
  userEmail: string;
  displayName: string;
  name: string;
  currency: string;
}) {
  const householdRef = doc(collection(db, "households"));
  const inviteCode = generateInviteCode();
  const ongoingListId = buildOngoingListId(householdRef.id);
  const monthKey = currentMonthKey();
  const monthlyListId = buildMonthlyListId(householdRef.id, monthKey);
  const batch = writeBatch(db);

  batch.set(householdRef, {
    name: input.name.trim(),
    currency: input.currency.trim().toUpperCase(),
    createdBy: input.userId,
    activeInviteCode: inviteCode,
    memberIds: [input.userId],
    memberCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, "householdMembers", `${householdRef.id}_${input.userId}`), {
    householdId: householdRef.id,
    userId: input.userId,
    role: "owner",
    displayName: input.displayName,
    email: input.userEmail,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, "invites", inviteCode), {
    code: inviteCode,
    householdId: householdRef.id,
    active: true,
    createdBy: input.userId,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, "lists", ongoingListId), {
    householdId: householdRef.id,
    name: "Anytime list",
    type: "ongoing",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, "lists", monthlyListId), {
    householdId: householdRef.id,
    name: `Monthly list - ${monthKey}`,
    type: "monthly",
    monthKey,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  return householdRef.id;
}

export async function joinHouseholdByCode(input: {
  code: string;
  userId: string;
  userEmail: string;
  displayName: string;
}) {
  const code = input.code.trim().toUpperCase();
  const inviteRef = doc(db, "invites", code);
  const inviteSnapshot = await getDoc(inviteRef);

  if (!inviteSnapshot.exists() || !inviteSnapshot.data().active) {
    throw new Error("Invite code is invalid or inactive.");
  }

  const householdId = inviteSnapshot.data().householdId as string;
  const householdRef = doc(db, "households", householdId);
  const memberRef = doc(db, "householdMembers", `${householdId}_${input.userId}`);

  await runTransaction(db, async (transaction) => {
    const householdSnapshot = await transaction.get(householdRef);

    if (!householdSnapshot.exists()) {
      throw new Error("Household was not found.");
    }

    const memberIds = (householdSnapshot.data().memberIds ?? []) as string[];

    if (memberIds.includes(input.userId)) {
      return;
    }

    transaction.update(householdRef, {
      memberIds: arrayUnion(input.userId),
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    transaction.set(memberRef, {
      householdId,
      userId: input.userId,
      role: "member",
      displayName: input.displayName,
      email: input.userEmail,
      joinedAt: serverTimestamp(),
    });
  });

  return householdId;
}

export function subscribeHouseholds(
  userId: string,
  callback: (households: Household[]) => void,
  onError?: (error: Error) => void,
) {
  const householdsByMemberIdsQuery = query(collection(db, "households"), where("memberIds", "array-contains", userId));
  const membershipsQuery = query(collection(db, "householdMembers"), where("userId", "==", userId));
  const householdMap = new Map<string, Household>();

  const emit = () => {
    const households = sortByCreatedAt(Array.from(householdMap.values()));
    void writeCachedHouseholds(userId, households);
    callback(households);
  };

  void hydrateCachedCollection(() => readCachedHouseholds(userId), callback);

  const householdsUnsubscribe = onSnapshot(
    householdsByMemberIdsQuery,
    (snapshot) => {
      void (async () => {
        const cachedHouseholds = await readCachedHouseholds(userId);

        if (snapshot.metadata.fromCache && snapshot.docs.length === 0 && cachedHouseholds.length > 0) {
          callback(sortByCreatedAt(cachedHouseholds));
          return;
        }

        const idsFromQuery = new Set(snapshot.docs.map((item) => item.id));

        for (const [householdId, household] of householdMap.entries()) {
          if (idsFromQuery.has(householdId)) {
            continue;
          }

          if ((household.memberIds ?? []).includes(userId)) {
            householdMap.delete(householdId);
          }
        }

        snapshot.docs.forEach((item) => {
          householdMap.set(item.id, dataWithId<Household>(item.id, item.data()));
        });

        emit();
      })();
    },
    (error) => {
      onError?.(error);
    },
  );

  const membershipsUnsubscribe = onSnapshot(
    membershipsQuery,
    (snapshot) => {
      void (async () => {
        try {
          const cachedHouseholds = await readCachedHouseholds(userId);

          if (snapshot.metadata.fromCache && snapshot.docs.length === 0 && cachedHouseholds.length > 0) {
            callback(sortByCreatedAt(cachedHouseholds));
            return;
          }

          const households = await Promise.all(
            snapshot.docs.map(async (membershipDoc) => {
              const householdId = membershipDoc.data().householdId as string | undefined;

              if (!householdId) {
                return null;
              }

              const householdSnapshot = await getDoc(doc(db, "households", householdId));

              if (!householdSnapshot.exists()) {
                return null;
              }

              return dataWithId<Household>(householdSnapshot.id, householdSnapshot.data());
            }),
          );

          const membershipHouseholds = households.filter((household): household is Household => household !== null);
          const membershipIds = new Set(membershipHouseholds.map((household) => household.id));

          for (const [householdId, household] of householdMap.entries()) {
            const hasMemberIdFallback = (household.memberIds ?? []).includes(userId);

            if (!membershipIds.has(householdId) && !hasMemberIdFallback) {
              householdMap.delete(householdId);
            }
          }

          membershipHouseholds.forEach((household) => {
            householdMap.set(household.id, household);
          });

          emit();
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error("Could not load households from membership records."));
        }
      })();
    },
    (error) => {
      onError?.(error);
    },
  );

  return () => {
    householdsUnsubscribe();
    membershipsUnsubscribe();
  };
}

export function subscribeHouseholdMembers(householdId: string, callback: (members: HouseholdMember[]) => void) {
  const membersQuery = query(collection(db, "householdMembers"), where("householdId", "==", householdId));

  return onSnapshot(membersQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => dataWithId<HouseholdMember>(item.id, item.data())));
  });
}

export async function ensureMonthlyList(householdId: string, monthKey: string) {
  const listId = buildMonthlyListId(householdId, monthKey);
  const listRef = doc(db, "lists", listId);
  debugMonthlyRecurring("ensure-monthly-list-upsert-start", {
    householdId,
    monthKey,
    listId,
  });

  await setDoc(
    listRef,
    {
      householdId,
      name: `Monthly list - ${monthKey}`,
      type: "monthly",
      monthKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  debugMonthlyRecurring("ensure-monthly-list-upsert-finished", {
    householdId,
    monthKey,
    listId,
  });

  await syncRecurringTemplatesIntoMonthlyList(householdId, listId, monthKey);

  return listId;
}

export function subscribeList(listId: string, callback: (list: ShoppingList | null) => void) {
  return onSnapshot(doc(db, "lists", listId), (snapshot) => {
    callback(snapshot.exists() ? dataWithId<ShoppingList>(snapshot.id, snapshot.data()) : null);
  });
}

export function subscribeListItems(
  householdId: string,
  listId: string,
  callback: (items: ShoppingItem[]) => void,
  onError?: (error: Error) => void,
) {
  const itemsQuery = query(collection(db, "listItems"), where("householdId", "==", householdId));
  const unsubscribeCacheListener = subscribeListItemCacheChanges(householdId, listId, callback);

  void hydrateCachedCollection(() => readCachedListItems(householdId, listId), (items) => {
    reconcileBoughtItemCleanupTimers(householdId, listId, items);
    debugMonthlyRecurring("subscribe-list-items-hydrate-cache", {
      householdId,
      listId,
      cachedItemCount: items.length,
      cachedItems: items.map((item) => ({
        id: item.id,
        title: item.title,
        bought: item.bought,
        pendingSync: item.pendingSync ?? false,
      })),
    });
    callback(sortByCreatedAt(items));
  });

  const unsubscribeSnapshot = onSnapshot(
    itemsQuery,
    (snapshot) => {
      void (async () => {
        const pendingDeletedIds = await readPendingDeletionIds("deleteListItem");
        const pendingUpdateMap = await readPendingListItemUpdateMap();
        const pendingToggleMap = await readPendingListItemToggleMap();
        const remoteItems = snapshot.docs
          .map((item) => dataWithId<ShoppingItem>(item.id, item.data()))
          .filter((item) => item.listId === listId && !pendingDeletedIds.has(item.id));
        const cachedItems = await readCachedListItems(householdId, listId);
        const filteredCachedItems = cachedItems.filter((item) => !pendingDeletedIds.has(item.id));
        const items =
          snapshot.metadata.fromCache && remoteItems.length === 0 && filteredCachedItems.length > 0
            ? sortByCreatedAt(filteredCachedItems)
            : sortByCreatedAt(mergeRemoteWithPendingById(remoteItems, filteredCachedItems));
        const resolvedItems = await removeExpiredBoughtItems(await clearSyncedPendingListItems(applyPendingListItemState(items, pendingUpdateMap, pendingToggleMap)));

        await writeCachedListItems(householdId, listId, resolvedItems);
        reconcileBoughtItemCleanupTimers(householdId, listId, resolvedItems);
        debugMonthlyRecurring("subscribe-list-items-snapshot", {
          householdId,
          listId,
          snapshotDocCount: snapshot.docs.length,
          remoteItemCount: remoteItems.length,
          mergedItemCount: items.length,
          resolvedItemCount: resolvedItems.length,
          fromCache: snapshot.metadata.fromCache,
          resolvedItems: resolvedItems.map((item) => ({
            id: item.id,
            title: item.title,
            bought: item.bought,
            pendingSync: item.pendingSync ?? false,
            listId: item.listId,
          })),
        });
        callback(resolvedItems);
      })();
    },
    (error) => {
      onError?.(error);
    },
  );

  return () => {
    unsubscribeCacheListener();
    unsubscribeSnapshot();
  };
}

async function performAddListItem(input: {
  itemId?: string;
  templateId?: string;
  productSnapshotId?: string;
  householdId: string;
  listId: string;
  title: string;
  note?: string;
  quantity?: number | null;
  storeName?: string;
  userId: string;
  addToTemplate?: boolean;
  productSnapshot?: ProductSnapshot | null;
  bought?: boolean;
}) {
  const itemRef = doc(db, "listItems", input.itemId ?? doc(collection(db, "listItems")).id);
  const batch = writeBatch(db);
  let snapshotId: string | null = null;

  if (input.productSnapshot) {
    snapshotId = input.productSnapshotId ?? doc(collection(db, "productSnapshots")).id;
    batch.set(doc(db, "productSnapshots", snapshotId), {
      ...input.productSnapshot,
      householdId: input.householdId,
      createdAt: serverTimestamp(),
    });
  }

  batch.set(itemRef, {
    householdId: input.householdId,
    listId: input.listId,
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    quantity: input.quantity ?? null,
    storeName: input.storeName?.trim() ?? "",
    bought: input.bought ?? false,
    boughtAt: input.bought ? serverTimestamp() : null,
    createdBy: input.userId,
    productSnapshotId: snapshotId,
    productSnapshot: input.productSnapshot ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.addToTemplate) {
    batch.set(doc(db, "monthlyTemplates", input.templateId ?? doc(collection(db, "monthlyTemplates")).id), {
      householdId: input.householdId,
      title: input.title.trim(),
      note: input.note?.trim() ?? "",
      quantity: input.quantity ?? null,
      storeName: input.storeName?.trim() ?? "",
      createdBy: input.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  return itemRef.id;
}

export async function addListItem(input: {
  householdId: string;
  listId: string;
  title: string;
  note?: string;
  quantity?: number | null;
  storeName?: string;
  userId: string;
  addToTemplate?: boolean;
  productSnapshot?: ProductSnapshot | null;
  ensureList?: "ongoing" | "monthly";
  monthKey?: string;
  preferOffline?: boolean;
}) {
  const itemId = doc(collection(db, "listItems")).id;
  const productSnapshotId = input.productSnapshot ? doc(collection(db, "productSnapshots")).id : null;
  const templateId = input.addToTemplate ? doc(collection(db, "monthlyTemplates")).id : null;

  try {
    if (input.preferOffline) {
      throw new Error("client is offline");
    }

    await performAddListItem({
      ...input,
      itemId,
      productSnapshotId: productSnapshotId ?? undefined,
      templateId: templateId ?? undefined,
    });

    const createdItem = buildPendingItem({
      itemId,
      householdId: input.householdId,
      listId: input.listId,
      title: input.title,
      note: input.note,
      quantity: input.quantity,
      storeName: input.storeName,
      userId: input.userId,
      productSnapshotId,
      productSnapshot: input.productSnapshot,
      pendingSync: false,
    });

    await cacheListItem(createdItem);

    if (input.addToTemplate && templateId) {
      const cachedTemplates = await readCachedTemplates(input.householdId);
      const template = {
        id: templateId,
        householdId: input.householdId,
        title: input.title.trim(),
        note: input.note?.trim() ?? "",
        quantity: input.quantity ?? null,
        storeName: input.storeName?.trim() ?? "",
        createdBy: input.userId,
        createdAt: createdItem.createdAt as string,
        updatedAt: createdItem.updatedAt as string,
        pendingSync: false,
      };

      await writeCachedTemplates(input.householdId, sortByCreatedAt(mergeById([template], cachedTemplates)));
    }

    return createdItem;
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      throw error;
    }

    const localItem = buildPendingItem({
      itemId,
      householdId: input.householdId,
      listId: input.listId,
      title: input.title,
      note: input.note,
      quantity: input.quantity,
      storeName: input.storeName,
      userId: input.userId,
      productSnapshotId,
      productSnapshot: input.productSnapshot,
    });

    await cacheListItem(localItem);

    if (input.addToTemplate && templateId) {
      const cachedTemplates = await readCachedTemplates(input.householdId);
      const template = {
        id: templateId,
        householdId: input.householdId,
        title: input.title.trim(),
        note: input.note?.trim() ?? "",
        quantity: input.quantity ?? null,
        storeName: input.storeName?.trim() ?? "",
        createdBy: input.userId,
        createdAt: localItem.createdAt as string,
        updatedAt: localItem.updatedAt as string,
        pendingSync: true,
      };

      await writeCachedTemplates(input.householdId, sortByCreatedAt(mergeById([template], cachedTemplates)));
    }

    const pendingMutation: PendingAddListItemMutation = {
      id: itemId,
      kind: "addListItem",
      createdAt: localItem.createdAt as string,
      ensureList: input.ensureList ?? "ongoing",
      monthKey: input.monthKey,
      item: localItem,
      productSnapshotDocument: input.productSnapshot
        ? {
            id: productSnapshotId as string,
            householdId: input.householdId,
            createdAt: localItem.createdAt as string,
            ...input.productSnapshot,
          }
        : null,
      templateDocument:
        input.addToTemplate && templateId
          ? {
              id: templateId,
              householdId: input.householdId,
              title: input.title.trim(),
              note: input.note?.trim() ?? "",
              quantity: input.quantity ?? null,
              storeName: input.storeName?.trim() ?? "",
              createdBy: input.userId,
              createdAt: localItem.createdAt as string,
              updatedAt: localItem.updatedAt as string,
            }
          : null,
    };

    await enqueuePendingMutation(pendingMutation);
    return localItem;
  }
}

export async function updateListItem(
  item: ShoppingItem,
  changes: {
    title?: string;
    note?: string;
    quantity?: number | null;
    storeName?: string;
    productSnapshot?: ProductSnapshot | null;
  },
  preferOffline = false,
) {
  const pendingMutations = await readPendingMutations();
  const pendingAddMutation = getPendingAddListItemMutation(pendingMutations, item.id);

  if (pendingAddMutation) {
    const baseItem = buildUpdatedListItem(item, changes);
    const nextSnapshotDocument = baseItem.productSnapshot
      ? pendingAddMutation.productSnapshotDocument ?? {
          id: baseItem.productSnapshotId ?? doc(collection(db, "productSnapshots")).id,
          householdId: item.householdId,
          createdAt: pendingAddMutation.createdAt,
          ...baseItem.productSnapshot,
        }
      : null;
    const queuedItem = {
      ...baseItem,
      productSnapshotId: nextSnapshotDocument?.id,
      pendingSync: true,
    } satisfies ShoppingItem;
    const nextMutations = pendingMutations.map((mutation) => {
      if (mutation.kind !== "addListItem" || mutation.item.id !== item.id) {
        return mutation;
      }

      return {
        ...mutation,
        item: {
          ...mutation.item,
          title: queuedItem.title,
          note: queuedItem.note,
          quantity: queuedItem.quantity ?? null,
          storeName: queuedItem.storeName ?? "",
          productSnapshotId: queuedItem.productSnapshotId,
          productSnapshot: queuedItem.productSnapshot ?? null,
          updatedAt: queuedItem.updatedAt,
        },
        productSnapshotDocument: nextSnapshotDocument,
        templateDocument: mutation.templateDocument
          ? {
              ...mutation.templateDocument,
              title: queuedItem.title,
              note: queuedItem.note,
              quantity: queuedItem.quantity ?? null,
              storeName: queuedItem.storeName ?? "",
              updatedAt: queuedItem.updatedAt as string,
            }
          : null,
      };
    });

    await cacheListItem(queuedItem);
    await writePendingMutations(nextMutations);
    return { pendingSync: true, item: queuedItem };
  }

  const updatedItem = buildUpdatedListItem(item, changes);
  await cacheListItem(updatedItem);

  try {
    if (preferOffline) {
      throw new Error("client is offline");
    }

    await updateDoc(doc(db, "listItems", item.id), {
      title: updatedItem.title,
      note: updatedItem.note ?? "",
      quantity: updatedItem.quantity ?? null,
      storeName: updatedItem.storeName ?? "",
      productSnapshotId: updatedItem.productSnapshotId ?? null,
      productSnapshot: updatedItem.productSnapshot ?? null,
      updatedAt: serverTimestamp(),
    });

    await removePendingMutationsByPrefix(`update-list-item:${item.id}`);
    return { pendingSync: false, item: updatedItem };
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      await cacheListItem(item);
      throw error;
    }

    const pendingMutation: PendingUpdateListItemMutation = {
      id: `update-list-item:${item.id}`,
      kind: "updateListItem",
      createdAt: isoNow(),
      item: updatedItem,
    };

    await upsertPendingMutation(pendingMutation);
    return { pendingSync: true, item: updatedItem };
  }
}

export async function toggleListItem(item: ShoppingItem, bought: boolean, preferOffline = false) {
  return await toggleListItemState(item, bought, preferOffline);
}

async function toggleListItemState(item: ShoppingItem, bought: boolean, preferOffline = false) {
  const boughtAt = bought ? item.boughtAt ?? isoNow() : null;
  const updatedItem = {
    ...item,
    bought,
    boughtAt,
    updatedAt: isoNow(),
  } satisfies ShoppingItem;

  await cacheListItem(updatedItem);

  if (item.pendingSync) {
    const pendingMutations = await readPendingMutations();
    const nextMutations = pendingMutations.map((mutation) =>
      mutation.kind === "addListItem" && mutation.item.id === item.id
        ? {
            ...mutation,
            item: {
              ...mutation.item,
              bought,
              boughtAt,
              updatedAt: updatedItem.updatedAt,
            },
          }
        : mutation,
    );

    await writePendingMutations(nextMutations);
    return { pendingSync: true, item: updatedItem };
  }

  try {
    if (preferOffline) {
      throw new Error("client is offline");
    }

    await updateDoc(doc(db, "listItems", item.id), {
      bought,
      boughtAt: bought ? item.boughtAt ?? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });

    await removePendingMutationsByPrefix(`toggle-list-item:${item.id}`);
    return { pendingSync: false, item: updatedItem };
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      await cacheListItem(item);
      throw error;
    }

    const pendingMutation: PendingToggleListItemMutation = {
      id: `toggle-list-item:${item.id}`,
      kind: "toggleListItem",
      createdAt: isoNow(),
      householdId: item.householdId,
      listId: item.listId,
      itemId: item.id,
      bought,
      boughtAt: boughtAt as string | null,
      updatedAt: updatedItem.updatedAt as string,
    };

    await upsertPendingMutation(pendingMutation);
    return { pendingSync: true, item: updatedItem };
  }
}

export async function deleteListItem(item: ShoppingItem, preferOffline = false) {
  const pendingMutations = await readPendingMutations();
  const pendingAddMutation = getPendingAddListItemMutation(pendingMutations, item.id);

  if (item.pendingSync && pendingAddMutation) {
    await removeCachedListItem(item);
    await writePendingMutations(pendingMutations.filter((mutation) => !isListItemMutationForItem(mutation, item.id)));
    return { pendingSync: false };
  }

  const pendingMutation: PendingDeleteListItemMutation = {
    id: `delete-list-item:${item.id}`,
    kind: "deleteListItem",
    createdAt: isoNow(),
    householdId: item.householdId,
    listId: item.listId,
    itemId: item.id,
  };
  const nextPendingMutations = [
    ...pendingMutations.filter((mutation) => {
      if (mutation.kind === "updateListItem" && mutation.item.id === item.id) {
        return false;
      }

      if (mutation.kind === "toggleListItem" && mutation.itemId === item.id) {
        return false;
      }

      if (mutation.kind === "deleteListItem" && mutation.itemId === item.id) {
        return false;
      }

      return true;
    }),
    pendingMutation,
  ];

  await writePendingMutations(nextPendingMutations);
  await removeCachedListItem(item);

  try {
    if (preferOffline) {
      throw new Error("client is offline");
    }

    await deleteDoc(doc(db, "listItems", item.id));
    await removePendingMutation(pendingMutation.id);
    return { pendingSync: false };
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      await writePendingMutations(pendingMutations);
      await cacheListItem(item);
      throw error;
    }

    return { pendingSync: true };
  }
}

export async function untickAllListItems(householdId: string, listId: string) {
  const itemsQuery = query(collection(db, "listItems"), where("householdId", "==", householdId));
  const snapshot = await getDocs(itemsQuery);
  const batch = writeBatch(db);

  snapshot.docs
    .filter((item) => item.data().listId === listId && item.data().bought === true)
    .forEach((item) => {
      batch.update(item.ref, {
        bought: false,
        boughtAt: null,
        updatedAt: serverTimestamp(),
      });
    });

  await batch.commit();
}

export function subscribeTemplates(householdId: string, callback: (templates: MonthlyTemplate[]) => void) {
  const templateQuery = query(collection(db, "monthlyTemplates"), where("householdId", "==", householdId));

  void hydrateCachedCollection(() => readCachedTemplates(householdId), (templates) => {
    debugMonthlyRecurring("subscribe-templates-hydrate-cache", {
      householdId,
      cachedTemplateCount: templates.length,
      cachedTemplates: templates.map((template) => ({
        id: template.id,
        title: template.title,
        quantity: template.quantity ?? null,
        storeName: template.storeName ?? "",
        pendingSync: template.pendingSync ?? false,
      })),
    });
    callback(sortByCreatedAt(templates));
  });

  return onSnapshot(templateQuery, (snapshot) => {
    void (async () => {
      const pendingDeletedIds = await readPendingDeletionIds("deleteMonthlyTemplate");
      const remoteTemplates = snapshot.docs
        .map((item) => dataWithId<MonthlyTemplate>(item.id, item.data()))
        .filter((item) => !pendingDeletedIds.has(item.id));
      const cachedTemplates = await readCachedTemplates(householdId);
      const filteredCachedTemplates = cachedTemplates.filter((template) => !pendingDeletedIds.has(template.id));
      const templates =
        snapshot.metadata.fromCache && remoteTemplates.length === 0 && filteredCachedTemplates.length > 0
          ? sortByCreatedAt(filteredCachedTemplates)
          : sortByCreatedAt(mergeRemoteWithPendingById(remoteTemplates, filteredCachedTemplates));

      await writeCachedTemplates(householdId, templates);
      debugMonthlyRecurring("subscribe-templates-snapshot", {
        householdId,
        snapshotDocCount: snapshot.docs.length,
        remoteTemplateCount: remoteTemplates.length,
        mergedTemplateCount: templates.length,
        fromCache: snapshot.metadata.fromCache,
        templates: templates.map((template) => ({
          id: template.id,
          title: template.title,
          quantity: template.quantity ?? null,
          storeName: template.storeName ?? "",
          pendingSync: template.pendingSync ?? false,
        })),
      });
      callback(templates);
    })();
  });
}

export async function deleteMonthlyTemplate(template: MonthlyTemplate) {
  const pendingMutations = await readPendingMutations();
  const nextMutationsWithoutTemplate = pendingMutations.flatMap((mutation) => {
    if (mutation.kind === "addListItem" && mutation.templateDocument?.id === template.id) {
      return [
        {
          ...mutation,
          templateDocument: null,
        },
      ];
    }

    if (mutation.kind === "deleteMonthlyTemplate" && mutation.templateId === template.id) {
      return [];
    }

    return [mutation];
  });

  if (template.pendingSync) {
    await removeCachedTemplate(template);
    await writePendingMutations(nextMutationsWithoutTemplate);
    return { pendingSync: false };
  }

  const pendingMutation: PendingDeleteMonthlyTemplateMutation = {
    id: `delete-monthly-template:${template.id}`,
    kind: "deleteMonthlyTemplate",
    createdAt: isoNow(),
    householdId: template.householdId,
    templateId: template.id,
  };

  await writePendingMutations([...nextMutationsWithoutTemplate, pendingMutation]);
  await removeCachedTemplate(template);

  try {
    await deleteDoc(doc(db, "monthlyTemplates", template.id));
    await removePendingMutation(pendingMutation.id);
    return { pendingSync: false };
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      await writePendingMutations(pendingMutations);
      const cachedTemplates = await readCachedTemplates(template.householdId);
      await writeCachedTemplates(template.householdId, sortByCreatedAt(mergeById([template], cachedTemplates)));
      throw error;
    }

    return { pendingSync: true };
  }
}

export function subscribeSavedProducts(
  householdId: string,
  callback: (products: SavedProduct[]) => void,
  onError?: (error: Error) => void,
) {
  const productsQuery = query(collection(db, "savedProducts"), where("householdId", "==", householdId));

  void hydrateCachedCollection(() => readCachedSavedProducts(householdId), (products) => {
    callback(sortByUpdatedAtDesc(products));
  });

  return onSnapshot(
    productsQuery,
    (snapshot) => {
      void (async () => {
        const pendingDeletedIds = await readPendingDeletionIds("deleteSavedProduct");
        const remoteProducts = snapshot.docs
          .map((item) => dataWithId<SavedProduct>(item.id, item.data()))
          .filter((item) => !pendingDeletedIds.has(item.id));
        const cachedProducts = await readCachedSavedProducts(householdId);
        const filteredCachedProducts = cachedProducts.filter((product) => !pendingDeletedIds.has(product.id));
        const products =
          snapshot.metadata.fromCache && remoteProducts.length === 0 && filteredCachedProducts.length > 0
            ? sortByUpdatedAtDesc(filteredCachedProducts)
            : sortByUpdatedAtDesc(mergeRemoteWithPendingById(remoteProducts, filteredCachedProducts));

        await writeCachedSavedProducts(householdId, products);
        callback(products);
      })();
    },
    (error) => {
      onError?.(error);
    },
  );
}

async function performSaveSavedProduct(input: {
  savedProductId?: string;
  householdId: string;
  userId: string;
  title: string;
  note?: string;
  quantity?: number | null;
  storeName?: string;
  productSnapshot?: ProductSnapshot | null;
}) {
  const savedProductRef = doc(db, "savedProducts", input.savedProductId ?? doc(collection(db, "savedProducts")).id);

  await setDoc(savedProductRef, {
    householdId: input.householdId,
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    quantity: input.quantity ?? null,
    storeName: input.storeName?.trim() ?? "",
    brand: input.productSnapshot?.brand ?? "",
    price: input.productSnapshot?.price ?? null,
    currency: input.productSnapshot?.currency ?? null,
    imageUrl: input.productSnapshot?.imageUrl ?? null,
    sourceName: input.productSnapshot?.sourceName ?? "Saved manually",
    sourceProductId: input.productSnapshot?.sourceProductId ?? null,
    productUrl: input.productSnapshot?.productUrl ?? null,
    createdBy: input.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return savedProductRef.id;
}

export async function saveSavedProduct(input: {
  householdId: string;
  userId: string;
  title: string;
  note?: string;
  quantity?: number | null;
  storeName?: string;
  productSnapshot?: ProductSnapshot | null;
}) {
  const savedProductId = doc(collection(db, "savedProducts")).id;

  try {
    await performSaveSavedProduct({
      ...input,
      savedProductId,
    });

    const savedProduct = buildPendingSavedProduct({
      savedProductId,
      householdId: input.householdId,
      userId: input.userId,
      title: input.title,
      note: input.note,
      quantity: input.quantity,
      storeName: input.storeName,
      productSnapshot: input.productSnapshot,
      pendingSync: false,
    });

    await cacheSavedProduct(savedProduct);
    return savedProduct;
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      throw error;
    }

    const localProduct = buildPendingSavedProduct({
      savedProductId,
      householdId: input.householdId,
      userId: input.userId,
      title: input.title,
      note: input.note,
      quantity: input.quantity,
      storeName: input.storeName,
      productSnapshot: input.productSnapshot,
    });

    await cacheSavedProduct(localProduct);

    const pendingMutation: PendingSaveSavedProductMutation = {
      id: savedProductId,
      kind: "saveSavedProduct",
      createdAt: localProduct.createdAt as string,
      product: localProduct,
    };

    await enqueuePendingMutation(pendingMutation);
    return localProduct;
  }
}

export async function deleteSavedProduct(product: SavedProduct) {
  if (product.pendingSync) {
    await removeCachedSavedProduct(product);
    await removePendingMutation(product.id);
    return { pendingSync: false };
  }

  const pendingMutation: PendingDeleteSavedProductMutation = {
    id: `delete-saved-product:${product.id}`,
    kind: "deleteSavedProduct",
    createdAt: isoNow(),
    householdId: product.householdId,
    productId: product.id,
  };

  await upsertPendingMutation(pendingMutation);
  await removeCachedSavedProduct(product);

  try {
    await deleteDoc(doc(db, "savedProducts", product.id));
    await removePendingMutation(pendingMutation.id);
    return { pendingSync: false };
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      await removePendingMutation(pendingMutation.id);
      await cacheSavedProduct(product);
      throw error;
    }
    return { pendingSync: true };
  }
}

export function subscribeReceipts(householdId: string, callback: (receipts: ReceiptEntry[]) => void) {
  const receiptQuery = query(collection(db, "receipts"), where("householdId", "==", householdId));

  void hydrateCachedCollection(() => readCachedReceipts(householdId), (receipts) => {
    callback(sortReceipts(receipts));
  });

  return onSnapshot(receiptQuery, (snapshot) => {
    void (async () => {
      const remoteReceipts = snapshot.docs.map((item) => dataWithId<ReceiptEntry>(item.id, item.data()));
      const cachedReceipts = await readCachedReceipts(householdId);
      const receipts =
        snapshot.metadata.fromCache && remoteReceipts.length === 0 && cachedReceipts.length > 0
          ? sortReceipts(cachedReceipts)
          : sortReceipts(mergeRemoteWithPendingById(remoteReceipts, cachedReceipts));

      await writeCachedReceipts(householdId, receipts);
      callback(receipts);
    })();
  });
}

async function performCreateReceipt(input: {
  receiptId?: string;
  householdId: string;
  userId: string;
  total: number;
  currency: string;
  purchaseDate: string;
  linkedMonth?: string | null;
  storeName?: string;
  note?: string;
}) {
  const receiptRef = doc(db, "receipts", input.receiptId ?? doc(collection(db, "receipts")).id);

  await setDoc(receiptRef, {
    householdId: input.householdId,
    total: input.total,
    currency: input.currency,
    purchaseDate: input.purchaseDate,
    linkedMonth: input.linkedMonth ?? null,
    storeName: input.storeName?.trim() ?? "",
    note: input.note?.trim() ?? "",
    imagePath: null,
    imageUrl: null,
    createdBy: input.userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return receiptRef.id;
}

export async function createReceipt(input: {
  householdId: string;
  userId: string;
  total: number;
  currency: string;
  purchaseDate: string;
  linkedMonth?: string;
  storeName?: string;
  note?: string;
}) {
  const receiptId = doc(collection(db, "receipts")).id;

  try {
    await performCreateReceipt({
      ...input,
      receiptId,
    });

    const receipt = buildPendingReceipt({
      receiptId,
      householdId: input.householdId,
      userId: input.userId,
      total: input.total,
      currency: input.currency,
      purchaseDate: input.purchaseDate,
      linkedMonth: input.linkedMonth,
      storeName: input.storeName,
      note: input.note,
      pendingSync: false,
    });

    const cachedReceipts = await readCachedReceipts(input.householdId);
    await writeCachedReceipts(input.householdId, sortReceipts(mergeById([receipt], cachedReceipts)));
    return receipt;
  } catch (error) {
    if (!isLikelyOfflineError(error)) {
      throw error;
    }

    const localReceipt = buildPendingReceipt({
      receiptId,
      householdId: input.householdId,
      userId: input.userId,
      total: input.total,
      currency: input.currency,
      purchaseDate: input.purchaseDate,
      linkedMonth: input.linkedMonth,
      storeName: input.storeName,
      note: input.note,
    });

    const cachedReceipts = await readCachedReceipts(input.householdId);
    await writeCachedReceipts(input.householdId, sortReceipts(mergeById([localReceipt], cachedReceipts)));

    const pendingMutation: PendingCreateReceiptMutation = {
      id: receiptId,
      kind: "createReceipt",
      createdAt: localReceipt.createdAt as string,
      receipt: localReceipt,
    };

    await enqueuePendingMutation(pendingMutation);
    return localReceipt;
  }
}

export async function updateReceipt(input: {
  receiptId: string;
  total: number;
  currency: string;
  purchaseDate: string;
  linkedMonth?: string;
  storeName?: string;
  note?: string;
}) {
  await updateDoc(doc(db, "receipts", input.receiptId), {
    total: input.total,
    currency: input.currency,
    purchaseDate: input.purchaseDate,
    linkedMonth: input.linkedMonth ?? null,
    storeName: input.storeName?.trim() ?? "",
    note: input.note?.trim() ?? "",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReceipt(receiptId: string) {
  await deleteDoc(doc(db, "receipts", receiptId));
}

async function syncAddListItemMutation(mutation: PendingAddListItemMutation) {
  if (mutation.ensureList === "ongoing") {
    await ensureOngoingList(mutation.item.householdId);
  } else if (mutation.ensureList === "monthly" && mutation.monthKey) {
    await ensureMonthlyList(mutation.item.householdId, mutation.monthKey);
  }

  await performAddListItem({
    itemId: mutation.item.id,
    templateId: mutation.templateDocument?.id,
    productSnapshotId: mutation.productSnapshotDocument?.id,
    householdId: mutation.item.householdId,
    listId: mutation.item.listId,
    title: mutation.item.title,
    note: mutation.item.note,
    quantity: typeof mutation.item.quantity === "number" ? mutation.item.quantity : Number(mutation.item.quantity ?? 0) || null,
    storeName: mutation.item.storeName,
    userId: mutation.item.createdBy,
    addToTemplate: !!mutation.templateDocument,
    productSnapshot: mutation.item.productSnapshot ?? null,
    bought: mutation.item.bought,
  });

  await cacheListItem({
    ...mutation.item,
    pendingSync: false,
  });

  if (mutation.templateDocument) {
    const cachedTemplates = await readCachedTemplates(mutation.item.householdId);
    await writeCachedTemplates(
      mutation.item.householdId,
      sortByCreatedAt(
        mergeById(
          [
            {
              ...mutation.templateDocument,
              pendingSync: false,
            },
          ],
          cachedTemplates,
        ),
      ),
    );
  }
}

async function syncSaveSavedProductMutation(mutation: PendingSaveSavedProductMutation) {
  await performSaveSavedProduct({
    savedProductId: mutation.product.id,
    householdId: mutation.product.householdId,
    userId: mutation.product.createdBy,
    title: mutation.product.title,
    note: mutation.product.note,
    quantity: typeof mutation.product.quantity === "number" ? mutation.product.quantity : Number(mutation.product.quantity ?? 0) || null,
    storeName: mutation.product.storeName ?? undefined,
    productSnapshot:
      mutation.product.sourceName === "Saved manually"
        ? null
        : {
            title: mutation.product.title,
            brand: mutation.product.brand ?? "",
            storeName: mutation.product.storeName ?? "",
            price: mutation.product.price ?? null,
            currency: mutation.product.currency ?? null,
            imageUrl: mutation.product.imageUrl ?? null,
            sourceName: mutation.product.sourceName,
            sourceProductId: mutation.product.sourceProductId ?? null,
            productUrl: mutation.product.productUrl ?? null,
          },
  });

  await cacheSavedProduct({
    ...mutation.product,
    pendingSync: false,
  });
}

async function syncCreateReceiptMutation(mutation: PendingCreateReceiptMutation) {
  await performCreateReceipt({
    receiptId: mutation.receipt.id,
    householdId: mutation.receipt.householdId,
    userId: mutation.receipt.createdBy,
    total: mutation.receipt.total,
    currency: mutation.receipt.currency,
    purchaseDate: mutation.receipt.purchaseDate,
    linkedMonth: mutation.receipt.linkedMonth,
    storeName: mutation.receipt.storeName,
    note: mutation.receipt.note,
  });
}

async function syncDeleteListItemMutation(mutation: PendingDeleteListItemMutation) {
  await deleteDoc(doc(db, "listItems", mutation.itemId));
}

async function syncDeleteSavedProductMutation(mutation: PendingDeleteSavedProductMutation) {
  await deleteDoc(doc(db, "savedProducts", mutation.productId));
}

async function syncDeleteMonthlyTemplateMutation(mutation: PendingDeleteMonthlyTemplateMutation) {
  await deleteDoc(doc(db, "monthlyTemplates", mutation.templateId));
}

async function syncToggleListItemMutation(mutation: PendingToggleListItemMutation) {
  await updateDoc(doc(db, "listItems", mutation.itemId), {
    bought: mutation.bought,
    boughtAt: mutation.bought ? mutation.boughtAt ?? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

async function syncUpdateListItemMutation(mutation: PendingUpdateListItemMutation) {
  await updateDoc(doc(db, "listItems", mutation.item.id), {
    title: mutation.item.title,
    note: mutation.item.note?.trim() ?? "",
    quantity: mutation.item.quantity ?? null,
    storeName: mutation.item.storeName?.trim() ?? "",
    productSnapshotId: mutation.item.productSnapshotId ?? null,
    productSnapshot: mutation.item.productSnapshot ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function syncPendingMutations() {
  const pendingMutations = sortByCreatedAt(await readPendingMutations());

  for (const mutation of pendingMutations) {
    try {
      if (mutation.kind === "addListItem") {
        await syncAddListItemMutation(mutation);
      } else if (mutation.kind === "saveSavedProduct") {
        await syncSaveSavedProductMutation(mutation);
      } else if (mutation.kind === "createReceipt") {
        await syncCreateReceiptMutation(mutation);
      } else if (mutation.kind === "deleteListItem") {
        await syncDeleteListItemMutation(mutation);
      } else if (mutation.kind === "deleteSavedProduct") {
        await syncDeleteSavedProductMutation(mutation);
      } else if (mutation.kind === "deleteMonthlyTemplate") {
        await syncDeleteMonthlyTemplateMutation(mutation);
      } else if (mutation.kind === "toggleListItem") {
        await syncToggleListItemMutation(mutation);
      } else if (mutation.kind === "updateListItem") {
        await syncUpdateListItemMutation(mutation);
      }

      await removePendingMutation(mutation.id);
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        break;
      }

      throw error;
    }
  }
}

export async function searchProducts(queryText: string): Promise<ProductSnapshot[]> {
  const queryValue = queryText.trim();

  if (!queryValue) {
    return [];
  }

  const proxyBaseUrl = process.env.EXPO_PUBLIC_PRODUCT_SEARCH_API_BASE_URL?.trim();
  const endpoint = proxyBaseUrl
    ? `${proxyBaseUrl.replace(/\/+$/, "")}/api/products/search?q=${encodeURIComponent(queryValue)}`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(queryValue)}&search_simple=1&action=process&json=1&page_size=12`;

  let response: Response;

  try {
    response = await fetch(endpoint);
  } catch {
    throw new Error(
      proxyBaseUrl
        ? "Your product-search backend could not be reached. Check that the Render service is running and the API base URL is correct."
        : "Public product search is blocked in the browser right now. This usually means the source denied the web request or CORS blocked it. Manual item entry still works.",
    );
  }

  if (!response.ok) {
    let backendMessage = "";

    try {
      const errorBody = await response.json();
      backendMessage =
        typeof errorBody?.error === "string"
          ? errorBody.error
          : typeof errorBody?.message === "string"
            ? errorBody.message
            : "";
    } catch {
      try {
        backendMessage = await response.text();
      } catch {
        backendMessage = "";
      }
    }

    throw new Error(
      proxyBaseUrl
        ? backendMessage || `The product-search backend returned ${response.status}. Please try again later or add the item manually.`
        : "The public product source is currently unavailable. Please try again later or add the item manually.",
    );
  }

  const data = await response.json();

  if (proxyBaseUrl) {
    const results = Array.isArray(data.results) ? (data.results as ProductSnapshot[]) : [];
    return results;
  }

  const products = Array.isArray(data.products) ? (data.products as Array<Record<string, unknown>>) : [];

  return products
    .filter((product) => product.product_name)
    .map((product) => ({
      title: product.product_name as string,
      brand: (product.brands as string | undefined)?.split(",")[0]?.trim() ?? "",
      storeName: null,
      price: null,
      currency: null,
      imageUrl: (product.image_front_small_url as string | undefined) ?? (product.image_url as string | undefined) ?? null,
      sourceName: "Open Food Facts",
      sourceProductId: (product.code as string | undefined) ?? null,
      productUrl: typeof product.url === "string" ? product.url : null,
    }));
}

export async function searchProductByBarcode(barcodeText: string): Promise<ProductSnapshot[]> {
  const barcode = barcodeText.trim();

  if (!barcode) {
    return [];
  }

  const proxyBaseUrl = process.env.EXPO_PUBLIC_PRODUCT_SEARCH_API_BASE_URL?.trim();

  if (!proxyBaseUrl) {
    throw new Error("Barcode lookup needs the Render product-search backend. Add EXPO_PUBLIC_PRODUCT_SEARCH_API_BASE_URL and restart the app.");
  }

  const endpoint = `${proxyBaseUrl.replace(/\/+$/, "")}/api/products/barcode/${encodeURIComponent(barcode)}`;
  let response: Response;

  try {
    response = await fetch(endpoint);
  } catch {
    throw new Error("Your product-search backend could not be reached for barcode lookup. Check that the Render service is running.");
  }

  if (!response.ok) {
    let backendMessage = "";

    try {
      const errorBody = await response.json();
      backendMessage =
        typeof errorBody?.error === "string"
          ? errorBody.error
          : typeof errorBody?.message === "string"
            ? errorBody.message
            : "";
    } catch {
      try {
        backendMessage = await response.text();
      } catch {
        backendMessage = "";
      }
    }

    throw new Error(backendMessage || `Barcode lookup backend returned ${response.status}.`);
  }

const data = await response.json();
return Array.isArray(data.results) ? (data.results as ProductSnapshot[]) : [];
}
