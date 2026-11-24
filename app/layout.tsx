import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Fischer vs Carlsen · 3D Chess',
  description:
    '3D Grandmaster ELO Chess simulation with inverse kinematics, real-time clocks, and dramatic checkmate cutscenes.',
  openGraph: {
    title: 'Fischer vs Carlsen · 3D Chess',
    description:
      '3D Grandmaster ELO Chess simulation with inverse kinematics, real-time clocks, and dramatic checkmate cutscenes.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fischer vs Carlsen · 3D Chess',
    description:
      '3D Grandmaster ELO Chess simulation with inverse kinematics, real-time clocks, and dramatic checkmate cutscenes.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-[#0b0c16] text-slate-100 font-sans antialiased overflow-hidden select-none"
      >
        {children}
      </body>
    </html>
  );
}
