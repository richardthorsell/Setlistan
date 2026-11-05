"use client";

import LegalPage from "./LegalPage";
import { LEGAL } from "@/lib/legal";
import { useLang, useT } from "@/lib/i18n";
import { TermsEn } from "./LegalEn";

export default function TermsContent() {
  const t = useT();
  const { lang } = useLang();
  if (lang === "en") return <TermsEn />;
  const contact = LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : <>{t("Feedback-knappen i appen")}</>;
  return (
    <LegalPage title={t("Användarvillkor")} intro="Villkoren gäller när du använder Setlistan. Genom att skapa ett konto eller använda tjänsten godkänner du dem.">
      <h2>Tjänsten</h2>
      <p>
        {LEGAL.service} är ett verktyg för samlare där du söker fram checklistor, prickar av kort du har och ser vad som saknas. Tjänsten är gratis och är just nu en betaversion på inbjudan. Den kan ändras, få nya funktioner, ta bort funktioner eller avslutas.
      </p>

      <h2>Ditt konto</h2>
      <ul>
        <li>Du ansvarar för att hålla dina inloggningsuppgifter hemliga och för det som sker med ditt konto.</li>
        <li>Tjänsten riktar sig till personer som är minst 13 år.</li>
        <li>Uppge en e-postadress som är din egen. Kontot är personligt.</li>
        <li>Du kan ta bort kontot när som helst under <i>{t("Konto")}</i> i appen.</li>
      </ul>

      <h2>Innehåll och källor</h2>
      <ul>
        <li>Checklistorna kommer från öppna källor som tillverkarnas egna listor och samlarsajter, och är sammanställda automatiskt. De kan innehålla fel eller ändras av tillverkaren. Kontrollera alltid mot kortens baksida eller tillverkarens egen lista när det är viktigt.</li>
        <li>Namn och varumärken som Topps, Panini, Futera och Tradera tillhör respektive ägare. {LEGAL.service} har ingen koppling till dem och är inte godkänt av dem.</li>
        <li>Priser och sålda auktioner kommer från Traderas öppna gränssnitt. De är information, inte värdering eller rådgivning, och kan avvika från det du själv kan få för ett kort.</li>
      </ul>

      <h2>Din samling och dina bidrag</h2>
      <p>
        Det du prickar av, favoritmarkerar och skriver är ditt. Du ger oss rätt att lagra och visa det för dig så att tjänsten fungerar. Feedback och förslag på set får vi använda fritt för att förbättra tjänsten, utan ersättning.
      </p>

      <h2>Så får du inte använda tjänsten</h2>
      <ul>
        <li>Hämta ut data automatiskt i stor skala (skrapa) eller på annat sätt belasta tjänsten.</li>
        <li>Försöka ta dig förbi inbjudan, kvoter eller andras kontoskydd.</li>
        <li>Skicka in innehåll som är olagligt, kränkande eller vilseledande.</li>
        <li>Använda tjänsten eller dess innehåll kommersiellt utan vårt tillstånd.</li>
      </ul>
      <p>Vi kan stänga av ett konto som missbrukar tjänsten.</p>

      <h2>Ansvar</h2>
      <p>
        Tjänsten tillhandahålls i befintligt skick, utan garanti för att den alltid fungerar eller att innehållet är felfritt. I den utsträckning lagen tillåter ansvarar vi inte för indirekta skador, till exempel utebliven vinst eller förlorad data. Gör egna säkerhetskopior av listor du inte vill förlora, till exempel med exportfunktionen. Dina rättigheter som konsument enligt tvingande lag påverkas inte.
      </p>

      <h2>Personuppgifter</h2>
      <p>
        Hur vi behandlar dina personuppgifter framgår av <a href="/integritet">{t("integritetspolicyn")}</a>.
      </p>

      <h2>Ändringar av villkoren</h2>
      <p>
        Vi kan uppdatera villkoren. Väsentliga ändringar meddelas i appen under <i>{t("Nytt")}</i>. Om du fortsätter använda tjänsten efter en ändring godkänner du de nya villkoren.
      </p>

      <h2>Lag och tvister</h2>
      <p>
        Svensk lag gäller. Tvister som inte går att lösa i samförstånd avgörs av svensk domstol. Som konsument kan du även vända dig till Allmänna reklamationsnämnden (<a href="https://www.arn.se" rel="noopener noreferrer">arn.se</a>).
      </p>

      <h2>{t("Kontakt")}</h2>
      <p>
        {LEGAL.controller}. Kontakt: {contact}.
      </p>
    </LegalPage>
  );
}
