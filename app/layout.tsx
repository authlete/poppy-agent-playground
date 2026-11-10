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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://poppy-playground.authlete.app";
const TITLE = "Poppy Agent Playground — drive any Poppy Company";
const DESCRIPTION =
  "A playground for the Personal Agent Protocol (Poppy): point a Personal Agent at any Poppy " +
  "Company and run the full flow — discovery, Direct Sign-In, consent, and signed-in API calls — " +
  "with every request decoded on the wire. Built by Authlete.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
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
    "Authlete",
  ],
  authors: [{ name: "Authlete", url: "https://www.authlete.com" }],
  creator: "Authlete",
  publisher: "Authlete",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Poppy Agent Playground",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Structured data: tells Google and AI search engines what this tool is.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Poppy Agent Playground",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Authlete", url: "https://www.authlete.com" },
  about: { "@type": "Thing", name: "Personal Agent Protocol (Poppy)" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
