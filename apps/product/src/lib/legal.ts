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
