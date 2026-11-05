import type { Metadata } from "next";
import TermsContent from "../TermsContent";

export const metadata: Metadata = { title: "Användarvillkor · Setlistan", description: "Villkor för att använda Setlistan." };

export default function Page() {
  return <TermsContent />;
}
