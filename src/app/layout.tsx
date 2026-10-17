import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/bcs/providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "BCS Written Interactive Tree-Notebook",
  description:
    "Premium 6-level tree notebook for BCS written preparation — rich notes, document vault, smart links, analytics and pomodoro study timer.",
  keywords: [
    "BCS",
    "written preparation",
    "tree notes",
    "study notebook",
    "Bengali notes",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover → env(safe-area-inset-*) works on notched phones
  viewportFit: "cover",
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        <Providers>
          <div className="app-bg" aria-hidden="true">
            <span className="blob-3" />
          </div>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                backdropFilter: "blur(14px)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
