import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'My Account', template: '%s · My Account' },
  description: 'One workspace. Every company. Akuntansi multi-pengguna dan multi-perusahaan dalam satu ruang kerja.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
