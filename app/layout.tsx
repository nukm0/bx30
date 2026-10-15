import type { Metadata, Viewport } from "next";
import Script from "next/script";
import TelegramProvider from "./telegram-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketplace — Neon Marketplace",
  description: "Marketplace — neon marketplace inside Telegram Mini App",
  applicationName: "Marketplace",
  appleWebApp: { capable: true, title: "Marketplace", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0b16",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramProvider>{children}</TelegramProvider>
      </body>
    </html>
  );
}
