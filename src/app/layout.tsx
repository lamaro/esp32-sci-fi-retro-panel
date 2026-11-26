import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ESP32 Studio | Control local",
  description: "Panel local para monitorear y controlar tu ESP32.",
};

export const viewport: Viewport = { themeColor: [
  { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
