import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Poppy Agent Playground — drive any Poppy Company";
const description =
  "A playground for the Personal Agent Protocol (Poppy): point a Personal Agent at any Poppy Company and run the full flow — discovery, Direct Sign-In, consent, and signed-in API calls — with every request decoded on the wire.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5173"),
  title: { default: title, template: "%s — Poppy Agent Playground" },
  description,
  applicationName: "Poppy Agent Playground",
  keywords: [
    "Personal Agent Protocol",
    "Poppy",
    "AI agents",
    "agent authorization",
    "OAuth",
    "CIMD",
    "DPoP",
    "OpenID Connect",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "Poppy Agent Playground", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
