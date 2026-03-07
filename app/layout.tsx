import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "logicSupplies",
  description: "Gestion des demandes de matériel électrique",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1e293b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-slate-200 min-h-screen`}>
        <ServiceWorkerRegistrar />
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
