import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSessionUser, isAdmin } from "@/lib/session";
import AkunForm from "./AkunForm";

export const dynamic = "force-dynamic";

export default async function AkunPage() {
  const user = await getSessionUser();
  
  if (!user) {
    redirect("/login");
  }

  // Jika admin, biarkan saja mereka mengakses atau arahkan ke admin users. 
  // Untuk keseragaman, admin sebaiknya edit akun di /admin/users, tapi tidak apa-apa kalau admin buka ini.
  if (isAdmin(user)) {
    redirect("/admin/users");
  }

  return (
    <AppShell user={user}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Pengaturan Akun</span>
          <h1>Akun Saya</h1>
          <p>Perbarui informasi data diri dan kata sandi Anda di bawah ini.</p>
        </div>
      </div>

      <AkunForm user={user} />
    </AppShell>
  );
}
