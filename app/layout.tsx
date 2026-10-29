import type { Metadata } from "next";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
import { databaseConfigured } from "@/lib/db";
import "./globals.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./design.css";
export const metadata: Metadata = {
  title: { default: "Paper — Trading desk", template: "%s · Paper" },
  description:
    "Real markets. Virtual capital. Practice perpetual trading with live Hyperliquid data and 10,000 USDC in virtual funds.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider configured={databaseConfigured()}>
          <Shell>{children}</Shell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
