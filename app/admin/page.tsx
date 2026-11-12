import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminApp from "./AdminApp";
import AdminLogin from "./AdminLogin";

export const dynamic = "force-dynamic";

// setlistan.se/admin: the same sign-in as the service. Someone who is signed in but is not an admin gets a 404.
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <AdminLogin />;
  const { data: role } = await supabase.rpc("admin_role");
  if (role !== "admin" && role !== "superuser") notFound();
  return <AdminApp role={role} email={user.email ?? ""} />;
}
