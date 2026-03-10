'use client';

import { useEffect } from 'react';

export default function CapacitorInit() {
  useEffect(() => {
    (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;

      // Status bar styling
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Dark });
        StatusBar.setBackgroundColor({ color: '#1e293b' });
      }).catch(() => {});

      // Keyboard handling
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        Keyboard.addListener('keyboardWillShow', () => {
          document.body.classList.add('keyboard-visible');
        });
        Keyboard.addListener('keyboardWillHide', () => {
          document.body.classList.remove('keyboard-visible');
        });
      }).catch(() => {});

      // Push notifications
      import('@/lib/capacitor-push').then(({ initPushNotifications }) => {
        initPushNotifications();
      }).catch(() => {});

      // Deep links
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appUrlOpen', (data) => {
          try {
            const url = new URL(data.url);
            if (url.pathname) window.location.href = url.pathname;
          } catch {}
        });
      }).catch(() => {});
    })();
  }, []);

  return null;
}
