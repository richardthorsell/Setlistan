"use client";

import LegalPage from "./LegalPage";
import { LEGAL } from "@/lib/legal";

// English versions of the privacy policy and the terms (the Swedish originals are in PrivacyContent and TermsContent).
const contactLink = LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : <>the Feedback button in the app</>;

export function PrivacyEn() {
  const contact = contactLink;
  return (
    <LegalPage title="Privacy policy" intro="This page explains which personal data Setlistan processes, why, for how long, and which rights you have under the General Data Protection Regulation (GDPR).">
      <h2>Who is responsible for the data</h2>
      <p>
        The owner of {LEGAL.service} ({LEGAL.site}) is the data controller. Contact: {contact}.
      </p>

      <h2>What we process and why</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Data</th><th>Purpose</th><th>Legal basis</th><th>How long</th></tr>
          </thead>
          <tbody>
            <tr><td>E-mail address and password (the password is stored only as an encrypted hash)</td><td>Create an account and sign in</td><td>Contract (providing the service)</td><td>As long as the account exists</td></tr>
            <tr><td>Your collection: ticked cards, copies, parallels, serial numbers, favourite albums, favourite cards, followed players and wishlist</td><td>Show what you have and what you are missing</td><td>Contract</td><td>As long as the account exists</td></tr>
            <tr><td>Cards you mark as for sale, prices you enter yourself (cost and asking price) and cards that are on their way, with your own note about the purchase</td><td>Show the value of your collection, prepare sales and keep track of purchases that have not arrived</td><td>Contract</td><td>As long as the account exists</td></tr>
            <tr><td>Name and e-mail on the waitlist</td><td>Invite you to the beta and e-mail you about it</td><td>Consent</td><td>Until you get an invitation and create an account, or ask us to remove you</td></tr>
            <tr><td>Feedback and set suggestions (text and your e-mail)</td><td>Improve the service and add requested sets</td><td>Contract and legitimate interest</td><td>As long as the account exists</td></tr>
            <tr><td>Technical information (IP address, browser, time) in server logs</td><td>Operation, troubleshooting and security</td><td>Legitimate interest</td><td>According to the providers' log routines</td></tr>
            <tr><td>Quota log for Tradera searches (your account and time, not what you searched for)</td><td>Prevent overuse</td><td>Legitimate interest</td><td>48 hours</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Tradera searches are saved in a history showing what was searched and what it cost, but with no link to you. We do not sell your data and do not use it for advertising or profiling.
      </p>

      <p>
        Sales posts you create in the app (for Facebook, Tradera or eBay) are created in your browser and are not stored by us. eBay searches are not stored in our database. The note you write about a purchase should not contain personal data about others, such as a seller&apos;s name or address.
      </p>

      <p>
        If you choose to share a list (missing cards or duplicates for a set), a link is created that anyone who has it can open. It shows only the card list, never your name or e-mail, and you can switch the link off at any time under the set in the app.
      </p>

      <h2>Who gets access (processors)</h2>
      <ul>
        <li><b>Supabase</b>: database and sign-in. The data is stored in the EU (Ireland).</li>
        <li><b>Vercel</b>: hosting of the website, with servers in the EU (Dublin).</li>
        <li><b>Resend</b>: sends e-mail, for example waitlist confirmations and invitations. Resend may process data outside the EU/EEA, in which case the transfer relies on the EU standard contractual clauses or an equivalent safeguard.</li>
      </ul>
      <p>We do not send personal data to Tradera or to AI services. Administrators can see your data to the extent needed to run the service, for example your e-mail for invitations and feedback.</p>

      <h2>Cookies and browser storage</h2>
      <p>
        We only use what is needed for the service to work: a sign-in session in a necessary cookie (and equivalent browser storage), plus your language choice. We use no cookies for analytics, advertising or tracking, so no cookie banner is shown.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li><b>Access and data portability:</b> under <i>Account</i> in the app you can download everything we have saved about you as a file.</li>
        <li><b>Erasure:</b> under <i>Account</i> you can delete your account. Your data is then deleted immediately, including your collection, favourites, feedback, suggestions and waitlist sign-up. Administrator accounts are removed by another superuser.</li>
        <li><b>Rectification, restriction and objection:</b> you can ask us to correct or restrict processing, or object to it, by contacting us: {contact}.</li>
        <li><b>Withdraw consent:</b> you can withdraw your consent to the waitlist at any time. It does not affect processing before then.</li>
        <li><b>Complaints:</b> you have the right to complain to the Swedish Authority for Privacy Protection (<a href="https://www.imy.se" rel="noopener noreferrer">imy.se</a>).</li>
      </ul>
      <p>We answer requests within one month.</p>

      <h2>Security</h2>
      <p>
        Data is protected with row-level security in the database so that you only reach your own, encrypted transfer (https) and restricted access for administrators. No service is completely secure, and we act on and report incidents as required by law.
      </p>

      <h2>Backups</h2>
      <p>Deletion takes effect immediately in the service. Backups at our providers may contain the data for a limited time before they are overwritten.</p>

      <h2>Changes</h2>
      <p>If we change the policy in a way that affects you, we will say so in the app under <i>News</i>. The date at the top shows when it was last updated.</p>
    </LegalPage>
  );
}

export function TermsEn() {
  const contact = contactLink;
  return (
    <LegalPage title="Terms of use" intro="These terms apply when you use Setlistan. By creating an account or using the service you accept them.">
      <h2>The service</h2>
      <p>
        {LEGAL.service} is a tool for collectors where you find checklists, tick off the cards you have and see what is missing. The service is free and is currently an invitation-only beta. It may change, gain or lose features, or be discontinued.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for keeping your sign-in details secret and for what happens with your account.</li>
        <li>The service is intended for people who are at least 13 years old.</li>
        <li>Use an e-mail address that is your own. The account is personal.</li>
        <li>You can delete your account at any time under <i>Account</i> in the app.</li>
      </ul>

      <h2>Content and sources</h2>
      <ul>
        <li>The checklists come from open sources such as manufacturers' own lists and collector sites, and are compiled automatically. They may contain errors or be changed by the manufacturer. Always check against the back of the card or the manufacturer's own list when it matters.</li>
        <li>Names and trademarks such as Topps, Panini, Futera and Tradera belong to their respective owners. {LEGAL.service} is not affiliated with them and is not endorsed by them.</li>
        <li>Prices and sold auctions come from Tradera's open interface. They are information, not a valuation or advice, and may differ from what you can get for a card yourself.</li>
      </ul>

      <h2>Your collection and contributions</h2>
      <p>
        What you tick off, mark as a favourite and write is yours. You give us the right to store and show it to you so the service works. We may use feedback and set suggestions freely to improve the service, without compensation.
      </p>

      <h2>What you may not do</h2>
      <ul>
        <li>Extract data automatically at scale (scraping) or otherwise overload the service.</li>
        <li>Try to get around the invitation, quotas or other people's account protection.</li>
        <li>Submit content that is unlawful, offensive or misleading.</li>
        <li>Use the service or its content commercially without our permission.</li>
      </ul>
      <p>We may suspend an account that misuses the service.</p>

      <h2>Liability</h2>
      <p>
        The service is provided as is, with no guarantee that it always works or that the content is error-free. To the extent the law allows, we are not liable for indirect damage, such as lost profit or lost data. Keep your own backups of lists you do not want to lose, for example with the export function. Your rights as a consumer under mandatory law are not affected.
      </p>

      <h2>Personal data</h2>
      <p>
        How we process your personal data is described in the <a href="/integritet">privacy policy</a>.
      </p>

      <h2>Changes to the terms</h2>
      <p>
        We may update the terms. Material changes are announced in the app under <i>News</i>. If you keep using the service after a change you accept the new terms.
      </p>

      <h2>Law and disputes</h2>
      <p>
        Swedish law applies. Disputes that cannot be settled amicably are decided by a Swedish court. As a consumer you can also turn to the National Board for Consumer Disputes (<a href="https://www.arn.se" rel="noopener noreferrer">arn.se</a>).
      </p>

      <h2>Contact</h2>
      <p>
        The owner of {LEGAL.service}. Contact: {contact}.
      </p>
    </LegalPage>
  );
}
