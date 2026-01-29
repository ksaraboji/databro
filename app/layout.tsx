import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ClientOnlyPostit from "@/components/client-only-postit";
import AiChatWidget from "@/components/ai-chat/widget";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Databro.",
  description:
    "Data Engineer crafting data pipelines and infrastructure. Portfolio showcasing projects in data engineering, analytics, and cloud technologies.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
        <AiChatWidget />
      </body>
    </html>
  );
}
