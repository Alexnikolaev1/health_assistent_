import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Твой здоровый MAX',
  description: 'AI Health Assistant для мессенджера MAX — симптомы, дневник, привычки, напоминания',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '2rem', lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
