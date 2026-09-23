"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadRow, LeadStatus } from "./page";

const STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "trial-issued",
  "closed-won",
  "closed-lost",
];

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "text-accent-cyan border-accent-cyan/40 bg-accent-cyan/5",
  contacted: "text-accent-amber border-accent-amber/40 bg-accent-amber/5",
  "trial-issued": "text-accent-purple border-accent-purple/40 bg-accent-purple/5",
  "closed-won": "text-accent-green border-accent-green/40 bg-accent-green/5",
  "closed-lost": "text-text-muted border-border bg-surface/30",
};

const FILTERS: Array<LeadStatus | "all"> = ["all", ...STATUSES];

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export default function LeadsAdminList({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function updateLead(
    id: string,
    payload: { status?: LeadStatus; admin_notes?: string | null }
  ) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 font-mono">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[14px] font-[family-name:var(--font-michroma)] tracking-wider">
            ACCESS REQUESTS
          </h1>
          <div className="text-[10px] text-text-muted">
            {rows.length} total ·{" "}
            {rows.filter((r) => r.status === "new").length} new
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 text-[9px] font-[family-name:var(--font-michroma)] tracking-wider rounded border transition-colors ${
                filter === s
                  ? "border-foreground text-foreground"
                  : "border-border text-text-muted hover:text-foreground"
              }`}
            >
              {s.toUpperCase().replace(/-/g, " ")}
              {s !== "all" && (
                <span className="ml-2 opacity-60">
                  {rows.filter((r) => r.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {actionError && (
          <div className="mb-4 text-[11px] text-accent-red bg-accent-red/10 border border-accent-red/30 rounded px-3 py-2">
            {actionError}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-[10px]">
              <thead className="bg-surface/50 text-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 tracking-wider">RECEIVED</th>
                  <th className="text-left px-3 py-2 tracking-wider">NAME</th>
                  <th className="text-left px-3 py-2 tracking-wider">ORG</th>
                  <th className="text-left px-3 py-2 tracking-wider">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-text-muted">
                      No leads in this view.
                    </td>
                  </tr>
                )}
                {visibleRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`border-t border-border cursor-pointer hover:bg-surface/30 ${
                      selectedId === r.id ? "bg-surface/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {fmtDate(r.created_at)}
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-text-muted">{r.organization}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[9px] tracking-wider ${STATUS_COLORS[r.status]}`}
                      >
                        {r.status.toUpperCase().replace(/-/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected ? (
            <LeadDetail
              row={selected}
              pending={pending}
              onUpdate={(payload) => updateLead(selected.id, payload)}
            />
          ) : (
            <div className="border border-border rounded p-6 text-[11px] text-text-muted text-center">
              Select a lead to view details and update status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadDetail({
  row,
  pending,
  onUpdate,
}: {
  row: LeadRow;
  pending: boolean;
  onUpdate: (payload: { status?: LeadStatus; admin_notes?: string | null }) => void;
}) {
  const [notes, setNotes] = useState(row.admin_notes ?? "");

  return (
    <div className="border border-border rounded p-5 space-y-4 text-[11px]">
      <div>
        <div className="text-[9px] tracking-wider text-text-muted">NAME</div>
        <div className="text-foreground">{row.name}</div>
      </div>
      <div>
        <div className="text-[9px] tracking-wider text-text-muted">EMAIL</div>
        <a
          href={`mailto:${row.email}`}
          className="text-accent-cyan/80 hover:text-accent-cyan break-all"
        >
          {row.email}
        </a>
      </div>
      <div>
        <div className="text-[9px] tracking-wider text-text-muted">ORG</div>
        <div className="text-foreground">{row.organization}</div>
      </div>
      <div>
        <div className="text-[9px] tracking-wider text-text-muted">SOURCE</div>
        <div className="text-text-muted">{row.source}</div>
      </div>
      {row.use_case && (
        <div>
          <div className="text-[9px] tracking-wider text-text-muted">USE CASE</div>
          <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {row.use_case}
          </div>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <div className="text-[9px] tracking-wider text-text-muted mb-1">
          ADMIN NOTES
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full bg-surface border border-border rounded px-2 py-1.5 text-foreground text-[11px]"
          placeholder="Internal notes — context for sales follow-up."
        />
        <button
          onClick={() => onUpdate({ admin_notes: notes.trim() || null })}
          disabled={pending}
          className="mt-2 px-3 py-1 text-[9px] tracking-wider border border-border rounded text-text-muted hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
        >
          SAVE NOTES
        </button>
      </div>

      <div className="border-t border-border pt-3">
        <div className="text-[9px] tracking-wider text-text-muted mb-2">
          UPDATE STATUS
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ status: s })}
              disabled={pending || s === row.status}
              className={`px-2 py-1 text-[9px] tracking-wider rounded border transition-colors disabled:opacity-50 ${
                s === row.status
                  ? "border-foreground text-foreground"
                  : "border-border text-text-muted hover:text-foreground hover:border-foreground"
              }`}
            >
              {s.toUpperCase().replace(/-/g, " ")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
