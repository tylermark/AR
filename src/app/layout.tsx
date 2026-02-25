import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Nav from "@/components/Nav";

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
  title: "ARFab — AR for Fabrication & Construction",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-arfab-black text-steel-100 min-h-screen flex flex-col`}
      >
        <Nav />

        <div className="flex-1">
          {children}
        </div>

        <footer className="border-t border-steel-800 bg-arfab-black">
          <div className="max-w-5xl mx-auto px-4 py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-teal-500 flex items-center justify-center">
                  <span className="text-arfab-black font-mono font-black text-xs leading-none">AR</span>
                </div>
                <span className="text-teal-400 font-mono font-bold tracking-widest uppercase text-sm">
                  ARFab
                </span>
              </div>
              <div className="flex items-center gap-6 font-mono text-xs text-steel-500 uppercase tracking-widest">
                <a href="/pricing" className="hover:text-teal-400 transition-colors">Pricing</a>
                <a href="mailto:hello@arfab.io" className="hover:text-teal-400 transition-colors">Contact</a>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-steel-800">
              <p className="text-steel-600 font-mono text-xs">
                &copy; {new Date().getFullYear()} ARFab. AR for the shop floor.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
