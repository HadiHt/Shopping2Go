import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect } from "expo-router";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { db, isFirebaseConfigured } from "@/lib/firebase";
import { signInUser, signOutUser, signUpUser, watchAuth } from "@/services/auth";
import type { UserProfile } from "@/types/models";

const ACTIVE_HOUSEHOLD_KEY = "shopping2go.active-household";

type SessionContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  activeHouseholdId: string | null;
  setActiveHouseholdId: (householdId: string | null) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  isFirebaseConfigured: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_HOUSEHOLD_KEY)
      .then((value) => setActiveHouseholdIdState(value))
      .finally(() => undefined);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = watchAuth((nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    return onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      if (!snapshot.exists()) {
        setProfile({
          id: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? user.email?.split("@")[0] ?? "Shopper",
        });
        return;
      }

      setProfile({
        id: snapshot.id,
        ...(snapshot.data() as Omit<UserProfile, "id">),
      });
    });
  }, [user]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      profile,
      loading,
      activeHouseholdId,
      setActiveHouseholdId: async (householdId) => {
        setActiveHouseholdIdState(householdId);
        if (householdId) {
          await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, householdId);
        } else {
          await AsyncStorage.removeItem(ACTIVE_HOUSEHOLD_KEY);
        }
      },
      signIn: async (email, password) => {
        await signInUser(email, password);
      },
      signUp: async (email, password, displayName) => {
        await signUpUser(email, password, displayName);
      },
      signOut: async () => {
        await AsyncStorage.removeItem(ACTIVE_HOUSEHOLD_KEY);
        setActiveHouseholdIdState(null);
        await signOutUser();
      },
      isFirebaseConfigured,
    }),
    [activeHouseholdId, loading, profile, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error("useSession must be used inside SessionProvider.");
  }

  return value;
}

export function SignedInGuard({ children }: PropsWithChildren) {
  const session = useSession();

  if (session.loading) {
    return null;
  }

  if (!session.isFirebaseConfigured) {
    return <Redirect href="/setup" />;
  }

  if (!session.user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return children;
}
