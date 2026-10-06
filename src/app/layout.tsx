import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { EXAM } from "@/lib/certification";
import { APP_NAME, isStudyOnly } from "@/lib/edition";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: isStudyOnly()
    ? `Free practice for the ${EXAM.name} (${EXAM.code}) exam: knowledge checks, mock exams and custom tests scored by objective.`
    : "Learn Claude Code, the Agent SDK, the Claude API and MCP by running real examples, and prepare for the CCDV-F exam. No API key needed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted sm:px-6">
            {APP_NAME} is an unofficial study aid for the {EXAM.code} exam, not affiliated with or endorsed by Anthropic. Its practice questions are
            written for it and checked against Anthropic&apos;s public docs; they aren&apos;t real exam items.
            {isStudyOnly() && " Your progress is saved in this browser only."}
          </p>
        </footer>
      </body>
    </html>
  );
}
