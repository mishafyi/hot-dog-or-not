import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { NavHeader } from "@/components/nav-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hot Dog or Not - LLM Vision Benchmark",
  description:
    "Benchmarking LLM vision models on hot dog classification",
  other: {
    "theme-color": "#1a1a1a",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NavHeader />
        <main className="container mx-auto px-4 py-6">{children}</main>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
