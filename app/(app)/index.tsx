import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen } from "@/components/layout/Screen";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { createHousehold, joinHouseholdByCode, subscribeHouseholds } from "@/services/firestore";
import type { Household } from "@/types/models";
import { currencyOptions } from "@/utils/currencies";
import { getErrorMessage } from "@/utils/errors";

export default function HomeScreen() {
  const { user, profile, activeHouseholdId, setActiveHouseholdId, signOut } = useSession();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdName, setHouseholdName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    return subscribeHouseholds(user.uid, (nextHouseholds) => {
      setHouseholds(nextHouseholds);

      if (!activeHouseholdId && nextHouseholds[0]) {
        setActiveHouseholdId(nextHouseholds[0].id).catch(() => undefined);
      }
    });
  }, [activeHouseholdId, setActiveHouseholdId, user]);

  const activeHousehold = useMemo(
    () => households.find((household) => household.id === activeHouseholdId) ?? households[0] ?? null,
    [activeHouseholdId, households],
  );

  const handleCreate = async () => {
    if (!user || !profile) {
      setStatus({ tone: "error", message: "You need to be signed in before creating a household." });
      return;
    }

    if (!currency.trim()) {
      setStatus({ tone: "error", message: "Enter a currency code like EUR before creating the household." });
      return;
    }

    try {
      setBusy("create");
      setStatus({ tone: "info", message: "Creating household..." });
      const householdId = await createHousehold({
        userId: user.uid,
        userEmail: user.email ?? "",
        displayName: profile.displayName,
        name: householdName || `${profile.displayName}'s household`,
        currency,
      });
      await setActiveHouseholdId(householdId);
      setHouseholdName("");
      setStatus({ tone: "success", message: "Household created and selected successfully." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not create household. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const handleJoin = async () => {
    if (!user || !profile) {
      setStatus({ tone: "error", message: "You need to be signed in before joining a household." });
      return;
    }

    if (!inviteCode.trim()) {
      setStatus({ tone: "error", message: "Enter an invite code before trying to join a household." });
      return;
    }

    try {
      setBusy("join");
      setStatus({ tone: "info", message: "Joining household..." });
      const householdId = await joinHouseholdByCode({
        code: inviteCode,
        userId: user.uid,
        userEmail: user.email ?? "",
        displayName: profile.displayName,
      });
      await setActiveHouseholdId(householdId);
      setInviteCode("");
      setStatus({ tone: "success", message: "Joined the household successfully." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not join household. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.eyebrow}>Household center</Text>
        <Text style={styles.title}>Welcome back, {profile?.displayName ?? "Shopper"}</Text>
        <Text style={styles.copy}>
          Active household: {activeHousehold ? `${activeHousehold.name} | ${activeHousehold.currency}` : "none selected yet"}
        </Text>
        <View style={styles.row}>
          <ActionButton label="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </Card>

      <Card>
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <Text style={styles.sectionTitle}>Create a household</Text>
        <TextField label="Household name" value={householdName} onChangeText={setHouseholdName} placeholder="Home groceries" />
        <SelectField
          label="Currency"
          value={currency}
          onValueChange={setCurrency}
          options={currencyOptions}
          helperText="Pick the default currency for this household."
        />
        <ActionButton label="Create household" onPress={handleCreate} loading={busy === "create"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Join by invite</Text>
        <TextField label="Invite code" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" />
        <ActionButton label="Join household" variant="secondary" onPress={handleJoin} loading={busy === "join"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Your households</Text>
        {households.length === 0 ? (
          <Text style={styles.empty}>Create or join a household to unlock shared lists and reports.</Text>
        ) : (
          households.map((household) => (
            <View key={household.id} style={styles.householdRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.householdName}>{household.name}</Text>
                <Text style={styles.meta}>
                  {household.currency} | {household.memberCount} member{household.memberCount === 1 ? "" : "s"}
                </Text>
                <Text style={styles.meta}>Invite code: {household.activeInviteCode}</Text>
              </View>
              <ActionButton
                label={activeHouseholdId === household.id ? "Active" : "Use"}
                variant={activeHouseholdId === household.id ? "secondary" : "ghost"}
                onPress={() => setActiveHouseholdId(household.id)}
              />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: theme.colors.accent,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
  },
  copy: {
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionTitle: {
    fontWeight: "800",
    fontSize: 20,
    color: theme.colors.text,
  },
  empty: {
    color: theme.colors.mutedText,
  },
  householdRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  householdName: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
});
