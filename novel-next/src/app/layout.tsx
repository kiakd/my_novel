import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';
import { StoryProvider } from '@/lib/store/StoryProvider';
import { Toaster } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-fredoka' });
const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: 'Novel Studio',
  description: 'AI-assisted fiction writing workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="font-sans">
        <I18nProvider>
          <StoryProvider>
            <div className="app-root">
              <AppShell>{children}</AppShell>
            </div>
            <Toaster />
          </StoryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
