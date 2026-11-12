import App from "./App";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  // Without a session the landing page is rendered on the server, so its text is in the HTML that search engines read.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return <App signedOut={!data.user} />;
}
