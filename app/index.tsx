import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";

export default function IndexScreen() {
  const session = useSession();

  if (session.loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!session.isFirebaseConfigured) {
    return <Redirect href="/setup" />;
  }

  if (!session.user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href="/(app)" />;
}
