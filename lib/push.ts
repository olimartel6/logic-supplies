import { getDb } from './db';

/**
 * Send a push notification to a specific user via Firebase Cloud Messaging.
 * Requires FIREBASE_SERVER_KEY env var.
 */
export async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) return;

  const db = getDb();
  const tokens = db.prepare(
    'SELECT token FROM push_tokens WHERE user_id = ?'
  ).all(userId) as { token: string }[];

  if (tokens.length === 0) return;

  for (const { token } of tokens) {
    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          notification: { title, body },
          data: data || {},
        }),
      });
    } catch (err) {
      console.error('[Push] Failed to send to token:', err);
    }
  }
}

/**
 * Send a push notification to all users of a company.
 */
export async function sendPushToCompany(
  companyId: number,
  title: string,
  body: string,
  data?: Record<string, string>,
  excludeUserId?: number,
) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey) return;

  const db = getDb();
  let tokens: { token: string }[];
  if (excludeUserId) {
    tokens = db.prepare(
      'SELECT token FROM push_tokens WHERE company_id = ? AND user_id != ?'
    ).all(companyId, excludeUserId) as { token: string }[];
  } else {
    tokens = db.prepare(
      'SELECT token FROM push_tokens WHERE company_id = ?'
    ).all(companyId) as { token: string }[];
  }

  for (const { token } of tokens) {
    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          notification: { title, body },
          data: data || {},
        }),
      });
    } catch (err) {
      console.error('[Push] Failed to send to token:', err);
    }
  }
}
