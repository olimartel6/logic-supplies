'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBranding } from './BrandingContext';

interface User {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: string;
  inventoryEnabled?: boolean;
  marketingEnabled?: boolean;
  features?: Record<string, boolean>;
  branding?: { appName: string; primaryColor: string; sidebarBg: string; logoUrl: string | null };
}

export function useAuth(redirect = '/') {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const { setBranding } = useBranding();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(u => {
        if (!u || u.error) { router.push(redirect); return; }
        setUser(u);
        if (u.branding) setBranding(u.branding);
      })
      .catch(() => router.push(redirect));
  }, [router, redirect, setBranding]);

  return user;
}
