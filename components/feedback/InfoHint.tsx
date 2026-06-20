import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { type AccentTone, getAccentColors, theme } from "@/lib/theme";

type InfoHintProps = {
  message: string;
  tone?: AccentTone;
};

type AnchorFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function InfoHint({ message, tone = "neutral" }: InfoHintProps) {
  const triggerRef = useRef<View | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<AnchorFrame | null>(null);
  const accent = getAccentColors(tone);

  const openHint = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setVisible(true);
    });
  };

  const closeHint = () => {
    setVisible(false);
  };

  const bubbleWidth = Math.min(260, windowWidth - 32);
  const bubbleLeft = anchor ? Math.max(16, Math.min(anchor.x - 6, windowWidth - bubbleWidth - 16)) : 16;
  const showAbove = !!anchor && anchor.y > windowHeight * 0.55;

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityHint="Shows more information"
        accessibilityLabel="More information"
        accessibilityRole="button"
        onLongPress={openHint}
        onPress={() => {
          if (visible) {
            closeHint();
            return;
          }

          openHint();
        }}
        style={({ pressed }) => [
          styles.iconButton,
          {
            borderColor: accent.softBorder,
            backgroundColor: accent.soft,
          },
          pressed ? styles.iconButtonPressed : null,
        ]}
      >
        <Text style={[styles.iconLabel, { color: accent.solid }]}>i</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={visible} onRequestClose={closeHint}>
        <View style={styles.modalLayer}>
          <Pressable style={styles.backdrop} onPress={closeHint} />
          {anchor ? (
            <View
              style={[
                styles.popover,
                {
                  width: bubbleWidth,
                  left: bubbleLeft,
                  top: showAbove ? undefined : anchor.y + anchor.height + 8,
                  bottom: showAbove ? windowHeight - anchor.y + 8 : undefined,
                },
              ]}
            >
              <Text style={styles.popoverText}>{message}</Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginTop: 2,
  },
  iconButtonPressed: {
    opacity: 0.82,
  },
  iconLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fonts.label,
    lineHeight: 14,
  },
  modalLayer: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  popover: {
    position: "absolute",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...theme.shadow.card,
  },
  popoverText: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
});
