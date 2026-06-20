import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { SignedInGuard } from "@/hooks/useSession";
import { getAccentColors, theme } from "@/lib/theme";

export default function AppLayout() {
  return (
    <SignedInGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarInactiveTintColor: theme.colors.mutedText,
          tabBarStyle: {
            height: theme.components.tabBarHeight,
            paddingTop: 8,
            paddingBottom: 10,
            backgroundColor: theme.colors.surfaceStrong,
            borderTopColor: theme.colors.border,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontFamily: theme.typography.fonts.label,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarActiveTintColor: getAccentColors("neutral").solid,
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="list"
          options={{
            title: "Anytime",
            tabBarActiveTintColor: getAccentColors("anytime").solid,
            tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="monthly"
          options={{
            title: "Monthly",
            tabBarActiveTintColor: getAccentColors("monthly").solid,
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="receipts"
          options={{
            title: "Receipts",
            tabBarActiveTintColor: getAccentColors("neutral").solid,
            tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: "Reports",
            tabBarActiveTintColor: getAccentColors("neutral").solid,
            tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" color={color} size={size} />,
          }}
        />
      </Tabs>
    </SignedInGuard>
  );
}
