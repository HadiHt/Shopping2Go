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

export default function SignUpScreen() {
  const { signUp } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const handleSubmit = async () => {
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      setStatus({ tone: "error", message: "Fill in display name, email, and password before creating an account." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ tone: "info", message: "Creating your account..." });
      await signUp(email, password, displayName);
      setStatus({ tone: "success", message: "Account created. If the screen does not change, wait a moment for Firebase to finish signing you in." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Sign up failed. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Create your shared household space</Text>
        <Text style={styles.copy}>Everyone gets their own login, and your list data stays private to household members.</Text>
      </Card>

      <Card>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
        <TextField label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <ActionButton label="Create account" onPress={handleSubmit} loading={loading} />
        <Link href="/(auth)/sign-in" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
