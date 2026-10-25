import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OGSERC Registry",
  description:
    "Correspondence register of the Ogun State Electricity Regulatory Commission",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
