import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.warn('[Push] Permission not granted');
    return;
  }

  await PushNotifications.register();

  // Send device token to server
  PushNotifications.addListener('registration', async (token) => {
    console.log('[Push] Token:', token.value);
    try {
      await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.value,
          platform: Capacitor.getPlatform(),
        }),
      });
    } catch (err) {
      console.error('[Push] Failed to register token:', err);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[Push] Registration error:', err.error);
  });

  // Notification received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] Received:', notification.title);
  });

  // User tapped a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data;
    if (data?.url) {
      window.location.href = data.url;
    }
  });
}
