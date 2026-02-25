import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  userId?: number;
  companyId?: number | null;
  name?: string;
  email?: string;
  role?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'sparky-secret-key-change-in-production-32chars',
  cookieName: 'logicsupplies-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return session;
}
