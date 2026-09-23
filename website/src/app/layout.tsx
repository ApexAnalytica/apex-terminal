import type { Metadata } from "next";
import { Michroma, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SiteBackground from "@/components/SiteBackground";
import IntroOverlay from "@/components/IntroOverlay";

const michroma = Michroma({
  weight: "400",
  variable: "--font-michroma",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apex Analytica — Causal Intelligence for Critical Systems",
  description:
    "Manifold by Apex Analytica — Ω-Critical AI Systems™ for measuring, mapping, and stress-testing fragility across the world's critical supply chains, infrastructure, and capital flows.",
  metadataBase: new URL("https://apexanalytica.co"),
  openGraph: {
    title: "Apex Analytica — Causal Intelligence for Critical Systems",
    description:
      "Manifold maps and stress-tests fragility across critical supply chains, infrastructure, and capital.",
    url: "https://apexanalytica.co",
    siteName: "Apex Analytica",
    type: "website",
    images: [
      {
        url: "/mantis.png",
        width: 1247,
        height: 1523,
        alt: "Apex Analytica",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${michroma.variable} ${jetbrainsMono.variable} antialiased text-foreground min-h-screen flex flex-col`}
      >
        <SiteBackground />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <IntroOverlay />
      </body>
    </html>
  );
}
