import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export function watchAuth(callback: (user: User | null) => void) {
  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  return onAuthStateChanged(auth, callback);
}

export async function signInUser(email: string, password: string) {
  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUpUser(email: string, password: string, displayName: string) {
  if (!auth || !db) {
    throw new Error("Firebase is not configured.");
  }

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }

  await setDoc(
    doc(db, "users", credential.user.uid),
    {
      email: credential.user.email,
      displayName: displayName.trim() || credential.user.email?.split("@")[0] || "Shopper",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return credential;
}

export async function signOutUser() {
  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  await signOut(auth);
}
