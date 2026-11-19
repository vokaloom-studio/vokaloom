import type { Metadata, Viewport } from "next";
import { LocaleProvider } from "@/components/locale-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title:
    "Vokaloom Studio — Aesthetic Backgrounds & AI Voice Workstation | Fondos Estéticos y Estudio de Voz IA",
  description:
    "Bilingual (EN/ES) commercial-safe content workstation: 15-Image Aesthetic Background Engine with Gemini Vision Matching + Realistic AI Voiceover & Zero-Shot Cloning Studio. / Estación comercial bilingüe: 15 fondos estéticos verticales y estudio de voz IA realista.",
  applicationName: "Vokaloom Studio",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vokaloom Studio",
  },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased no-scrollbar">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans antialiased tracking-tight no-scrollbar selection:bg-violet-500/25 selection:text-violet-100">
        <LocaleProvider>
          {children}
          <Toaster theme="dark" richColors position="bottom-right" />
        </LocaleProvider>
      </body>
    </html>
  );
}
