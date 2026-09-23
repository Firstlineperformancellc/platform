import { Platform } from "react-native";

// Where the public pages live for this environment (terms, privacy, how it works).
export function marketingUrl(path = "") {
  const host = Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : "";
  const base = /^(dev\.|localhost)/.test(host) ? "https://dev.firstlineperform.com/site" : "https://beta.firstlineperform.com";
  return `${base}/${path}`;
}
