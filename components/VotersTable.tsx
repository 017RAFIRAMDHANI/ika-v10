"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VoterRecord } from "@/lib/types";

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

export default function VotersTable({ voters }: { voters: VoterRecord[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "voted" | "not_voted">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    let result = voters;
    
    if (statusFilter === "voted") {
      result = result.filter(voter => voter.hasVoted);
    } else if (statusFilter === "not_voted") {
      result = result.filter(voter => !voter.hasVoted);
    }

    if (!needle) return result;
    return result.filter((voter) =>
      [voter.userId, voter.displayName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    );
  }, [search, statusFilter, voters]);

  const voted = voters.filter((voter) => voter.hasVoted).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  
  const paginatedVoters = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safeCurrentPage]);

  return (
    <section className="app-card">
      <div className="toolbar">
        <div>
          <strong style={{ color: "var(--app-900)", fontSize: ".85rem" }}>{filtered.length} Data Ditampilkan</strong>
          <div className="muted" style={{ fontSize: ".66rem", marginTop: 4 }}>{voted} sudah memilih dari {voters.length} data</div>
        </div>
        <div className="toolbar-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
          <div className="search-box">
            <i className="bx bx-search" />
            <input 
              className="app-input" 
              placeholder="Cari nama atau User ID..." 
              value={search} 
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }} 
            />
          </div>
          <a href="/api/voters/export" className="app-btn app-btn-success"><i className="bx bx-download" /> Export Excel</a>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>#</th><th>Pemilih</th><th>User ID</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {paginatedVoters.map((voter, index) => (
              <tr key={voter.id}>
                <td>{(safeCurrentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                <td><div className="name-cell"><span className="initial-avatar">{(voter.displayName || voter.userId || "U").slice(0, 2).toUpperCase()}</span><strong>{voter.displayName || "-"}</strong></div></td>
                <td>{voter.userId || "-"}</td>
                <td>{voter.hasVoted ? <span className="badge badge-success"><i className="bx bx-check" /> Sudah Memilih</span> : <span className="badge badge-warning"><i className="bx bx-time-five" /> Belum Memilih</span>}</td>
                <td><Link href={`/datapemilih/${voter.id}`} className="app-btn app-btn-soft app-btn-sm" aria-label={`Lihat ${voter.displayName || voter.userId}`}><i className="bx bx-show" /> Detail</Link></td>
              </tr>
            ))}
            {paginatedVoters.length === 0 && <tr><td colSpan={5}><div className="empty-state"><i className="bx bx-search-alt" />Data pemilih tidak ditemukan.</div></td></tr>}
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
  );
}
