import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import RequestAccessForm from "./RequestAccessForm";

export const metadata = {
  title: "Request access — Manifold by Apex Analytica",
};

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Marketing-site nav so visitors landing here can still
          navigate back to /product, /framework, /domains, etc.
          on the public site at apexanalytica.co. Same pattern as
          /login (PR #239). Login + Request Access intentionally
          omitted from the nav — visitor is already on the
          request-access flow. */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 md:px-6">
          <a
            href="https://apexanalytica.co/"
            className="group flex items-center gap-2.5"
          >
            <Image
              src="/logo.png"
              alt="Apex Analytica"
              width={44}
              height={54}
              className="object-contain shrink-0"
              priority
            />
            <span className="font-[family-name:var(--font-michroma)] text-[12px] tracking-[0.3em] text-foreground group-hover:text-accent-cyan transition-colors">
              APEX ANALYTICA
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-7">
            <a
              href="https://apexanalytica.co/product"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-accent-cyan transition-colors"
            >
              PRODUCT
            </a>
            <a
              href="https://apexanalytica.co/framework"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-accent-cyan transition-colors"
            >
              FRAMEWORK
            </a>
            <a
              href="https://apexanalytica.co/domains"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-accent-cyan transition-colors"
            >
              DOMAINS
            </a>
            <a
              href="https://apexanalytica.co/team"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-accent-cyan transition-colors"
            >
              TEAM
            </a>
            <a
              href="https://apexanalytica.co/contact"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-accent-cyan transition-colors"
            >
              CONTACT
            </a>
          </nav>
          <Link
            href="/login"
            className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted hover:text-foreground transition-colors"
          >
            SIGN IN
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-7">
          <div className="text-center space-y-2">
            <Image
              src="/logo.png"
              alt="Manifold"
              width={120}
              height={120}
              className="mx-auto object-contain"
              priority
            />
            <h1 className="text-xl font-[family-name:var(--font-michroma)] tracking-[0.3em] text-accent-cyan">
              MANIFOLD
            </h1>
            <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.25em] text-text-muted">
              by APEX ANALYTICA
            </span>
            <div className="text-[10px] font-mono text-text-muted tracking-wider mt-1">
              REQUEST ACCESS
            </div>
            <div className="w-16 h-px bg-accent-cyan/40 mx-auto mt-3" />
          </div>

          <Suspense
            fallback={
              <div className="text-center text-[10px] font-mono text-text-muted">
                Loading…
              </div>
            }
          >
            <RequestAccessForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
