import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AdminUserManager from "@/components/AdminUserManager";
import { getAdminUsers } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  const users = await getAdminUsers();
  return (
    <AppShell user={user}>
      <div className="page-heading"><div><span className="eyebrow">Kontrol Akses</span><h1>Kelola Akun Pengguna</h1><p>Tambah atau edit akun, buka detail biodata lengkap, atur role, ubah password, dan hapus akun yang belum memilih.</p></div></div>
      <AdminUserManager users={users} currentUserId={user.id} />
    </AppShell>
  );
}
