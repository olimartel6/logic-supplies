import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { description } = await req.json();
  if (!description) {
    return NextResponse.json({ error: 'Description requise' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Clé API Anthropic non configurée' }, { status: 500 });
  }

  const db = getDb();
  const site = db.prepare('SELECT name, address FROM job_sites WHERE id = ? AND company_id = ?').get(id, ctx.companyId) as any;
  if (!site) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });

  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(ctx.companyId) as any;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Tu es un expert en marketing pour les réseaux sociaux. Génère un post Instagram/Facebook pour une entreprise d'électricité au Québec.

Entreprise: ${company?.name || 'Notre entreprise'}
Projet: ${site.name}
Description du travail: ${description}

Règles:
- Ton professionnel mais accessible
- Utilise quelques emojis pertinents (pas trop)
- Inclus 5-8 hashtags pertinents à la fin
- Format adapté à Instagram et Facebook
- Maximum 150 mots
- En français québécois
- Ne mentionne PAS l'adresse exacte du chantier
- Mets les hashtags sur une ligne séparée à la fin`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    return NextResponse.json({ post: text });
  } catch (err: any) {
    console.error('[Marketing] Post generation error:', err.message);
    return NextResponse.json({ error: `Erreur génération: ${err.message}` }, { status: 500 });
  }
}
