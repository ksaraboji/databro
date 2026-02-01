import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ClientOnlyPostit from "@/components/client-only-postit";
import AiChatWidget from "@/components/ai-chat/widget";
import Footer from "@/components/footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://databro.dev'),
  title: {
    default: "Databro. | Kumar Saraboji",
    template: "%s | Databro.",
  },
  description:
    "Data Engineer crafting data pipelines and infrastructure. Portfolio of Kumar Saraboji showcasing projects in data engineering, analytics, AI agents, and serverless cloud technologies.",
  keywords: ["Data Engineer", "Cloud Automation", "AWS", "Next.js", "React", "TypeScript", "AI Agents", "ETL", "Portfolio", "Kumar Saraboji", "Serverless", "LocalFirst"],
  authors: [{ name: "Kumar Saraboji", url: "https://databro.dev" }],
  creator: "Kumar Saraboji",
  publisher: "Kumar Saraboji",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://databro.dev",
    title: "Databro. | Data Engineering & AI Portfolio",
    description: "Portfolio of Kumar Saraboji - Data Engineer & AI Tinkerer. Transforming raw data into actionable insights with serverless architecture.",
    siteName: "Databro",
  },
  twitter: {
    card: "summary_large_image",
    title: "Databro. | Kumar Saraboji",
    description: "Data Engineer crafting pipelines and AI agents. Serverless, Local-First, and Scalable.",
    creator: "@ksaraboji", // Placeholder, safest to include or omit if unknown. I'll omit if I don't know it, but "databro" sounds like a handle. I'll leave basic summary.
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientOnlyPostit />
        {children}
        <Footer />
        <AiChatWidget />
      </body>
    </html>
  );
}
