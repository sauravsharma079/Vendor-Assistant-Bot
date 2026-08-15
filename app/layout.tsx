import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vendor Query Assistant | Manufacturing AP Self-Service",
  description:
    "Self-service invoice status, payment status, and Form 16 resolution for manufacturing suppliers, backed by SAP S/4HANA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
