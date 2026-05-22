import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/layout/ClientLayout";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
    title: 'CIPHERA — Intelligent PII Redaction',
    description: 'Client-side document redaction. Aadhaar, PAN, GSTIN detected and removed before anything leaves your machine. Zero retention. Air-gap compatible.',
    openGraph: {
        title: 'CIPHERA',
        description: 'Your data stays yours. Always.',
        images: [{ url: '/og-image.png', width: 1200, height: 630 }],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'CIPHERA — PII Redaction',
        description: 'Your data stays yours. Always.',
        images: ['/og-image.png'],
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased text-white`} style={{ background: 'radial-gradient(ellipse at top, #2d2d2d 0%, #000000 80%)', minHeight: '100vh' }}>
                <ClientLayout>
                    {children}
                </ClientLayout>
            </body>
        </html>
    );
}