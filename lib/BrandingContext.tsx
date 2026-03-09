'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

export interface BrandingConfig {
  appName: string;
  primaryColor: string;
  sidebarBg: string;
  logoUrl: string | null;
}

const DEFAULTS: BrandingConfig = {
  appName: 'LogicSupplies',
  primaryColor: '#2563eb',
  sidebarBg: '#1e293b',
  logoUrl: null,
};

const BrandingContext = createContext<{ branding: BrandingConfig; setBranding: (b: BrandingConfig) => void }>({
  branding: DEFAULTS,
  setBranding: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULTS);
  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

export { DEFAULTS as BRANDING_DEFAULTS };
