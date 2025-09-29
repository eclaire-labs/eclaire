import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next/types";
import type React from "react";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { AssistantPreferencesProvider } from "@/providers/AssistantPreferencesProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { SessionProvider } from "@/providers/SessionProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s — Eclaire",
    default: "Eclaire",
  },
  description:
    "Open-source, local-first AI that organizes, answers, and automates across tasks, notes, documents, photos, and bookmarks — private by design and under your control.",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: [
    "AI",
    "privacy",
    "local-first",
    "open-source",
    "assistant",
    "tasks",
    "notes",
    "documents",
    "photos",
    "bookmarks",
    "automation",
  ],
  authors: [
    {
      name: "Eclaire Labs",
    },
  ],
  creator: "Eclaire Labs",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64x64.png", sizes: "64x64", type: "image/png" },
      { url: "/favicon-256x256.png", sizes: "256x256", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SessionProvider>
            <AssistantPreferencesProvider>
              <QueryProvider>{children}</QueryProvider>
            </AssistantPreferencesProvider>
          </SessionProvider>
          <Toaster />
          <PWAInstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
