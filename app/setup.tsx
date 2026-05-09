import { StyleSheet, Text, View } from "react-native";

import { Card, Screen } from "@/components/layout/Screen";
import { theme } from "@/lib/theme";

const requiredKeys = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
];

export default function SetupScreen() {
  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Connect Firebase to start Shopping2Go</Text>
        <Text style={styles.body}>
          Add the Firebase web app values to a local `.env` file using the keys below, then restart Expo.
        </Text>
      </Card>

      <Card>
        {requiredKeys.map((key) => (
          <View key={key} style={styles.row}>
            <Text style={styles.key}>{key}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
  },
  body: {
    color: theme.colors.mutedText,
    lineHeight: 22,
    fontSize: 15,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  key: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
});
