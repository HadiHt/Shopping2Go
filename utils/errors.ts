export function getErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if ("code" in error && typeof error.code === "string") {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "That email is already registered. Try signing in instead.";
      case "auth/invalid-email":
        return "The email address format looks invalid.";
      case "auth/weak-password":
        return "Use a stronger password with at least 6 characters.";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is incorrect.";
      case "auth/network-request-failed":
        return "Network request failed. Check your connection and try again.";
      case "permission-denied":
        return error.message || "Firebase denied this action.";
      default:
        break;
    }
  }

  return error.message || fallback;
}
