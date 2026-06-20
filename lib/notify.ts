import { Alert, Platform, ToastAndroid } from "react-native";

export type NoticeTone = "success" | "error" | "info";

export function showNotice(message: string, tone: NoticeTone = "info") {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return;
  }

  if (Platform.OS === "android") {
    ToastAndroid.show(trimmedMessage, tone === "error" ? ToastAndroid.LONG : ToastAndroid.SHORT);
    return;
  }

  const title = tone === "error" ? "Something went wrong" : tone === "success" ? "Done" : "Heads up";
  Alert.alert(title, trimmedMessage);
}
