import { Tabs } from "expo-router";
import { Text } from "react-native";

import { SignedInGuard } from "@/hooks/useSession";
import { theme } from "@/lib/theme";

function TabIcon({ icon }: { icon: string }) {
  return <Text style={{ fontSize: 16 }}>{icon}</Text>;
}

export default function AppLayout() {
  return (
    <SignedInGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.mutedText,
          tabBarStyle: {
            backgroundColor: theme.colors.surfaceStrong,
            borderTopColor: theme.colors.border,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: () => <TabIcon icon="🏠" /> }} />
        <Tabs.Screen name="list" options={{ title: "Anytime", tabBarIcon: () => <TabIcon icon="🛒" /> }} />
        <Tabs.Screen name="monthly" options={{ title: "Monthly", tabBarIcon: () => <TabIcon icon="🗓️" /> }} />
        <Tabs.Screen name="receipts" options={{ title: "Receipts", tabBarIcon: () => <TabIcon icon="🧾" /> }} />
        <Tabs.Screen name="reports" options={{ title: "Reports", tabBarIcon: () => <TabIcon icon="📊" /> }} />
      </Tabs>
    </SignedInGuard>
  );
}
