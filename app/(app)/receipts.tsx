import { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { InfoHint } from "@/components/feedback/InfoHint";
import { StatusMessage } from "@/components/feedback/StatusMessage";
import { ActionButton } from "@/components/forms/ActionButton";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Card, EmptyState, Screen, ScreenHeader } from "@/components/layout/Screen";
import { DayRangeCalendar } from "@/components/reports/DayRangeCalendar";
import { useSession } from "@/hooks/useSession";
import { theme } from "@/lib/theme";
import { createReceipt, deleteReceipt, subscribeReceipts, updateReceipt } from "@/services/firestore";
import type { ReceiptEntry } from "@/types/models";
import { currencyOptions } from "@/utils/currencies";
import { currentMonthKey, displayDate, formatDayLabel, isoDateToday } from "@/utils/date";
import { getErrorMessage } from "@/utils/errors";
import { scanReceiptImage } from "@/utils/receiptScan";

function sortReceiptsWithLocal(currentReceipts: ReceiptEntry[], nextReceipt: ReceiptEntry) {
  return [...currentReceipts.filter((receipt) => receipt.id !== nextReceipt.id), nextReceipt].sort((left, right) =>
    right.purchaseDate.localeCompare(left.purchaseDate),
  );
}

async function pickReceiptFile(mode: "library" | "camera"): Promise<File | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return null;
  }

  return await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    if (mode === "camera") {
      input.setAttribute("capture", "environment");
    }

    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };

    input.oncancel = () => {
      resolve(null);
    };

    input.click();
  });
}

function normalizeDecimalInput(value: string) {
  return value.replace(/,/g, ".");
}

function monthKeyForPurchaseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : currentMonthKey();
}

export default function ReceiptsScreen() {
  const { activeHouseholdId, user } = useSession();
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [purchaseDate, setPurchaseDate] = useState(isoDateToday());
  const [visiblePurchaseMonth, setVisiblePurchaseMonth] = useState(monthKeyForPurchaseDate(isoDateToday()));
  const [storeName, setStoreName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "library" | "camera" | "delete" | null>(null);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);
  const [scanPreviewUri, setScanPreviewUri] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const resetForm = () => {
    setEditingReceiptId(null);
    setTotal("");
    setCurrency("EUR");
    setPurchaseDate(isoDateToday());
    setVisiblePurchaseMonth(monthKeyForPurchaseDate(isoDateToday()));
    setStoreName("");
    setNote("");
    setScanPreviewUri(null);
    setShowDatePicker(false);
  };

  useEffect(() => {
    if (!activeHouseholdId) {
      setReceipts([]);
      return;
    }

    return subscribeReceipts(activeHouseholdId, setReceipts);
  }, [activeHouseholdId]);

  useEffect(() => {
    if (!status || status.tone === "info") {
      return;
    }

    const timeout = setTimeout(() => {
      setStatus(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [status]);

  const monthlyGuess = useMemo(() => purchaseDate.slice(0, 7), [purchaseDate]);

  const handleScan = async (mode: "library" | "camera") => {
    if (Platform.OS !== "web") {
      setStatus({
        tone: "info",
        message: "Receipt scan works on web in this first version. On mobile, fill the receipt fields manually for now.",
      });
      return;
    }

    try {
      setBusy(mode);
      setStatus({ tone: "info", message: mode === "camera" ? "Opening camera..." : "Choose a receipt image..." });

      const file = await pickReceiptFile(mode);

      if (!file) {
        setStatus({ tone: "info", message: "No receipt image was selected." });
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setScanPreviewUri(previewUrl);
      setStatus({ tone: "info", message: "Reading receipt text..." });

      const scan = await scanReceiptImage(file);

      if (scan.total !== null) {
        setTotal(scan.total.toFixed(2));
      }

      if (scan.purchaseDate) {
        setPurchaseDate(scan.purchaseDate);
        setVisiblePurchaseMonth(monthKeyForPurchaseDate(scan.purchaseDate));
      }

      if (scan.storeName) {
        setStoreName(scan.storeName);
      }

      const filledFields = [scan.total !== null ? "total" : null, scan.purchaseDate ? "date" : null, scan.storeName ? "store" : null].filter(Boolean);

      setStatus({
        tone: filledFields.length > 0 ? "success" : "info",
        message:
          filledFields.length > 0
            ? `Receipt scanned. Filled ${filledFields.join(", ")}. Review the values before saving.`
            : "Receipt text was read, but I could not confidently fill the fields. You can enter them manually.",
      });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not scan the receipt image. Please try another photo.") });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    const normalizedTotal = normalizeDecimalInput(total).trim();

    if (!activeHouseholdId || !user || !normalizedTotal) {
      setStatus({ tone: "error", message: "Choose a household and enter a total before saving a receipt." });
      return;
    }

    if (Number.isNaN(Number(normalizedTotal))) {
      setStatus({ tone: "error", message: "Total spent must be a valid number like 45.80." });
      return;
    }

    try {
      setBusy("save");
      setStatus({ tone: "info", message: editingReceiptId ? "Saving receipt changes..." : "Saving receipt..." });

      if (editingReceiptId) {
        await updateReceipt({
          receiptId: editingReceiptId,
          total: Number(normalizedTotal),
          currency,
          purchaseDate,
          linkedMonth: monthlyGuess,
          storeName,
          note,
        });
        setStatus({ tone: "success", message: "Receipt updated successfully." });
      } else {
        const receipt = await createReceipt({
          householdId: activeHouseholdId,
          userId: user.uid,
          total: Number(normalizedTotal),
          currency,
          purchaseDate,
          linkedMonth: monthlyGuess,
          storeName,
          note,
        });
        if (receipt.pendingSync) {
          setReceipts((currentReceipts) => sortReceiptsWithLocal(currentReceipts, receipt));
        }
        setStatus({
          tone: "success",
          message: receipt.pendingSync ? "Receipt saved locally. It will sync once the device reconnects." : "Receipt saved successfully.",
        });
      }

      resetForm();
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not save receipt. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const handleEdit = (receipt: ReceiptEntry) => {
    setEditingReceiptId(receipt.id);
    setTotal(receipt.total.toFixed(2));
    setCurrency(receipt.currency);
    setPurchaseDate(receipt.purchaseDate);
    setVisiblePurchaseMonth(monthKeyForPurchaseDate(receipt.purchaseDate));
    setStoreName(receipt.storeName ?? "");
    setNote(receipt.note ?? "");
    setScanPreviewUri(null);
    setShowDatePicker(false);
    setStatus({ tone: "info", message: "Editing receipt. Update the fields and save your changes." });
  };

  const handleDelete = async (receipt: ReceiptEntry) => {
    try {
      setDeletingReceiptId(receipt.id);
      setBusy("delete");
      setStatus({ tone: "info", message: "Deleting receipt..." });
      await deleteReceipt(receipt.id);

      if (editingReceiptId === receipt.id) {
        resetForm();
      }

      setStatus({ tone: "success", message: "Receipt deleted successfully." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error, "Could not delete receipt. Please try again.") });
    } finally {
      setDeletingReceiptId(null);
      setBusy(null);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        badge="Receipts"
        title="Receipts and bills"
        description="Track totals, dates, stores, and notes in the same calmer shell without competing with the shopping modes."
      >
        <InfoHint message="Receipt images are only used for OCR autofill in this version and are not stored with the receipt." />
      </ScreenHeader>

      <Card>
        {status ? <StatusMessage tone={status.tone} message={status.message} /> : null}
        <View style={styles.formHeader}>
          <Text style={styles.sectionTitle}>{editingReceiptId ? "Edit receipt" : "Add receipt"}</Text>
          {editingReceiptId ? <ActionButton label="Cancel edit" variant="ghost" tone="neutral" onPress={resetForm} /> : null}
        </View>
        <View style={styles.scanActions}>
          <ActionButton label="Upload receipt photo" tone="neutral" variant="secondary" onPress={() => void handleScan("library")} loading={busy === "library"} />
          <ActionButton label="Take receipt photo" tone="neutral" variant="ghost" onPress={() => void handleScan("camera")} loading={busy === "camera"} />
        </View>
        <Text style={styles.helper}>Review any autofilled fields before saving. Only extracted values are stored, not the image itself.</Text>
        {scanPreviewUri ? <Image source={{ uri: scanPreviewUri }} style={styles.previewImage} resizeMode="cover" /> : null}
        <TextField
          label="Total spent"
          keyboardType="decimal-pad"
          value={total}
          onChangeText={(value) => setTotal(normalizeDecimalInput(value))}
          placeholder="45.80"
          tone="neutral"
        />
        <SelectField
          label="Currency"
          value={currency}
          onValueChange={setCurrency}
          options={currencyOptions}
          helperText="Choose the currency used on this receipt."
          tone="neutral"
        />
        <View style={styles.dateFieldWrap}>
          <Text style={styles.fieldLabel}>Purchase date</Text>
          <Pressable style={styles.dateFieldButton} onPress={() => setShowDatePicker((value) => !value)}>
            <View style={styles.dateFieldCopy}>
              <Text style={styles.dateFieldValue}>{formatDayLabel(purchaseDate)}</Text>
              <Text style={styles.dateFieldMeta}>{purchaseDate}</Text>
            </View>
            <Text style={styles.dateFieldAction}>{showDatePicker ? "Hide calendar" : "Open calendar"}</Text>
          </Pressable>
          {showDatePicker ? (
            <DayRangeCalendar
              tone="neutral"
              visibleMonth={visiblePurchaseMonth}
              startDay={purchaseDate}
              endDay={null}
              onVisibleMonthChange={setVisiblePurchaseMonth}
              onSelectDay={(dayKey) => {
                setPurchaseDate(dayKey);
                setVisiblePurchaseMonth(monthKeyForPurchaseDate(dayKey));
                setShowDatePicker(false);
              }}
            />
          ) : null}
        </View>
        <TextField label="Store name" value={storeName} onChangeText={setStoreName} placeholder="Lidl, Spar, local market..." tone="neutral" />
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Weekly restock with extra snacks" tone="neutral" />
        <ActionButton label={editingReceiptId ? "Save changes" : "Save receipt"} tone="neutral" onPress={handleSave} loading={busy === "save"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent receipts</Text>
        {receipts.length === 0 ? (
          <EmptyState tone="neutral" title="No receipts yet" description="Add a receipt to start building daily, monthly, and yearly spending views." />
        ) : (
          receipts.map((receipt) => (
            <View key={receipt.id} style={styles.receiptRow}>
              <View style={styles.receiptCopy}>
                <Text style={styles.amount}>
                  {receipt.total.toFixed(2)} {receipt.currency}
                </Text>
                {receipt.pendingSync ? <Text style={styles.pending}>Saved locally. Waiting for internet.</Text> : null}
                <Text style={styles.meta}>
                  {displayDate(receipt.purchaseDate)}
                  {receipt.storeName ? ` • ${receipt.storeName}` : ""}
                </Text>
                {receipt.note ? <Text style={styles.meta}>{receipt.note}</Text> : null}
              </View>
              <View style={styles.receiptActions}>
                <Pressable style={styles.secondaryButton} onPress={() => handleEdit(receipt)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, deletingReceiptId === receipt.id ? styles.secondaryButtonBusy : null]}
                  onPress={() => void handleDelete(receipt)}
                  disabled={busy === "delete"}
                >
                  <Text style={styles.secondaryButtonText}>{deletingReceiptId === receipt.id ? "Deleting..." : "Delete"}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.size.section,
    fontFamily: theme.typography.fonts.title,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.typography.fonts.label,
  },
  scanActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dateFieldWrap: {
    gap: 8,
  },
  dateFieldButton: {
    minHeight: theme.components.inputHeight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateFieldCopy: {
    flex: 1,
    gap: 4,
  },
  dateFieldValue: {
    color: theme.colors.text,
    fontSize: theme.typography.size.body,
  },
  dateFieldMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.helper,
  },
  dateFieldAction: {
    color: theme.colors.info,
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
  helper: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
    lineHeight: 20,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  receiptRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  receiptCopy: {
    flex: 1,
    gap: 4,
  },
  receiptActions: {
    gap: 8,
    alignItems: "flex-end",
  },
  amount: {
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: theme.typography.fonts.heading,
  },
  pending: {
    color: theme.colors.info,
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
  },
  meta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.meta,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonBusy: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontFamily: theme.typography.fonts.label,
  },
});
