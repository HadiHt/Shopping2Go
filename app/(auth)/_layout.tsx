import { Redirect, Stack } from "expo-router";

import { useSession } from "@/hooks/useSession";

export default function AuthLayout() {
  const { loading, isFirebaseConfigured, user } = useSession();

  if (loading) {
    return null;
  }

  if (!isFirebaseConfigured) {
    return <Redirect href="/setup" />;
  }

  if (user) {
    return <Redirect href="/(app)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
