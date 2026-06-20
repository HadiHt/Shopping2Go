import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionButton } from "@/components/forms/ActionButton";
import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

type ScreenProps = PropsWithChildren<{
  padded?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}>;

type CardProps = PropsWithChildren<{
  tone?: AccentTone;
  style?: StyleProp<ViewStyle>;
}>;

type ScreenHeaderProps = {
  tone?: AccentTone;
  badge?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
};

type EmptyStateProps = {
  tone?: AccentTone;
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function Screen({ children, padded = true, contentContainerStyle }: ScreenProps) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <ScrollView
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, padded && styles.padded, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, tone = "neutral", style }: CardProps) {
  const accent = getAccentColors(tone);

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: tone === "neutral" ? theme.colors.border : accent.softBorder,
          backgroundColor: tone === "neutral" ? theme.colors.surfaceStrong : theme.colors.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionCard({ children, tone = "neutral", style }: CardProps) {
  const accent = getAccentColors(tone);

  return (
    <Card
      tone={tone}
      style={[
        tone !== "neutral"
          ? {
              backgroundColor: accent.soft,
              borderColor: accent.softBorder,
            }
          : null,
        style,
      ]}
    >
      {children}
    </Card>
  );
}

export function ModeBadge({ tone = "neutral", children }: PropsWithChildren<{ tone?: AccentTone }>) {
  const accent = getAccentColors(tone);

  return (
    <View style={[styles.badge, { backgroundColor: accent.soft, borderColor: accent.softBorder }]}>
      <Text style={[styles.badgeText, { color: accent.solid }]}>{children}</Text>
    </View>
  );
}

export function ScreenHeader({ tone = "neutral", badge, title, description, action, children }: ScreenHeaderProps) {
  return (
    <SectionCard tone={tone} style={styles.headerCard}>
      <View style={styles.headerTopRow}>
        {badge ? <ModeBadge tone={tone}>{badge}</ModeBadge> : <View />}
        {action}
      </View>
      <Text style={styles.headerTitle}>{title}</Text>
      {description ? <Text style={styles.headerDescription}>{description}</Text> : null}
      {children}
    </SectionCard>
  );
}

export function EmptyState({ tone = "neutral", title, description, actionLabel, onActionPress }: EmptyStateProps) {
  return (
    <SectionCard tone={tone} style={styles.emptyState}>
      <ModeBadge tone={tone}>Empty</ModeBadge>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {actionLabel && onActionPress ? (
        <ActionButton label={actionLabel} tone={tone} variant="secondary" onPress={onActionPress} />
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.spacing.lg,
  },
  padded: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    borderRadius: theme.radius.md,
    padding: theme.components.cardPadding,
    borderWidth: 1,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  headerCard: {
    gap: theme.spacing.sm,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    fontSize: theme.typography.size.eyebrow,
    fontFamily: theme.typography.fonts.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.size.display,
    lineHeight: theme.typography.lineHeight.display,
    fontFamily: theme.typography.fonts.heading,
  },
  headerDescription: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.body,
    lineHeight: theme.typography.lineHeight.body,
  },
  emptyState: {
    alignItems: "flex-start",
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.size.section,
    fontFamily: theme.typography.fonts.title,
  },
  emptyDescription: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.size.body,
    lineHeight: theme.typography.lineHeight.body,
  },
});
