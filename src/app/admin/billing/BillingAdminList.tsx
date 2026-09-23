"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminCustomerRow } from "@/app/api/admin/billing/customers/route";
import type { SubscriptionStatus, Tier } from "@/lib/billing";

const TIERS: Tier[] = [
  "trial",
  "analyst",
  "multi_domain",
  "enterprise",
  "trusted",
  "expired",
];

const STATUSES: SubscriptionStatus[] = [
  "active",
  "past_due",
  "canceled",
  "pending",
  "none",
];

const TIER_COLORS: Record<Tier, string> = {
  trial:        "text-accent-cyan border-accent-cyan/40 bg-accent-cyan/5",
  analyst:      "text-accent-amber border-accent-amber/40 bg-accent-amber/5",
  multi_domain: "text-accent-violet border-accent-violet/40 bg-accent-violet/5",
  enterprise:   "text-accent-green border-accent-green/40 bg-accent-green/5",
  trusted:      "text-accent-blue border-accent-blue/40 bg-accent-blue/5",
  expired:      "text-text-muted border-border bg-surface/30",
};

const TIER_FILTERS: Array<Tier | "all" | "due_soon"> = [
  "all",
  "due_soon",
  ...TIERS,
];

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function daysUntil(s: string | null): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// Convert an ISO timestamp to the value format that <input type="datetime-local">
// expects: YYYY-MM-DDTHH:MM (no seconds, no tz). Returns "" for null.
function toLocalInput(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert a datetime-local input value back to ISO. Treats input as
// local time (matches what the user sees). Empty string => null.
function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function BillingAdminList({ rows }: { rows: AdminCustomerRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Tier | "all" | "due_soon">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "due_soon") {
      return rows.filter((r) => {
        const d = daysUntil(r.current_period_end);
        return d !== null && d <= 30 && r.tier !== "expired";
      });
    }
    return rows.filter((r) => r.tier === filter);
  }, [rows, filter]);

  const editingRow = rows.find((r) => r.id === editingId) ?? null;

  async function expireNow(id: string, email: string) {
    if (!confirm(`Flip ${email} to tier='expired' immediately?`)) return;
    setActionError(null);
    try {
      const res = await fetch("/api/admin/billing/expire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? `HTTP ${res.status}`);
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
            BILLING CONSOLE
          </h1>
          <div className="text-[10px] text-text-muted">
            {rows.length} total ·{" "}
            {
              rows.filter((r) => {
                const d = daysUntil(r.current_period_end);
                return d !== null && d <= 30 && r.tier !== "expired";
              }).length
            }{" "}
            renewing within 30d
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {TIER_FILTERS.map((s) => (
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
                  {s === "due_soon"
                    ? rows.filter((r) => {
                        const d = daysUntil(r.current_period_end);
                        return (
                          d !== null && d <= 30 && r.tier !== "expired"
                        );
                      }).length
                    : rows.filter((r) => r.tier === s).length}
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

        {/* Table */}
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-[10px]">
            <thead className="bg-surface/50 text-text-muted">
              <tr>
                <th className="text-left px-3 py-2 tracking-wider">EMAIL</th>
                <th className="text-left px-3 py-2 tracking-wider">ORG</th>
                <th className="text-left px-3 py-2 tracking-wider">TIER</th>
                <th className="text-left px-3 py-2 tracking-wider">STATUS</th>
                <th className="text-left px-3 py-2 tracking-wider">PERIOD END</th>
                <th className="text-left px-3 py-2 tracking-wider">DAYS</th>
                <th className="text-left px-3 py-2 tracking-wider">SEATS</th>
                <th className="text-left px-3 py-2 tracking-wider">INVOICE</th>
                <th className="text-right px-3 py-2 tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-text-muted"
                  >
                    No customers in this view.
                  </td>
                </tr>
              )}
              {visibleRows.map((r) => {
                const days = daysUntil(r.current_period_end);
                const dueSoon =
                  days !== null && days <= 30 && r.tier !== "expired";
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface/30">
                    <td className="px-3 py-2 font-mono">{r.email}</td>
                    <td className="px-3 py-2 text-text-muted">
                      {r.org_name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[9px] tracking-wider ${TIER_COLORS[r.tier]}`}
                      >
                        {r.tier.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {r.subscription_status ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {fmtDate(r.current_period_end)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {days === null ? (
                        <span className="text-text-muted">—</span>
                      ) : days < 0 ? (
                        <span className="text-accent-red">{days}d</span>
                      ) : dueSoon ? (
                        <span className="text-accent-amber">{days}d</span>
                      ) : (
                        <span className="text-text-muted">{days}d</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {r.seats}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-muted truncate max-w-[120px]">
                      {r.mercury_invoice_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditingId(r.id)}
                        className="px-2 py-1 mr-1 text-[9px] tracking-wider border border-border rounded text-text-muted hover:text-foreground hover:border-foreground transition-colors"
                      >
                        EDIT
                      </button>
                      {r.tier !== "expired" && (
                        <button
                          onClick={() => expireNow(r.id, r.email)}
                          disabled={pending}
                          className="px-2 py-1 text-[9px] tracking-wider border border-accent-red/40 text-accent-red rounded hover:bg-accent-red/10 transition-colors disabled:opacity-50"
                        >
                          EXPIRE
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editingRow && (
          <EditModal
            row={editingRow}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              startTransition(() => router.refresh());
            }}
            onError={(msg) => setActionError(msg)}
          />
        )}
      </div>
    </div>
  );
}

function EditModal({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: AdminCustomerRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [tier, setTier] = useState<Tier>(row.tier);
  const [periodStart, setPeriodStart] = useState(toLocalInput(row.current_period_start));
  const [periodEnd, setPeriodEnd] = useState(toLocalInput(row.current_period_end));
  const [invoiceId, setInvoiceId] = useState(row.mercury_invoice_id ?? "");
  const [seats, setSeats] = useState(String(row.seats));
  const [domainAccess, setDomainAccess] = useState(
    row.domain_access ? row.domain_access.join(",") : ""
  );
  const [status, setStatus] = useState<SubscriptionStatus | "">(
    row.subscription_status ?? ""
  );
  const [saving, setSaving] = useState(false);

  function bumpOneYear() {
    const base = periodEnd ? new Date(periodEnd) : new Date();
    if (isNaN(base.getTime())) return;
    base.setFullYear(base.getFullYear() + 1);
    setPeriodEnd(toLocalInput(base.toISOString()));
  }

  async function save() {
    setSaving(true);
    try {
      const seatsNum = seats.trim() === "" ? null : Number(seats);
      if (seatsNum !== null && (!Number.isInteger(seatsNum) || seatsNum < 1)) {
        onError("Seats must be an integer >= 1.");
        setSaving(false);
        return;
      }

      const body = {
        userId: row.id,
        tier,
        currentPeriodStart: fromLocalInput(periodStart),
        currentPeriodEnd: fromLocalInput(periodEnd),
        mercuryInvoiceId: invoiceId.trim() || null,
        seats: seatsNum,
        domainAccess:
          domainAccess.trim() === ""
            ? null
            : domainAccess
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
        subscriptionStatus: status === "" ? null : status,
      };

      const res = await fetch("/api/admin/billing/grant-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        onError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-[12px] font-[family-name:var(--font-michroma)] tracking-wider">
              EDIT CUSTOMER
            </h2>
            <div className="text-[10px] text-text-muted mt-0.5 truncate">{row.email}</div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-foreground text-[12px]"
          >
            CLOSE
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-[11px]">
          <Field label="TIER">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="STATUS (auto if blank)">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SubscriptionStatus | "")}
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground"
            >
              <option value="">— auto —</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="PERIOD START">
            <input
              type="datetime-local"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
          </Field>

          <Field
            label="PERIOD END"
            extra={
              <button
                type="button"
                onClick={bumpOneYear}
                className="text-[9px] text-accent-cyan/70 hover:text-accent-cyan"
              >
                +1 YEAR
              </button>
            }
          >
            <input
              type="datetime-local"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
          </Field>

          <Field label="MERCURY INVOICE ID">
            <input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              placeholder="e.g. INV-001"
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground placeholder:text-text-muted/50"
            />
          </Field>

          <Field label="SEATS">
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
          </Field>

          <Field label="DOMAIN ACCESS (csv, blank = tier default)">
            <input
              type="text"
              value={domainAccess}
              onChange={(e) => setDomainAccess(e.target.value)}
              placeholder="energy-systems,t1d-beta-cell"
              className="w-full bg-surface border border-border rounded px-2 py-1 text-foreground placeholder:text-text-muted/50"
            />
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[10px] tracking-wider border border-border rounded text-text-muted hover:text-foreground"
          >
            CANCEL
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 text-[10px] tracking-wider border border-accent-cyan/40 rounded text-accent-cyan bg-accent-cyan/10 hover:bg-accent-cyan/20 disabled:opacity-50"
          >
            {saving ? "SAVING..." : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[9px] text-text-muted tracking-wider">{label}</label>
        {extra}
      </div>
      {children}
    </div>
  );
}
