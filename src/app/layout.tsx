import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { LocaleProvider } from "@/components/locale-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

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
  themeColor: "#060608",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased no-scrollbar`}
    >
      <body className="min-h-full flex flex-col bg-chassis text-foreground font-sans antialiased tracking-tight no-scrollbar selection:bg-amber-500/25 selection:text-amber-100">
        <LocaleProvider>
          {children}
          <Toaster theme="dark" richColors position="bottom-right" />
        </LocaleProvider>
      </body>
    </html>
  );
}
