"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import LoadingButton from "@/components/LoadingButton";
import type { AdminUserRecord, UserRole } from "@/lib/types";

const ITEMS_PER_PAGE = 20;

function getPaginationItems(currentPage: number, totalPages: number) {
  const items: (number | string)[] = [];
  
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    if (currentPage <= 4) {
      items.push(1, 2, 3, 4, 5, '...', totalPages);
    } else if (currentPage >= totalPages - 3) {
      items.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      items.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
  }
  return items;
}

const emptyForm = { id: 0, userId: "", displayName: "", password: "", confirmPassword: "", role: "Alumni" as UserRole };

export default function AdminUserManager({ users, currentUserId }: { users: AdminUserRecord[]; currentUserId: number }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "voted" | "not_voted">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    let result = users;
    
    if (statusFilter === "voted") {
      result = result.filter(user => user.hasVoted);
    } else if (statusFilter === "not_voted") {
      result = result.filter(user => !user.hasVoted);
    }

    if (roleFilter !== "all") {
      result = result.filter(user => user.role === roleFilter);
    }
    
    if (!needle) return result;
    return result.filter((user) => 
      [user.userId, user.displayName, user.role].filter(Boolean).some((value) => value!.toLowerCase().includes(needle))
    );
  }, [search, statusFilter, roleFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  
  const paginatedUsers = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safeCurrentPage]);

  function edit(user: AdminUserRecord) {
    setForm({ id: user.id, userId: user.userId, displayName: user.displayName, password: "", confirmPassword: "", role: user.role });
    setMessage(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (form.password && form.password !== form.confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(form.id ? `/api/admin/users/${form.id}` : "/api/admin/users", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Akun gagal disimpan.");
      setMessage(form.id ? "Akun berhasil diperbarui." : "Akun berhasil ditambahkan.");
      setForm(emptyForm); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Akun gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function action(url: string, method: "POST" | "DELETE", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Tindakan gagal.");
      setMessage("Perubahan berhasil disimpan."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Tindakan gagal."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <section className="app-card manager-form-card">
        <div className="manager-form-head"><div><span className="eyebrow">Akun Sistem</span><h2>{form.id ? "Edit Akun" : "Tambah Akun"}</h2></div>{form.id > 0 && <button type="button" className="app-btn app-btn-soft app-btn-sm" onClick={() => setForm(emptyForm)}><i className="bx bx-x" /> Batal Edit</button>}</div>
        <div className="manager-form-body">
          <form className="form-grid" onSubmit={submit}>
            <div className="field third"><label>User ID</label><input className="app-input" required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} /></div>
            <div className="field third"><label>Nama Pengguna</label><input className="app-input" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
            <div className="field third"><label>Role</label><select className="app-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}><option value="Alumni">Alumni</option><option value="Admin">Admin</option></select></div>
            <div className="field half"><label>Password {form.id ? "(kosongkan jika tetap)" : ""}</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} className="app-input" required={!form.id} minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ paddingRight: "40px" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--app-muted)", fontSize: "1.2rem", padding: 0 }} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                  <i className={`bx ${showPassword ? "bx-hide" : "bx-show"}`} />
                </button>
              </div>
            </div>
            <div className="field half"><label>Konfirmasi Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} className="app-input" required={!!form.password && !form.id} minLength={6} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} style={{ paddingRight: "40px" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--app-muted)", fontSize: "1.2rem", padding: 0 }} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                  <i className={`bx ${showPassword ? "bx-hide" : "bx-show"}`} />
                </button>
              </div>
            </div>
            <div className="form-actions"><LoadingButton busy={busy} type="submit" className="app-btn app-btn-primary"><i className={`bx ${form.id ? "bx-save" : "bx-user-plus"}`} /> {form.id ? "Simpan Perubahan" : "Tambah Akun"}</LoadingButton></div>
          </form>
          {message && <div className="alert alert-success" role="status">{message}</div>}
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
        </div>
      </section>

      <section className="app-card">
        <div className="toolbar">
          <div><strong style={{ color: "var(--app-900)", fontSize: ".85rem" }}>Daftar Akun</strong><div className="muted" style={{ fontSize: ".66rem", marginTop: 4 }}>{filtered.length} Data Ditampilkan</div></div>
        <div className="toolbar-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select 
            className="app-select" 
            value={roleFilter} 
            onChange={(e) => {
              setRoleFilter(e.target.value as "all" | UserRole);
              setCurrentPage(1);
            }}
            style={{ width: "auto", minWidth: "130px" }}
          >
            <option value="all">Semua Role</option>
            <option value="Alumni">Alumni</option>
            <option value="Admin">Admin</option>
          </select>
          <select 
            className="app-select" 
            value={statusFilter} 
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | "voted" | "not_voted");
              setCurrentPage(1);
            }}
            style={{ width: "auto", minWidth: "160px" }}
          >
            <option value="all">Semua Status</option>
            <option value="voted">Sudah Memilih</option>
            <option value="not_voted">Belum Memilih</option>
          </select>
          <div className="search-box"><i className="bx bx-search" /><input className="app-input" placeholder="Cari akun, nama, atau role..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} /></div>
        </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>#</th><th>Pengguna</th><th>User ID</th><th>Role</th><th>Status Voting</th><th>Aksi</th></tr></thead>
            <tbody>
              {paginatedUsers.map((user, index) => (
                <tr key={user.id}>
                  <td>{(safeCurrentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                  <td><div className="name-cell"><span className="initial-avatar">{user.displayName.slice(0, 2).toUpperCase()}</span><strong>{user.displayName}</strong></div></td>
                  <td>{user.userId}</td>
                  <td><span className={`badge ${user.role === "Admin" ? "badge-info" : "badge-neutral"}`}>{user.role}</span></td>
                  <td>{user.hasVoted ? <span className="badge badge-success">Sudah memilih</span> : <span className="badge badge-warning">Belum memilih</span>}</td>
                  <td><div className="table-actions">
                    <Link className="app-btn app-btn-soft app-btn-sm" href={`/datapemilih/${user.id}`} title="Lihat detail lengkap"><i className="bx bx-show" /></Link>
                    <button className="app-btn app-btn-soft app-btn-sm" type="button" onClick={() => edit(user)} title="Edit akun"><i className="bx bx-edit" /></button>
                    <button className="app-btn app-btn-danger app-btn-sm" type="button" disabled={busy || user.id === currentUserId || user.hasVoted} onClick={() => action(`/api/admin/users/${user.id}`, "DELETE", `Hapus akun ${user.displayName}?`)} title={user.id === currentUserId ? "Akun yang sedang digunakan tidak dapat dihapus" : user.hasVoted ? "Akun yang sudah memilih tidak dapat dihapus" : "Hapus akun"}><i className="bx bx-trash" /></button>
                  </div></td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && <tr><td colSpan={6}><div className="empty-state"><i className="bx bx-search-alt" />Akun tidak ditemukan.</div></td></tr>}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderTop: "1px solid var(--app-border)" }}>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              Halaman {safeCurrentPage} dari {totalPages}
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <button
                className="app-btn app-btn-soft app-btn-sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <i className="bx bx-chevron-left" />
              </button>
              
              {getPaginationItems(safeCurrentPage, totalPages).map((item, i) => (
                item === '...' ? (
                  <span key={`ellipsis-${i}`} style={{ padding: "0.25rem 0.5rem", color: "var(--app-muted)" }}>...</span>
                ) : (
                  <button
                    key={`page-${item}`}
                    className={`app-btn app-btn-sm ${item === safeCurrentPage ? 'app-btn-primary' : 'app-btn-soft'}`}
                    onClick={() => setCurrentPage(item as number)}
                    style={{ padding: "0.25rem 0.65rem" }}
                  >
                    {item}
                  </button>
                )
              ))}

              <button
                className="app-btn app-btn-soft app-btn-sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <i className="bx bx-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
