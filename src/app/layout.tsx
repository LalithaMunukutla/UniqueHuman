import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UniqueHuman",
  description: "Proactive intelligence for chronic conditions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
