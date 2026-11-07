import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Looke | Create on Ultra",
  description: "Looke Social is an Ultra EVM-only creator platform for coins, markets, profiles and communities. Testnet 18881; public Testnet access is open.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
