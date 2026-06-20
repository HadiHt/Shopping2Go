import type {
  Household,
  NullableTimestamp,
  ProductSnapshot,
  ReceiptEntry,
  SavedProduct,
  SessionUser,
  ShoppingItem,
  UserProfile,
} from "@/types/models";

export const ACTIVE_HOUSEHOLD_KEY = "shopping2go.active-household";

const SESSION_USER_KEY = "shopping2go.session-user";
const PENDING_MUTATIONS_KEY = "shopping2go.pending-mutations";

type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

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

type PendingTemplateDocument = {
  id: string;
  householdId: string;
  title: string;
  note?: string;
  quantity?: number | string | null;
  storeName?: string;
  createdBy?: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
  pendingSync?: boolean;
};

type PendingProductSnapshotDocument = ProductSnapshot & {
  id: string;
  householdId: string;
  createdAt: string;
};

export type PendingAddListItemMutation = {
  id: string;
  kind: "addListItem";
  createdAt: string;
  ensureList: "ongoing" | "monthly";
  monthKey?: string;
  item: ShoppingItem;
  productSnapshotDocument?: PendingProductSnapshotDocument | null;
  templateDocument?: PendingTemplateDocument | null;
};

export type PendingSaveSavedProductMutation = {
  id: string;
  kind: "saveSavedProduct";
  createdAt: string;
  product: SavedProduct;
};

export type PendingCreateReceiptMutation = {
  id: string;
  kind: "createReceipt";
  createdAt: string;
  receipt: ReceiptEntry;
};

export type PendingDeleteListItemMutation = {
  id: string;
  kind: "deleteListItem";
  createdAt: string;
  householdId: string;
  listId: string;
  itemId: string;
};

export type PendingDeleteSavedProductMutation = {
  id: string;
  kind: "deleteSavedProduct";
  createdAt: string;
  householdId: string;
  productId: string;
};

export type PendingDeleteMonthlyTemplateMutation = {
  id: string;
  kind: "deleteMonthlyTemplate";
  createdAt: string;
  householdId: string;
  templateId: string;
};

export type PendingToggleListItemMutation = {
  id: string;
  kind: "toggleListItem";
  createdAt: string;
  householdId: string;
  listId: string;
  itemId: string;
  bought: boolean;
  boughtAt?: string | null;
  updatedAt: string;
};

export type PendingUpdateListItemMutation = {
  id: string;
  kind: "updateListItem";
  createdAt: string;
  item: ShoppingItem;
};

export type PendingMutation =
  | PendingAddListItemMutation
  | PendingSaveSavedProductMutation
  | PendingCreateReceiptMutation
  | PendingDeleteListItemMutation
  | PendingDeleteSavedProductMutation
  | PendingDeleteMonthlyTemplateMutation
  | PendingToggleListItemMutation
  | PendingUpdateListItemMutation;

let storagePromise: Promise<KeyValueStorage | null> | null = null;

async function getStorage(): Promise<KeyValueStorage | null> {
  if (!storagePromise) {
    storagePromise = import("@react-native-async-storage/async-storage")
      .then((asyncStorageModule) => {
        const storage = ("default" in asyncStorageModule ? asyncStorageModule.default : asyncStorageModule) as
          | KeyValueStorage
          | undefined;
        return storage ?? null;
      })
      .catch(() => null);
  }

  return storagePromise;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const storage = await getStorage();

  if (!storage) {
    return fallback;
  }

  try {
    const rawValue = await storage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T) {
  const storage = await getStorage();

  if (!storage) {
    return;
  }

  await storage.setItem(key, JSON.stringify(value));
}

async function removeValue(key: string) {
  const storage = await getStorage();
  await storage?.removeItem(key);
}

function profileKey(userId: string) {
  return `shopping2go.profile.${userId}`;
}

function householdsKey(userId: string) {
  return `shopping2go.households.${userId}`;
}

function listItemsKey(householdId: string, listId: string) {
  return `shopping2go.list-items.${householdId}.${listId}`;
}

function savedProductsKey(householdId: string) {
  return `shopping2go.saved-products.${householdId}`;
}

function templatesKey(householdId: string) {
  return `shopping2go.templates.${householdId}`;
}

function receiptsKey(householdId: string) {
  return `shopping2go.receipts.${householdId}`;
}

export function mergeById<T extends { id: string }>(incoming: T[], cached: T[]) {
  const merged = new Map<string, T>();

  cached.forEach((item) => {
    merged.set(item.id, item);
  });

  incoming.forEach((item) => {
    merged.set(item.id, item);
  });

  return Array.from(merged.values());
}

export function mergeRemoteWithPendingById<
  T extends { id: string; pendingSync?: boolean; createdAt?: unknown; updatedAt?: unknown },
>(incoming: T[], cached: T[]) {
  const merged = new Map<string, T>();

  incoming.forEach((item) => {
    merged.set(item.id, item);
  });

  cached.forEach((item) => {
    const existing = merged.get(item.id);

    if (!existing) {
      merged.set(item.id, item);
      return;
    }

    const cachedTime = comparableTime(item.updatedAt ?? item.createdAt);
    const remoteTime = comparableTime(existing.updatedAt ?? existing.createdAt);

    if (item.pendingSync && cachedTime >= remoteTime) {
      merged.set(item.id, item);
      return;
    }

    if (cachedTime > remoteTime) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
}

export async function readActiveHouseholdId() {
  const storage = await getStorage();
  return storage ? await storage.getItem(ACTIVE_HOUSEHOLD_KEY) : null;
}

export async function writeActiveHouseholdId(householdId: string | null) {
  if (householdId) {
    const storage = await getStorage();
    await storage?.setItem(ACTIVE_HOUSEHOLD_KEY, householdId);
    return;
  }

  await removeValue(ACTIVE_HOUSEHOLD_KEY);
}

export async function readCachedSessionUser() {
  return await readJson<SessionUser | null>(SESSION_USER_KEY, null);
}

export async function writeCachedSessionUser(user: SessionUser | null) {
  if (!user) {
    await removeValue(SESSION_USER_KEY);
    return;
  }

  await writeJson(SESSION_USER_KEY, user);
}

export async function readCachedProfile(userId: string) {
  return await readJson<UserProfile | null>(profileKey(userId), null);
}

export async function writeCachedProfile(userId: string, profile: UserProfile | null) {
  if (!profile) {
    await removeValue(profileKey(userId));
    return;
  }

  await writeJson(profileKey(userId), profile);
}

export async function readCachedHouseholds(userId: string) {
  return await readJson<Household[]>(householdsKey(userId), []);
}

export async function writeCachedHouseholds(userId: string, households: Household[]) {
  await writeJson(householdsKey(userId), households);
}

export async function readCachedListItems(householdId: string, listId: string) {
  return await readJson<ShoppingItem[]>(listItemsKey(householdId, listId), []);
}

export async function writeCachedListItems(householdId: string, listId: string, items: ShoppingItem[]) {
  await writeJson(listItemsKey(householdId, listId), items);
}

export async function readCachedSavedProducts(householdId: string) {
  return await readJson<SavedProduct[]>(savedProductsKey(householdId), []);
}

export async function writeCachedSavedProducts(householdId: string, products: SavedProduct[]) {
  await writeJson(savedProductsKey(householdId), products);
}

export async function readCachedTemplates(householdId: string) {
  return await readJson<PendingTemplateDocument[]>(templatesKey(householdId), []);
}

export async function writeCachedTemplates(householdId: string, templates: PendingTemplateDocument[]) {
  await writeJson(templatesKey(householdId), templates);
}

export async function readCachedReceipts(householdId: string) {
  return await readJson<ReceiptEntry[]>(receiptsKey(householdId), []);
}

export async function writeCachedReceipts(householdId: string, receipts: ReceiptEntry[]) {
  await writeJson(receiptsKey(householdId), receipts);
}

export async function readPendingMutations() {
  return await readJson<PendingMutation[]>(PENDING_MUTATIONS_KEY, []);
}

export async function enqueuePendingMutation(mutation: PendingMutation) {
  const mutations = await readPendingMutations();
  await writeJson(PENDING_MUTATIONS_KEY, [...mutations, mutation]);
}

export async function writePendingMutations(mutations: PendingMutation[]) {
  await writeJson(PENDING_MUTATIONS_KEY, mutations);
}

export async function removePendingMutation(mutationId: string) {
  const mutations = await readPendingMutations();
  await writeJson(
    PENDING_MUTATIONS_KEY,
    mutations.filter((mutation) => mutation.id !== mutationId),
  );
}

export async function clearOfflineSession() {
  await Promise.all([removeValue(SESSION_USER_KEY), removeValue(ACTIVE_HOUSEHOLD_KEY), removeValue(PENDING_MUTATIONS_KEY)]);
}
