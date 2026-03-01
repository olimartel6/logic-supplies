'use client';
import { createContext, useContext, useState, ReactNode } from 'react';
import { translations, Lang } from './i18n';

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; }
const LanguageContext = createContext<LangCtx>({ lang: 'fr', setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('fr');
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}

export function useT() {
  const { lang } = useContext(LanguageContext);
  return (key: string) => translations[lang]?.[key] ?? translations['fr'][key] ?? key;
}
