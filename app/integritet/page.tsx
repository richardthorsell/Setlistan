import type { Metadata } from "next";
import PrivacyContent from "../PrivacyContent";

export const metadata: Metadata = { title: "Integritetspolicy · Setlistan", description: "Hur Setlistan behandlar dina personuppgifter." };

export default function Page() {
  return <PrivacyContent />;
}
