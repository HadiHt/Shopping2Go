import { Redirect } from "expo-router";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";

import { useConnectivity } from "@/hooks/useConnectivity";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { clearOfflineSession, readActiveHouseholdId, readCachedProfile, readCachedSessionUser, writeActiveHouseholdId, writeCachedProfile, writeCachedSessionUser } from "@/lib/offline";
import { signInUser, signOutUser, signUpUser, watchAuth } from "@/services/auth";
import { syncPendingMutations } from "@/services/firestore";
import type { SessionUser, UserProfile } from "@/types/models";

type SessionContextValue = {
  user: SessionUser | null;
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
  useConnectivity();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.all([readActiveHouseholdId(), readCachedSessionUser()])
      .then(([householdId, cachedUser]) => {
        if (!active) {
          return;
        }

        if (householdId) {
          setActiveHouseholdIdState(householdId);
        }

        if (cachedUser) {
          setUser(cachedUser);
        }
      })
      .finally(() => {
        if (active) {
          setStorageReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = watchAuth((nextUser) => {
      setFirebaseUser(nextUser);

      if (nextUser) {
        const nextSessionUser = {
          uid: nextUser.uid,
          email: nextUser.email ?? "",
          displayName: nextUser.displayName ?? nextUser.email?.split("@")[0] ?? "Shopper",
        } satisfies SessionUser;

        setUser(nextSessionUser);
        void writeCachedSessionUser(nextSessionUser);
      } else if (!storageReady) {
        setUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    if (!user) {
      setProfile(null);
      return;
    }

    if (!firebaseUser || !db) {
      void readCachedProfile(user.uid).then((cachedProfile) => {
        if (cachedProfile) {
          setProfile(cachedProfile);
          return;
        }

        setProfile({
          id: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split("@")[0] || "Shopper",
        });
      });
      return;
    }

    return onSnapshot(doc(db, "users", firebaseUser.uid), (snapshot) => {
      if (!snapshot.exists()) {
        const fallbackProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email ?? "",
          displayName: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "Shopper",
        } satisfies UserProfile;

        setProfile(fallbackProfile);
        void writeCachedProfile(firebaseUser.uid, fallbackProfile);
        return;
      }

      const nextProfile = {
        id: snapshot.id,
        ...(snapshot.data() as Omit<UserProfile, "id">),
      } satisfies UserProfile;

      setProfile(nextProfile);
      void writeCachedProfile(firebaseUser.uid, nextProfile);
    });
  }, [db, firebaseUser, storageReady, user]);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    let cancelled = false;

    const runSync = async () => {
      try {
        await syncPendingMutations();
      } catch {
        if (cancelled) {
          return;
        }
      }
    };

    void runSync();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runSync();
      }
    });

    const interval = setInterval(() => {
      void runSync();
    }, 30000);

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [firebaseUser]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      profile,
      loading,
      activeHouseholdId,
      setActiveHouseholdId: async (householdId) => {
        setActiveHouseholdIdState(householdId);
        await writeActiveHouseholdId(householdId);
      },
      signIn: async (email, password) => {
        await signInUser(email, password);
      },
      signUp: async (email, password, displayName) => {
        await signUpUser(email, password, displayName);
      },
      signOut: async () => {
        setActiveHouseholdIdState(null);
        setProfile(null);
        setUser(null);
        setFirebaseUser(null);
        await clearOfflineSession();
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
