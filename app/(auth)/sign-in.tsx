import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ActionButton } from "@/components/forms/ActionButton";
import { StatusMessage } from "@/components/feedback/StatusMessage";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen } from "@/components/layout/Screen";
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
      <Card>
        <Text style={styles.eyebrow}>Shopping2Go</Text>
        <Text style={styles.title}>Keep your household list, receipts, and spending in one place.</Text>
        <Text style={styles.copy}>Sign in to manage recurring shopping, monthly receipts, and spend tracking across devices.</Text>
      </Card>

      <Card>
        <TextField label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <ActionButton label="Sign in" onPress={handleSubmit} loading={loading} />
        <Link href="/(auth)/sign-up" style={styles.link}>
          Need an account? Create one
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: theme.colors.accent,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
});
