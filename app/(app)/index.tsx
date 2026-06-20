import { useEffect, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Card, EmptyState, ModeBadge, Screen, ScreenHeader, SectionCard } from "@/components/layout/Screen";
import { useSession } from "@/hooks/useSession";
import { getAccentColors, theme } from "@/lib/theme";
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
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const hasHouseholdContext = !!activeHouseholdId || households.length > 0;
  const neutralAccent = getAccentColors("neutral");

  useEffect(() => {
    if (!user) {
      setHouseholds([]);
      return;
    }

    return subscribeHouseholds(
      user.uid,
      (nextHouseholds) => {
        setLoadStatus(null);
        setHouseholds(nextHouseholds);

        const stillHasActiveHousehold = !!activeHouseholdId && nextHouseholds.some((household) => household.id === activeHouseholdId);

        if (stillHasActiveHousehold) {
          return;
        }

        if (nextHouseholds[0]) {
          setActiveHouseholdId(nextHouseholds[0].id).catch(() => undefined);
        }
      },
      (error) => {
        setLoadStatus(getErrorMessage(error, "Could not load your households from Firestore."));
      },
    );
  }, [activeHouseholdId, setActiveHouseholdId, user]);

  const activeHousehold = useMemo(
    () => households.find((household) => household.id === activeHouseholdId) ?? households[0] ?? null,
    [activeHouseholdId, households],
  );

  useEffect(() => {
    if (hasHouseholdContext && status?.tone === "error") {
      setStatus(null);
    }
  }, [hasHouseholdContext, status]);

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

  const handleShareInvite = async () => {
    if (!activeHousehold?.activeInviteCode) {
      return;
    }

    try {
      await Share.share({
        message: `Join my Shopping2Go household "${activeHousehold.name}" with invite code: ${activeHousehold.activeInviteCode}`,
      });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not open the share sheet right now.") });
    }
  };

  return (
    <Screen>
      <ScreenHeader
        badge="Household"
        title={`Welcome back, ${profile?.displayName ?? "Shopper"}`}
        description="Keep the household synced, switch spaces quickly, and share access without digging through forms."
        action={<ActionButton label="Sign out" variant="ghost" tone="neutral" onPress={signOut} />}
      >
        {activeHousehold ? (
          <View style={styles.heroMetaRow}>
            <ModeBadge tone="neutral">{activeHousehold.currency}</ModeBadge>
            <Text style={styles.heroMetaText}>{activeHousehold.memberCount} member{activeHousehold.memberCount === 1 ? "" : "s"}</Text>
          </View>
        ) : null}
      </ScreenHeader>

      {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
      {!hasHouseholdContext && loadStatus ? <StatusMessage tone="error" message={loadStatus} /> : null}

      {hasHouseholdContext ? (
        <>
          {activeHousehold ? (
            <SectionCard tone="neutral">
              <Text style={styles.sectionTitle}>Active household</Text>
              <Text style={styles.primaryLine}>{activeHousehold.name}</Text>
              <Text style={styles.supportingCopy}>Invite code</Text>
              <View style={[styles.inviteBox, { backgroundColor: neutralAccent.soft, borderColor: neutralAccent.softBorder }]}>
                <Text style={[styles.inviteCode, { color: neutralAccent.solid }]}>{activeHousehold.activeInviteCode}</Text>
              </View>
              <View style={styles.actionRow}>
                <ActionButton label="Share invite" tone="neutral" onPress={handleShareInvite} buttonStyle={styles.flexAction} />
                <ActionButton
                  label={activeHouseholdId === activeHousehold.id ? "Selected" : "Use household"}
                  variant="secondary"
                  tone="neutral"
                  onPress={() => setActiveHouseholdId(activeHousehold.id)}
                  buttonStyle={styles.flexAction}
                />
              </View>
            </SectionCard>
          ) : (
            <EmptyState
              tone="neutral"
              title="Household cached locally"
              description="Reconnect to refresh invite details and the full household list for the saved household."
            />
          )}

          <Card>
            <Text style={styles.sectionTitle}>Your households</Text>
            {households.length === 0 ? (
              <EmptyState
                tone="neutral"
                title="No households yet"
                description="Create or join a household to unlock shared lists, monthly planning, and reports."
              />
            ) : (
              households.map((household) => (
                <View key={household.id} style={styles.householdRow}>
                  <View style={styles.householdCopy}>
                    <Text style={styles.householdName}>{household.name}</Text>
                    <Text style={styles.householdMeta}>
                      {household.currency} • {household.memberCount} member{household.memberCount === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.householdMeta}>Invite code: {household.activeInviteCode}</Text>
                  </View>
                  <ActionButton
                    label={activeHouseholdId === household.id ? "Active" : "Use"}
                    tone="neutral"
                    variant={activeHouseholdId === household.id ? "secondary" : "ghost"}
                    onPress={() => setActiveHouseholdId(household.id)}
                  />
                </View>
              ))
            )}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.sectionTitle}>Create a household</Text>
            <Text style={styles.supportingCopy}>Start a shared space for groceries, receipts, and monthly planning.</Text>
            <TextField label="Household name" value={householdName} onChangeText={setHouseholdName} placeholder="Home groceries" tone="neutral" />
            <SelectField
              label="Currency"
              value={currency}
              onValueChange={setCurrency}
              options={currencyOptions}
              helperText="Pick the default currency for this household."
              tone="neutral"
            />
            <ActionButton label="Create household" tone="neutral" onPress={handleCreate} loading={busy === "create"} />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Join by invite</Text>
            <Text style={styles.supportingCopy}>Already have a household code? Join it here and sync immediately.</Text>
            <TextField label="Invite code" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" tone="neutral" />
            <ActionButton label="Join household" tone="neutral" variant="secondary" onPress={handleJoin} loading={busy === "join"} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  heroMetaText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.size.section,
    fontFamily: theme.typography.fonts.title,
  },
  supportingCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.body,
    lineHeight: theme.typography.lineHeight.body,
  },
  primaryLine: {
    color: theme.colors.text,
    fontSize: 24,
    fontFamily: theme.typography.fonts.heading,
  },
  inviteBox: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  inviteCode: {
    fontSize: 28,
    fontFamily: theme.typography.fonts.heading,
    letterSpacing: 2,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  flexAction: {
    flex: 1,
  },
  householdRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  householdCopy: {
    flex: 1,
    gap: 4,
  },
  householdName: {
    fontSize: 16,
    color: theme.colors.text,
    fontFamily: theme.typography.fonts.title,
  },
  householdMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
  },
});
