import type { Metadata } from "next";
import { Josefin_Sans, Pacifico } from "next/font/google";
import "./globals.css";

// Café Quindío usa Neutra Text (de pago); Josefin Sans es la alternativa libre más cercana.
const sans = Josefin_Sans({ subsets: ["latin"], variable: "--font-sans" });
const script = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-script" });

export const metadata: Metadata = {
  title: "Kiosco de voz · Café Quindío",
  description: "Demo de autoservicio por voz",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${script.variable}`}>
      <body>{children}</body>
    </html>
  );
}
