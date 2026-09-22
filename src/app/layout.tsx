import type { Metadata } from "next";
import { Inter, Noto_Sans_Malayalam } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-en",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const notoSansMalayalam = Noto_Sans_Malayalam({
  variable: "--font-mal",
  subsets: ["malayalam"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Suo Mottu FIR Registration",
  description: "CCTNS-R-IIF-1 - Suo Mottu FIR registration form",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansMalayalam.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
