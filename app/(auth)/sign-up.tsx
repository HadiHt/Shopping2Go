import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { ActionButton } from "@/components/forms/ActionButton";
import { StatusMessage } from "@/components/feedback/StatusMessage";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen, ScreenHeader } from "@/components/layout/Screen";
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
      <ScreenHeader
        badge="Create account"
        title="Create your shared household space"
        description="Everyone gets their own login, and the household data stays private to the people you invite."
      />

      <Card>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} tone="neutral" />
        <TextField label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} tone="neutral" />
        <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} tone="neutral" />
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <ActionButton label="Create account" tone="neutral" onPress={handleSubmit} loading={loading} />
        <Link href="/(auth)/sign-in" style={styles.link}>
          Already have an account? Sign in
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
