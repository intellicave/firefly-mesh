import type { Metadata } from "next";
import { Inter, Lora, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-sans-runtime",
  subsets: ["latin"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-serif-runtime",
  subsets: ["latin"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono-runtime",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "firefly-mesh",
  description: "Bring your own agent. We bring the org.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // W5'/W11: locale + messages resolved server-side by i18n/request.ts via
  // NEXT_LOCALE cookie. Sprint A keeps existing 13 page.tsx using the
  // lib/messages/en.ts plain-object pattern; only LanguageSwitcher reads via
  // useLocale. V0.2 migrates page.tsx call sites to useTranslations.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${lora.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
