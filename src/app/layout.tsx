import type { Metadata } from "next";
import { Michroma, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const michroma = Michroma({
  weight: "400",
  variable: "--font-michroma",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MANIFOLD — Causal Intelligence Platform",
  description: "by Apex Analytica — Ω-Critical AI Systems™",
};

// Runs before paint to sync the user's saved text-size with <html> so zoom
// applies from the first frame instead of snapping in after hydration.
const TEXT_SIZE_BOOT = `(function(){try{var v=localStorage.getItem("manifold:text-size");if(v==="sm"||v==="md"||v==="lg"){document.documentElement.dataset.textSize=v;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOT }} />
      </head>
      <body
        className={`${michroma.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
