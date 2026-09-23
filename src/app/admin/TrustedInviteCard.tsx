"use client";

import { useState } from "react";

export default function TrustedInviteCard({
  signupUrl,
  inviteCode,
}: {
  signupUrl: string;
  inviteCode: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  async function copy(text: string, kind: "url" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "url") {
        setUrlCopied(true);
        setTimeout(() => setUrlCopied(false), 1500);
      } else {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 1500);
      }
    } catch {
      // Clipboard blocked (e.g., insecure origin). Fall back silently.
    }
  }

  return (
    <div className="border border-border rounded p-5 bg-surface space-y-4">
      <div>
        <div className="text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.2em] text-foreground">
          TRUSTED ACCESS
        </div>
        <p className="text-[10px] text-text-muted leading-relaxed mt-2">
          Send the URL and the invite code to someone you trust (internal
          team, due-diligence reviewers, partners). They&apos;ll create
          their account on the signup page and land directly with{" "}
          <code className="text-text-muted">tier=&apos;trusted&apos;</code>{" "}
          — no Mercury invoice needed, no expiry. Treat the code like a
          password; rotate via the{" "}
          <code className="text-text-muted">TRUSTED_INVITE_CODE</code> env
          var on Vercel.
        </p>
      </div>

      <div className="space-y-3">
        <Field label="SIGNUP URL">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={signupUrl}
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-[11px] font-mono text-foreground"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => copy(signupUrl, "url")}
              className="px-3 py-2 text-[9px] tracking-wider border border-border rounded text-text-muted hover:text-foreground hover:border-foreground transition-colors"
            >
              {urlCopied ? "COPIED" : "COPY"}
            </button>
          </div>
        </Field>

        <Field label="INVITE CODE">
          {inviteCode == null ? (
            <div className="text-[11px] font-mono text-accent-red">
              TRUSTED_INVITE_CODE env var is not set on this environment.
              The signup page will reject all attempts. Set it in Vercel
              and redeploy.
            </div>
          ) : (
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                type={revealed ? "text" : "password"}
                value={inviteCode}
                className="flex-1 bg-background border border-border rounded px-3 py-2 text-[11px] font-mono text-foreground"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => setRevealed((r) => !r)}
                className="px-3 py-2 text-[9px] tracking-wider border border-border rounded text-text-muted hover:text-foreground hover:border-foreground transition-colors"
              >
                {revealed ? "HIDE" : "REVEAL"}
              </button>
              <button
                onClick={() => copy(inviteCode, "code")}
                className="px-3 py-2 text-[9px] tracking-wider border border-border rounded text-text-muted hover:text-foreground hover:border-foreground transition-colors"
              >
                {codeCopied ? "COPIED" : "COPY"}
              </button>
            </div>
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[8px] tracking-wider text-text-muted uppercase block mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
