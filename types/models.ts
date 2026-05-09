import type { Timestamp } from "firebase/firestore";

export type NullableTimestamp = Timestamp | Date | null | undefined;

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
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  sourceName: string;
  sourceProductId?: string | null;
  productUrl?: string | null;
};

export type ShoppingItem = {
  id: string;
  householdId: string;
  listId: string;
  title: string;
  note?: string;
  quantity?: string;
  bought: boolean;
  createdBy: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
  productSnapshotId?: string;
  productSnapshot?: ProductSnapshot | null;
};

export type MonthlyTemplate = {
  id: string;
  householdId: string;
  title: string;
  note?: string;
  quantity?: string;
  createdAt?: NullableTimestamp;
  updatedAt?: NullableTimestamp;
};

export type ReceiptEntry = {
  id: string;
  householdId: string;
  total: number;
  currency: string;
  storeName?: string;
  note?: string;
  purchaseDate: string;
  linkedMonth?: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  createdBy: string;
  createdAt?: NullableTimestamp;
};

export type SpendingBucket = {
  key: string;
  label: string;
  total: number;
};

export type SpendingRange = "day" | "month" | "year";
