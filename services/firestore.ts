import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type {
  Household,
  HouseholdMember,
  MonthlyTemplate,
  ProductSnapshot,
  ReceiptEntry,
  ShoppingItem,
  ShoppingList,
} from "@/types/models";
import { currentMonthKey } from "@/utils/date";
import { generateInviteCode } from "@/utils/invite";

function dataWithId<T>(id: string, data: Record<string, unknown>) {
  return { id, ...(data as T) };
}

export function buildOngoingListId(householdId: string) {
  return `${householdId}_ongoing`;
}

export function buildMonthlyListId(householdId: string, monthKey: string) {
  return `${householdId}_monthly_${monthKey}`;
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

export function subscribeHouseholds(userId: string, callback: (households: Household[]) => void) {
  const householdsQuery = query(collection(db, "households"), where("memberIds", "array-contains", userId));

  return onSnapshot(householdsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => dataWithId<Household>(item.id, item.data())));
  });
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
  const listSnapshot = await getDoc(listRef);

  if (listSnapshot.exists()) {
    return listId;
  }

  const templateQuery = query(collection(db, "monthlyTemplates"), where("householdId", "==", householdId));
  const templates = await getDocs(templateQuery);
  const batch = writeBatch(db);

  batch.set(listRef, {
    householdId,
    name: `Monthly list - ${monthKey}`,
    type: "monthly",
    monthKey,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const template of templates.docs) {
    const itemRef = doc(collection(db, "listItems"));
    batch.set(itemRef, {
      householdId,
      listId,
      title: template.data().title,
      note: template.data().note ?? "",
      quantity: template.data().quantity ?? "",
      bought: false,
      createdBy: template.data().createdBy ?? "template",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  return listId;
}

export function subscribeList(listId: string, callback: (list: ShoppingList | null) => void) {
  return onSnapshot(doc(db, "lists", listId), (snapshot) => {
    callback(snapshot.exists() ? dataWithId<ShoppingList>(snapshot.id, snapshot.data()) : null);
  });
}

export function subscribeListItems(listId: string, callback: (items: ShoppingItem[]) => void) {
  const itemsQuery = query(collection(db, "listItems"), where("listId", "==", listId), orderBy("createdAt", "asc"));

  return onSnapshot(itemsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => dataWithId<ShoppingItem>(item.id, item.data())));
  });
}

export async function addListItem(input: {
  householdId: string;
  listId: string;
  title: string;
  note?: string;
  quantity?: string;
  userId: string;
  addToTemplate?: boolean;
  productSnapshot?: ProductSnapshot | null;
}) {
  const itemRef = doc(collection(db, "listItems"));
  let snapshotId: string | undefined;

  if (input.productSnapshot) {
    const snapshotRef = doc(collection(db, "productSnapshots"));
    snapshotId = snapshotRef.id;
    await setDoc(snapshotRef, {
      ...input.productSnapshot,
      householdId: input.householdId,
      createdAt: serverTimestamp(),
    });
  }

  await setDoc(itemRef, {
    householdId: input.householdId,
    listId: input.listId,
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    quantity: input.quantity?.trim() ?? "",
    bought: false,
    createdBy: input.userId,
    productSnapshotId: snapshotId ?? null,
    productSnapshot: input.productSnapshot ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.addToTemplate) {
    await addDoc(collection(db, "monthlyTemplates"), {
      householdId: input.householdId,
      title: input.title.trim(),
      note: input.note?.trim() ?? "",
      quantity: input.quantity?.trim() ?? "",
      createdBy: input.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function toggleListItem(itemId: string, bought: boolean) {
  await updateDoc(doc(db, "listItems", itemId), {
    bought,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeTemplates(householdId: string, callback: (templates: MonthlyTemplate[]) => void) {
  const templateQuery = query(
    collection(db, "monthlyTemplates"),
    where("householdId", "==", householdId),
    orderBy("createdAt", "asc"),
  );

  return onSnapshot(templateQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => dataWithId<MonthlyTemplate>(item.id, item.data())));
  });
}

export function subscribeReceipts(householdId: string, callback: (receipts: ReceiptEntry[]) => void) {
  const receiptQuery = query(
    collection(db, "receipts"),
    where("householdId", "==", householdId),
    orderBy("purchaseDate", "desc"),
  );

  return onSnapshot(receiptQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => dataWithId<ReceiptEntry>(item.id, item.data())));
  });
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
  const receiptRef = doc(collection(db, "receipts"));

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
  });
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
    throw new Error(
      proxyBaseUrl
        ? "The product-search backend returned an error. Please try again later or add the item manually."
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
      price: null,
      currency: null,
      imageUrl: (product.image_front_small_url as string | undefined) ?? (product.image_url as string | undefined) ?? null,
      sourceName: "Open Food Facts",
      sourceProductId: (product.code as string | undefined) ?? null,
      productUrl: typeof product.url === "string" ? product.url : null,
    }));
}
