import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as FirebaseAuthModule from "firebase/auth";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { Platform } from "react-native";

const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? extra.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? extra.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const app = isFirebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;

export const firebaseApp = app;
export const auth: Auth =
  !app
    ? (null as unknown as Auth)
    : Platform.OS === "web"
      ? getAuth(app)
      : (() => {
          try {
            const getNativePersistence = (
              FirebaseAuthModule as typeof FirebaseAuthModule & {
                getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
              }
            ).getReactNativePersistence;

            return getNativePersistence
              ? initializeAuth(app, {
                  persistence: getNativePersistence(AsyncStorage),
                })
              : initializeAuth(app);
          } catch {
            return getAuth(app);
          }
        })();

export const db: Firestore = app ? getFirestore(app) : (null as unknown as Firestore);
