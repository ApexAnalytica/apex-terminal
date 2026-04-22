"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type FeedbackRow = {
  id: number;
  created_at: string;
  updated_at: string | null;
  type: string;
  email: string | null;
  message: string;
  status: "new" | "approved" | "in_progress" | "shipped" | "rejected";
  admin_notes: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  pr_url: string | null;
  shipped_at: string | null;
};

const STATUS_COLORS: Record<FeedbackRow["status"], string> = {
  new: "text-accent-cyan border-accent-cyan/40 bg-accent-cyan/5",
  approved: "text-accent-amber border-accent-amber/40 bg-accent-amber/5",
  in_progress: "text-accent-violet border-accent-violet/40 bg-accent-violet/5",
  shipped: "text-accent-green border-accent-green/40 bg-accent-green/5",
  rejected: "text-text-muted border-border bg-surface/30",
};

const STATUS_FILTERS: Array<FeedbackRow["status"] | "all"> = [
  "all",
  "new",
  "approved",
  "in_progress",
  "shipped",
  "rejected",
];

export default function FeedbackAdminList({ rows }: { rows: FeedbackRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FeedbackRow["status"] | "all">("all");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const visibleRows = rows.filter((r) => filter === "all" || r.status === filter);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function act(id: number, action: "approve" | "reject", adminNotes?: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/feedback/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: adminNotes ?? null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => {
        setNotes("");
        router.refresh();
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 font-mono">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[14px] font-[family-name:var(--font-michroma)] tracking-wider">
            FEEDBACK PIPELINE
          </h1>
          <div className="text-[10px] text-text-muted">
            {rows.length} total · {rows.filter((r) => r.status === "new").length} new
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 text-[9px] font-[family-name:var(--font-michroma)] tracking-wider rounded border transition-colors ${
                filter === s
                  ? "border-foreground text-foreground"
                  : "border-border text-text-muted hover:text-foreground"
              }`}
            >
              {s.toUpperCase().replace("_", " ")}
              {s !== "all" && (
                <span className="ml-2 opacity-60">
                  {rows.filter((r) => r.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* List */}
          <div className="lg:col-span-2 border border-border rounded overflow-hidden">
            <div className="bg-surface px-4 py-2 border-b border-border grid grid-cols-12 gap-2 text-[9px] tracking-wider text-text-muted">
              <div className="col-span-2">CREATED</div>
              <div className="col-span-2">TYPE</div>
              <div className="col-span-2">STATUS</div>
              <div className="col-span-6">MESSAGE</div>
            </div>
            <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {visibleRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[10px] text-text-muted">
                  No feedback in this view.
                </div>
              ) : (
                visibleRows.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full text-left px-4 py-3 grid grid-cols-12 gap-2 text-[10px] hover:bg-surface/50 transition-colors ${
                      selectedId === row.id ? "bg-surface/60" : ""
                    }`}
                  >
                    <div className="col-span-2 text-text-muted">
                      {new Date(row.created_at).toLocaleDateString()}
                    </div>
                    <div className="col-span-2 uppercase text-text-muted">{row.type}</div>
                    <div className="col-span-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[8px] tracking-wider ${
                          STATUS_COLORS[row.status]
                        }`}
                      >
                        {row.status.toUpperCase().replace("_", " ")}
                      </span>
                    </div>
                    <div className="col-span-6 truncate">{row.message}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detail */}
          <div className="border border-border rounded overflow-hidden">
            {!selected ? (
              <div className="p-6 text-[10px] text-text-muted text-center">
                Select a row to view details and take action.
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div>
                  <div className="text-[8px] tracking-wider text-text-muted mb-1">
                    SUBMITTED
                  </div>
                  <div className="text-[11px]">
                    {new Date(selected.created_at).toLocaleString()}
                    {selected.email && (
                      <span className="text-text-muted ml-2">· {selected.email}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] tracking-wider text-text-muted mb-1">
                    TYPE / STATUS
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] uppercase text-text-muted">
                      {selected.type}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[8px] tracking-wider ${
                        STATUS_COLORS[selected.status]
                      }`}
                    >
                      {selected.status.toUpperCase().replace("_", " ")}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[8px] tracking-wider text-text-muted mb-1">
                    MESSAGE
                  </div>
                  <div className="text-[11px] whitespace-pre-wrap break-words bg-surface p-3 rounded border border-border">
                    {selected.message}
                  </div>
                </div>
                {selected.github_issue_url && (
                  <div>
                    <div className="text-[8px] tracking-wider text-text-muted mb-1">
                      GITHUB ISSUE
                    </div>
                    <a
                      href={selected.github_issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-accent-cyan hover:underline break-all"
                    >
                      {selected.github_issue_url}
                    </a>
                  </div>
                )}
                {selected.pr_url && (
                  <div>
                    <div className="text-[8px] tracking-wider text-text-muted mb-1">
                      PULL REQUEST
                    </div>
                    <a
                      href={selected.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-accent-cyan hover:underline break-all"
                    >
                      {selected.pr_url}
                    </a>
                  </div>
                )}
                {selected.admin_notes && (
                  <div>
                    <div className="text-[8px] tracking-wider text-text-muted mb-1">
                      ADMIN NOTES
                    </div>
                    <div className="text-[10px] text-text-muted whitespace-pre-wrap">
                      {selected.admin_notes}
                    </div>
                  </div>
                )}

                {selected.status === "new" && (
                  <>
                    <div>
                      <div className="text-[8px] tracking-wider text-text-muted mb-1">
                        NOTES TO AGENT (OPTIONAL)
                      </div>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Constraints, preferred approach, file hints..."
                        className="w-full px-2 py-1.5 bg-surface border border-border rounded text-[10px] resize-none focus:outline-none focus:border-accent-cyan/60"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => act(selected.id, "approve", notes)}
                        disabled={pending}
                        className="flex-1 py-2 bg-accent-green/10 border border-accent-green/40 text-accent-green text-[10px] tracking-wider rounded hover:bg-accent-green/20 disabled:opacity-50"
                      >
                        {pending ? "..." : "APPROVE"}
                      </button>
                      <button
                        onClick={() => act(selected.id, "reject", notes)}
                        disabled={pending}
                        className="flex-1 py-2 bg-accent-red/10 border border-accent-red/40 text-accent-red text-[10px] tracking-wider rounded hover:bg-accent-red/20 disabled:opacity-50"
                      >
                        REJECT
                      </button>
                    </div>
                  </>
                )}

                {actionError && (
                  <div className="text-[10px] text-accent-red border border-accent-red/40 bg-accent-red/5 rounded p-2">
                    {actionError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
