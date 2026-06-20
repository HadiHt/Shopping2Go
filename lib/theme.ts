export type AccentTone = "neutral" | "anytime" | "monthly";

type AccentPalette = {
  solid: string;
  soft: string;
  softBorder: string;
  contrast: string;
};

const accents: Record<AccentTone, AccentPalette> = {
  neutral: {
    solid: "#516B5E",
    soft: "#E6EEE7",
    softBorder: "#C9D8CC",
    contrast: "#FFFFFF",
  },
  anytime: {
    solid: "#187A5D",
    soft: "#DDF3EB",
    softBorder: "#B6DDCF",
    contrast: "#FFFFFF",
  },
  monthly: {
    solid: "#C96E3A",
    soft: "#F8E3D7",
    softBorder: "#E9BFAB",
    contrast: "#FFFFFF",
  },
};

export const theme = {
  colors: {
    background: "#F6F1E8",
    backgroundMuted: "#EFE7DB",
    surface: "#FFFDF9",
    surfaceAlt: "#F3ECE1",
    surfaceStrong: "#FFFFFF",
    border: "#DDD4C6",
    borderStrong: "#C8BDAE",
    text: "#1F2A24",
    mutedText: "#6C6A63",
    success: "#1C7C54",
    danger: "#B64545",
    info: "#406E8E",
    primary: accents.anytime.solid,
    primarySoft: accents.anytime.soft,
    accent: accents.monthly.solid,
  },
  accents,
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  radius: {
    xs: 8,
    sm: 14,
    md: 20,
    lg: 28,
    pill: 999,
  },
  shadow: {
    card: {
      shadowColor: "#2D2A24",
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      elevation: 4,
    },
  },
  typography: {
    fonts: {
      heading: "PlusJakartaSans_800ExtraBold",
      title: "PlusJakartaSans_700Bold",
      label: "PlusJakartaSans_600SemiBold",
      action: "PlusJakartaSans_700Bold",
      body: undefined,
    },
    size: {
      eyebrow: 12,
      body: 15,
      meta: 13,
      helper: 12,
      section: 20,
      title: 30,
      display: 34,
    },
    lineHeight: {
      body: 22,
      meta: 18,
      title: 36,
      display: 40,
    },
  },
  components: {
    buttonHeight: 52,
    inputHeight: 56,
    cardPadding: 18,
    tabBarHeight: 70,
  },
};

export function getAccentColors(tone: AccentTone = "neutral") {
  return theme.accents[tone];
}
