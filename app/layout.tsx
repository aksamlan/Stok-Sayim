import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SwRegister } from '@/components/sw-register'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Stokzen Stok Sayım - Barkod ile Envanter Sayımı',
  description:
    'Stokzen ile barkod okutarak tek başına veya ekipçe stok sayımı yapın; Excel/CSV çıktısı alın.',
  applicationName: 'Stokzen Stok Sayım',
  icons: {
    icon: [{ url: '/marka/icon', type: 'image/png' }],
    shortcut: '/marka/icon',
    apple: '/marka/icon',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr">
      <body className={`font-sans antialiased`}>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
