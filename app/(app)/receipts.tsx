import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Card, Screen } from "@/components/layout/Screen";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { createReceipt, subscribeReceipts } from "@/services/firestore";
import type { ReceiptEntry } from "@/types/models";
import { currencyOptions } from "@/utils/currencies";
import { displayDate, isoDateToday } from "@/utils/date";
import { getErrorMessage } from "@/utils/errors";

export default function ReceiptsScreen() {
  const { activeHouseholdId, user } = useSession();
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [purchaseDate, setPurchaseDate] = useState(isoDateToday());
  const [storeName, setStoreName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    if (!activeHouseholdId) {
      return;
    }

    return subscribeReceipts(activeHouseholdId, setReceipts);
  }, [activeHouseholdId]);

  const monthlyGuess = useMemo(() => purchaseDate.slice(0, 7), [purchaseDate]);

  const handleSave = async () => {
    if (!activeHouseholdId || !user || !total) {
      setStatus({ tone: "error", message: "Choose a household and enter a total before saving a receipt." });
      return;
    }

    if (Number.isNaN(Number(total))) {
      setStatus({ tone: "error", message: "Total spent must be a valid number like 45.80." });
      return;
    }

    try {
      setBusy(true);
      setStatus({ tone: "info", message: "Saving receipt..." });
      await createReceipt({
        householdId: activeHouseholdId,
        userId: user.uid,
        total: Number(total),
        currency,
        purchaseDate,
        linkedMonth: monthlyGuess,
        storeName,
        note,
      });
      setTotal("");
      setStoreName("");
      setNote("");
      setPurchaseDate(isoDateToday());
      setStatus({ tone: "success", message: "Receipt saved successfully." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not save receipt. Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Receipts and bills</Text>
        <Text style={styles.copy}>Track the total, purchase date, store, and notes for each shopping run without paid storage.</Text>
      </Card>

      <Card>
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <Text style={styles.sectionTitle}>Add receipt</Text>
        <TextField label="Total spent" keyboardType="decimal-pad" value={total} onChangeText={setTotal} placeholder="45.80" />
        <SelectField
          label="Currency"
          value={currency}
          onValueChange={setCurrency}
          options={currencyOptions}
          helperText="Choose the currency used on this receipt."
        />
        <TextField label="Purchase date" value={purchaseDate} onChangeText={setPurchaseDate} helperText="Use YYYY-MM-DD format." />
        <TextField label="Store name" value={storeName} onChangeText={setStoreName} placeholder="Lidl, Spar, local market..." />
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Weekly restock with extra snacks" />
        <Text style={styles.helper}>
          Receipt image uploads are disabled in this free Firebase version. You can still track spending totals and notes.
        </Text>
        <ActionButton label="Save receipt" onPress={handleSave} loading={busy} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent receipts</Text>
        {receipts.length === 0 ? (
          <Text style={styles.meta}>No receipts yet. Add one to start building daily, monthly, and yearly spending views.</Text>
        ) : (
          receipts.map((receipt) => (
            <View key={receipt.id} style={styles.receiptRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.amount}>
                  {receipt.total.toFixed(2)} {receipt.currency}
                </Text>
                <Text style={styles.meta}>
                  {displayDate(receipt.purchaseDate)}{receipt.storeName ? ` | ${receipt.storeName}` : ""}
                </Text>
                {receipt.note ? <Text style={styles.meta}>{receipt.note}</Text> : null}
              </View>
            </View>
          ))
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  receiptRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  amount: {
    fontWeight: "800",
    color: theme.colors.text,
    fontSize: 18,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  helper: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
});
