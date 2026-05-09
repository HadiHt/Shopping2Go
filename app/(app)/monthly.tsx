import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen } from "@/components/layout/Screen";
import { ShoppingItemRow } from "@/components/lists/ShoppingItemRow";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { addListItem, buildMonthlyListId, ensureMonthlyList, subscribeListItems, subscribeTemplates, toggleListItem } from "@/services/firestore";
import type { MonthlyTemplate, ShoppingItem } from "@/types/models";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/utils/date";
import { getErrorMessage } from "@/utils/errors";

export default function MonthlyScreen() {
  const { activeHouseholdId, user } = useSession();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [templates, setTemplates] = useState<MonthlyTemplate[]>([]);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saveToTemplate, setSaveToTemplate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const listId = useMemo(() => (activeHouseholdId ? buildMonthlyListId(activeHouseholdId, monthKey) : null), [activeHouseholdId, monthKey]);

  useEffect(() => {
    if (!activeHouseholdId || !listId) {
      return;
    }

    ensureMonthlyList(activeHouseholdId, monthKey).catch(() => undefined);

    return subscribeListItems(listId, setItems);
  }, [activeHouseholdId, listId, monthKey]);

  useEffect(() => {
    if (!activeHouseholdId) {
      return;
    }

    return subscribeTemplates(activeHouseholdId, setTemplates);
  }, [activeHouseholdId]);

  const handleAdd = async () => {
    if (!activeHouseholdId || !listId || !user || !title.trim()) {
      setStatus({ tone: "error", message: "Choose a household and enter an item name before adding a monthly item." });
      return;
    }

    try {
      setBusy(true);
      setStatus({ tone: "info", message: "Adding item to this monthly list..." });
      await addListItem({
        householdId: activeHouseholdId,
        listId,
        title,
        quantity,
        note,
        userId: user.uid,
        addToTemplate: saveToTemplate,
      });
      setTitle("");
      setQuantity("");
      setNote("");
      setStatus({ tone: "success", message: "Monthly item added successfully." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not add monthly item. Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Monthly plan</Text>
        <Text style={styles.copy}>Generate month-specific lists from recurring templates and track what gets bought this month only.</Text>
        <View style={styles.navRow}>
          <ActionButton label="Previous" variant="ghost" onPress={() => setMonthKey((value) => shiftMonth(value, -1))} />
          <Text style={styles.monthLabel}>{formatMonthLabel(monthKey)}</Text>
          <ActionButton label="Next" variant="ghost" onPress={() => setMonthKey((value) => shiftMonth(value, 1))} />
        </View>
      </Card>

      <Card>
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <Text style={styles.sectionTitle}>Add monthly item</Text>
        <TextField label="Item name" value={title} onChangeText={setTitle} placeholder="Laundry detergent" />
        <TextField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="1 bottle" />
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Sensitive skin version" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.switchLabel}>Keep recurring</Text>
            <Text style={styles.meta}>Save new monthly staples to the reusable template list.</Text>
          </View>
          <Switch value={saveToTemplate} onValueChange={setSaveToTemplate} />
        </View>
        <ActionButton label="Add to monthly list" onPress={handleAdd} loading={busy} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recurring template</Text>
        {templates.length === 0 ? (
          <Text style={styles.meta}>Template items will appear here when you mark list items as recurring.</Text>
        ) : (
          templates.map((template) => (
            <View key={template.id} style={styles.templateRow}>
              <Text style={styles.templateTitle}>{template.title}</Text>
              <Text style={styles.meta}>
                {[template.quantity, template.note].filter(Boolean).join(" | ") || "Recurring staple"}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>{formatMonthLabel(monthKey)} items</Text>
        {items.length === 0 ? (
          <Text style={styles.meta}>This month is empty. Add items or move to another month.</Text>
        ) : (
          items.map((item) => <ShoppingItemRow key={item.id} item={item} onToggle={(value) => toggleListItem(item.id, value)} />)
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  copy: {
    color: theme.colors.mutedText,
    lineHeight: 22,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  monthLabel: {
    flex: 1,
    textAlign: "center",
    fontWeight: "800",
    color: theme.colors.primary,
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  switchRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  switchLabel: {
    fontWeight: "700",
    color: theme.colors.text,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  templateRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 4,
  },
  templateTitle: {
    fontWeight: "700",
    color: theme.colors.text,
  },
});
