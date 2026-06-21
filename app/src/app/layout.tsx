import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

const DESCRIPTION =
  "On-chain USDC credit lines underwritten by income verified inside an AWS Nitro enclave. The chain natively verifies the attestation — no oracle, no leaked bank statements.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "ConduitCredit — income, not collateral",
  description: DESCRIPTION,
  keywords: [
    "Sui", "DeFi", "Nautilus", "AWS Nitro", "TEE", "under-collateralized lending",
    "income verification", "USDC credit line", "Sui Overflow 2026",
  ],
  applicationName: "ConduitCredit",
  openGraph: {
    type: "website",
    title: "ConduitCredit — income, not collateral",
    description: DESCRIPTION,
    siteName: "ConduitCredit",
    images: [{ url: "/logo.svg", width: 512, height: 512, alt: "ConduitCredit" }],
  },
  twitter: {
    card: "summary",
    title: "ConduitCredit — income, not collateral",
    description: DESCRIPTION,
    images: ["/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
