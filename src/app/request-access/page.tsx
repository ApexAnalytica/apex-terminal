import { Suspense } from "react";
import Image from "next/image";
import RequestAccessForm from "./RequestAccessForm";

export const metadata = {
  title: "Request access — Manifold by Apex Analytica",
};

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
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
  );
}
