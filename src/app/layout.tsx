import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ARFab — AR Model Viewer",
  description: "Upload GLB models and view them in AR from any mobile browser. No app required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-arfab-black text-steel-100 min-h-screen`}
      >
        <nav className="border-b border-steel-800 bg-arfab-black sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 bg-amber-500 flex items-center justify-center">
                <span className="text-arfab-black font-mono font-black text-xs leading-none">AR</span>
              </div>
              <span className="text-amber-400 font-mono font-bold tracking-widest uppercase text-sm group-hover:text-amber-300 transition-colors">
                ARFab
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <Link
                href="/"
                className="text-steel-400 hover:text-amber-400 font-mono text-xs uppercase tracking-widest
                           px-3 py-2 transition-colors"
              >
                Upload
              </Link>
              <Link
                href="/dashboard"
                className="text-steel-400 hover:text-amber-400 font-mono text-xs uppercase tracking-widest
                           px-3 py-2 transition-colors"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <div className="min-h-[calc(100vh-56px)]">
          {children}
        </div>
      </body>
    </html>
  );
}
