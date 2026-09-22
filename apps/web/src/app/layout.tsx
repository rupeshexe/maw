import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import type { PublicConfig } from "@/lib/auth";
import { Shell } from "@/components/shell";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MAW — Microsoft Agent Wallet",
  description: "Programmable payments and policy controls for AI agents.",
  icons: { icon: "/maw-logo.png" }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const config: PublicConfig = {
    authMode: process.env.AUTH_MODE === "entra" ? "entra" : "demo",
    entra: {
      tenantId: process.env.ENTRA_TENANT_ID ?? "",
      clientId: process.env.ENTRA_CLIENT_ID ?? "",
      scope: process.env.ENTRA_API_SCOPE ?? ""
    }
  };
  return (
    <html lang="en">
      <body>
        <AuthProvider config={config}>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}
