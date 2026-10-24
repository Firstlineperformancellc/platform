import { Linking, Platform } from "react-native";

// The agreement every mentor signs when they apply. The PDF ships with the web app under /legal;
// the version string is the date it was adopted plus the file's checksum prefix, so a signature
// always says exactly which text was signed.
export const AGREEMENT = {
  title: "FLP Athlete Independent Contractor Agreement",
  version: "2026-10-13-c99272e3",
  path: "/legal/FLP-Athlete-Independent-Contractor-Agreement.pdf",
};

// The mentor manual, shipped the same way. Rebuild with docs/manual/build.sh after editing the HTML.
export const MANUAL = {
  title: "Mentor FLP Service User Manual",
  path: "/manual/FLP-Mentor-Service-User-Manual.pdf",
};

function appOrigin() {
  if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
  return process.env.EXPO_PUBLIC_APP_ORIGIN ?? "https://app.firstlineperform.com";
}

export const ADMIN_MANUAL = {
  title: "Admin User Manual",
  path: "/manual/FLP-Admin-User-Manual.pdf",
};

// The parent guide, the third manual in the set. Same build script, same folder.
export const PARENT_GUIDE = {
  title: "FLP Parent Guide",
  path: "/manual/FLP-Parent-Guide.pdf",
  edition: "1.0",
};

export function manualUrl(which: "mentor" | "admin" | "parent" = "mentor") {
  const path = which === "admin" ? ADMIN_MANUAL.path : which === "parent" ? PARENT_GUIDE.path : MANUAL.path;
  return `${appOrigin()}${path}`;
}

export function openParentGuide() {
  const url = manualUrl("parent");
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else Linking.openURL(url).catch(() => {});
}

export function openAdminManual() {
  const url = manualUrl("admin");
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else Linking.openURL(url).catch(() => {});
}

// Alex's script for the breakdown video (supplied 2026-09-23), shipped next to the manual. The source
// copy lives in docs/manual; replace both files together if FLP revises it.
export const FRAMEWORK = {
  title: "Athlete Film Breakdown Framework",
  path: "/manual/FLP-Athlete-Film-Breakdown-Framework.pdf",
};

export function openFramework() {
  const url = `${appOrigin()}${FRAMEWORK.path}`;
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else Linking.openURL(url).catch(() => {});
}

export function openManual() {
  const url = `${appOrigin()}${MANUAL.path}`;
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else Linking.openURL(url).catch(() => {});
}

export function agreementUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined") return `${window.location.origin}${AGREEMENT.path}`;
  return `${process.env.EXPO_PUBLIC_APP_ORIGIN ?? "https://app.firstlineperform.com"}${AGREEMENT.path}`;
}

export function openAgreement() {
  const url = agreementUrl();
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else Linking.openURL(url).catch(() => {});
}

// What the applicant signs with: the typed full legal name is the signature, plus where they live
// (the agreement names the state/province) and a parent or guardian for minors.
export type AgreementSignature = {
  version: string;
  signed_name: string;
  residence: string;
  guardian_name: string | null;
  signed_at: string;
  user_agent: string | null;
};
