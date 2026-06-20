import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ActionButton } from "@/components/forms/ActionButton";
import { StatusMessage } from "@/components/feedback/StatusMessage";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen, ScreenHeader } from "@/components/layout/Screen";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { getErrorMessage } from "@/utils/errors";

export default function SignInScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setStatus({ tone: "error", message: "Enter your email and password before signing in." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ tone: "info", message: "Signing you in..." });
      await signIn(email, password);
      setStatus({ tone: "success", message: "Signed in. If the screen does not change right away, give Firebase a moment." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Sign in failed. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        badge="Shopping2Go"
        title="Keep your shared shopping flow in one place"
        description="Sign in to manage household lists, recurring monthly planning, receipts, and spending reports across devices."
      />

      <Card>
        <TextField label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} tone="neutral" />
        <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} tone="neutral" />
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <ActionButton label="Sign in" tone="neutral" onPress={handleSubmit} loading={loading} />
        <Link href="/(auth)/sign-up" style={styles.link}>
          Need an account? Create one
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: {
    color: theme.colors.info,
    fontFamily: theme.typography.fonts.label,
  },
});
