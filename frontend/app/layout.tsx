import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Browser Automation Runner',
  description: 'Submit a URL and a goal — watch a headless browser automate tasks in real time',
  keywords: ['browser automation', 'web scraping', 'playwright', 'real-time'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
