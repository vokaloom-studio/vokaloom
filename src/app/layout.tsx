import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vokaloom Studio — Aesthetic Background & Realistic AI Voice Workstation",
  description:
    "Commercial-safe content production workstation: 15-Image Aesthetic Background Engine with Gemini Vision Matching + Realistic AI Voiceover & Zero-Shot Cloning Studio.",
  applicationName: "Vokaloom Studio",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vokaloom Studio",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-50 selection:bg-violet-500/30 selection:text-violet-200">
        {children}
        <Toaster theme="dark" richColors position="bottom-right" />
      </body>
    </html>
  );
}
