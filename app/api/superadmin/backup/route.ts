import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { backupDb } from '@/lib/db';

export async function POST() {
  const session = await getSession();
  if (!session.userId || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  try {
    const backupPath = await backupDb();
    return NextResponse.json({ ok: true, path: backupPath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
