import type { Timestamp } from "firebase/firestore";

export type NullableTimestamp = Timestamp | Date | string | number | null | undefined;

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
};

export type Household = {
  id: string;
  name: string;
  currency: string;
  createdBy: string;
  activeInviteCode: string;
  memberIds: string[];
  memberCount: number;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
};

export type HouseholdMember = {
  id: string;
  householdId: string;
  userId: string;
  role: "owner" | "member";
  displayName: string;
  email: string;
  joinedAt?: NullableTimestamp;
};

export type ShoppingList = {
  id: string;
  householdId: string;
  name: string;
  type: "ongoing" | "monthly";
  monthKey?: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
};

export type ProductSnapshot = {
  id?: string;
  householdId?: string;
  title: string;
  brand?: string;
  storeName?: string | null;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  sourceName: string;
  sourceProductId?: string | null;
  productUrl?: string | null;
};

export type SavedProduct = {
  id: string;
  householdId: string;
  title: string;
  brand?: string;
  storeName?: string | null;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  sourceName: string;
  sourceProductId?: string | null;
  productUrl?: string | null;
  note?: string;
  quantity?: number | string | null;
  createdBy: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
  pendingSync?: boolean;
};

export type ShoppingItem = {
  id: string;
  householdId: string;
  listId: string;
  title: string;
  note?: string;
  quantity?: number | string | null;
  storeName?: string;
  bought: boolean;
  boughtAt?: NullableTimestamp;
  createdBy: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
  productSnapshotId?: string;
  productSnapshot?: ProductSnapshot | null;
  pendingSync?: boolean;
};

export type MonthlyTemplate = {
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

export type ReceiptEntry = {
  id: string;
  householdId: string;
  total: number;
  currency: string;
  storeName?: string;
  note?: string;
  purchaseDate: string;
  linkedMonth?: string | null;
  imagePath?: string | null;
  imageUrl?: string | null;
  createdBy: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
  pendingSync?: boolean;
};

export type SpendingBucket = {
  key: string;
  label: string;
  subtitle?: string;
  total: number;
};

export type SpendingRange = "day" | "month" | "year";
