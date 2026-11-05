import type { Metadata } from "next";
import LegalPage from "../LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Integritetspolicy · Setlistan", description: "Hur Setlistan behandlar dina personuppgifter." };

export default function Page() {
  const contact = LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : <>Feedback-knappen i appen</>;
  return (
    <LegalPage title="Integritetspolicy" intro="Här står vilka personuppgifter Setlistan behandlar, varför, hur länge och vilka rättigheter du har enligt dataskyddsförordningen (GDPR).">
      <h2>Vem ansvarar för uppgifterna</h2>
      <p>
        {LEGAL.controller} är personuppgiftsansvarig för {LEGAL.service} ({LEGAL.site}). Kontakt: {contact}.
      </p>

      <h2>Vilka uppgifter vi behandlar och varför</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Uppgift</th><th>Syfte</th><th>Rättslig grund</th><th>Hur länge</th></tr>
          </thead>
          <tbody>
            <tr><td>E-postadress och lösenord (lösenordet sparas bara som krypterad hash)</td><td>Skapa konto och logga in</td><td>Avtal (att tillhandahålla tjänsten)</td><td>Så länge kontot finns</td></tr>
            <tr><td>Din samling: avprickade kort, paralleller, serienummer, favoritalbum och favoritkort</td><td>Visa vad du har och saknar</td><td>Avtal</td><td>Så länge kontot finns</td></tr>
            <tr><td>Namn och e-post på väntelistan</td><td>Bjuda in dig till betan och mejla dig om det</td><td>Samtycke</td><td>Tills du får en inbjudan och skapar konto, eller tills du ber oss ta bort dig</td></tr>
            <tr><td>Feedback och förslag på set (text och din e-post)</td><td>Förbättra tjänsten och lägga in önskade set</td><td>Avtal och berättigat intresse</td><td>Så länge kontot finns</td></tr>
            <tr><td>Teknisk information (IP-adress, webbläsare, tidpunkt) i serverloggar</td><td>Drift, felsökning och säkerhet</td><td>Berättigat intresse</td><td>Enligt leverantörernas loggrutiner</td></tr>
            <tr><td>Kvotlogg för Tradera-sökningar (ditt konto och tidpunkt, inte vad du sökte)</td><td>Hindra överanvändning</td><td>Berättigat intresse</td><td>48 timmar</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Tradera-sökningar sparas i en historik som visar vad som sökts och vad det kostade, men utan någon koppling till dig. Vi säljer inte dina uppgifter och använder dem inte för reklam eller profilering.
      </p>

      <h2>Vilka som får tillgång (personuppgiftsbiträden)</h2>
      <ul>
        <li><b>Supabase</b>: databas och inloggning. Datan ligger i EU (Irland).</li>
        <li><b>Vercel</b>: hosting av webbplatsen, med servrar i EU (Dublin).</li>
        <li><b>Resend</b>: skickar e-post, till exempel bekräftelse på väntelistan och inbjudningar. Resend kan behandla uppgifter utanför EU/EES. Överföring sker då med stöd av EU:s standardavtalsklausuler eller motsvarande skyddsmekanism.</li>
      </ul>
      <p>Vi skickar inga personuppgifter till Tradera eller till AI-tjänster. Administratörer kan se dina uppgifter i den utsträckning det behövs för att driva tjänsten, till exempel e-post vid inbjudan och feedback.</p>

      <h2>Kakor och lagring i webbläsaren</h2>
      <p>
        Vi använder bara det som krävs för att tjänsten ska fungera: en inloggningssession i en nödvändig kaka (och motsvarande lagring i webbläsaren). Vi använder inga kakor för analys, reklam eller spårning, och därför visas ingen kakbanner.
      </p>

      <h2>Dina rättigheter</h2>
      <ul>
        <li><b>Tillgång och dataportabilitet:</b> under <i>Konto</i> i appen kan du ladda ner allt vi har sparat om dig som en fil.</li>
        <li><b>Radering:</b> under <i>Konto</i> kan du ta bort ditt konto. Då raderas dina uppgifter direkt, inklusive din samling, favoriter, feedback, förslag och väntelisteanmälan. Administratörskonton tas bort av en annan superuser.</li>
        <li><b>Rättelse, begränsning och invändning:</b> du kan be oss rätta eller begränsa behandlingen, eller invända mot den, genom att kontakta oss: {contact}.</li>
        <li><b>Återkalla samtycke:</b> du kan när som helst dra tillbaka ditt samtycke till väntelistan. Det påverkar inte behandlingen innan dess.</li>
        <li><b>Klagomål:</b> du har rätt att klaga hos Integritetsskyddsmyndigheten (<a href="https://www.imy.se" rel="noopener noreferrer">imy.se</a>).</li>
      </ul>
      <p>Vi svarar på förfrågningar inom en månad.</p>

      <h2>Säkerhet</h2>
      <p>
        Uppgifterna skyddas med radnivåsäkerhet i databasen så att du bara når dina egna, krypterad överföring (https) och begränsad åtkomst för administratörer. Ingen tjänst är helt säker, och vi åtgärdar och informerar vid incidenter enligt lagkraven.
      </p>

      <h2>Säkerhetskopior</h2>
      <p>Radering gäller direkt i tjänsten. Säkerhetskopior hos våra leverantörer kan innehålla uppgifterna under en begränsad tid innan de skrivs över.</p>

      <h2>Ändringar</h2>
      <p>Om vi ändrar policyn på ett sätt som påverkar dig meddelar vi det i appen under <i>Nytt</i>. Datumet överst visar när den senast uppdaterades.</p>
    </LegalPage>
  );
}
