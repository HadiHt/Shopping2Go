import { useEffect, useState } from "react";
import { AppState } from "react-native";

const CONNECTIVITY_CHECK_URL = "https://clients3.google.com/generate_204";

function browserOnlineState() {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }

  return true;
}

async function probeInternetConnection() {
  if (!browserOnlineState()) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${CONNECTIVITY_CHECK_URL}?t=${Date.now()}`, {
      method: "GET",
      signal: controller.signal,
    });

    return response.ok || response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(browserOnlineState);

  useEffect(() => {
    let active = true;
    const canListenToBrowserNetworkEvents =
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function" &&
      typeof window.removeEventListener === "function";

    const runProbe = async () => {
      const nextIsOnline = await probeInternetConnection();

      if (active) {
        setIsOnline(nextIsOnline);
      }
    };

    void runProbe();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runProbe();
      }
    });

    const interval = setInterval(() => {
      void runProbe();
    }, 15000);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (canListenToBrowserNetworkEvents) {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      active = false;
      appStateSubscription.remove();
      clearInterval(interval);

      if (canListenToBrowserNetworkEvents) {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  return { isOnline };
}
