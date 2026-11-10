import type { Metadata, Viewport } from "next";
import { Shippori_Mincho_B1, Zen_Kaku_Gothic_New } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { SessionProvider } from "@/hooks/useSession";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

// Polices embarquées par next/font (servies par l'app, donc disponibles hors ligne).
// Seuls les glyphes latins sont proposés : les kanji utilisent les polices japonaises du système.
const title = Shippori_Mincho_B1({ variable: "--font-title", subsets: ["latin"], weight: ["600", "800"], display: "swap" });
const body = Zen_Kaku_Gothic_New({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Japan Trip", template: "%s · Japan Trip" },
  description: "Préparer et vivre le voyage à plusieurs, même sans connexion.",
  applicationName: "Japan Trip",
  appleWebApp: { capable: true, title: "Japan Trip", statusBarStyle: "black-translucent" },
};

// Zoom volontairement autorisé (accessibilité, lecture des billets).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
    { media: "(prefers-color-scheme: light)", color: "#f7f4ef" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning className={`${title.variable} ${body.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
