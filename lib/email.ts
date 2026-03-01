import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function supplierLabel(supplier: string): string {
  return supplier === 'canac' ? 'Canac' : supplier === 'homedepot' ? 'Home Depot' : 'Lumen';
}

function supplierCartUrl(supplier: string): string {
  if (supplier === 'canac') return 'https://www.canac.com/fr/panier';
  if (supplier === 'homedepot') return 'https://www.homedepot.ca/fr/accueil/panier.html';
  return 'https://www.lumen.ca/en/cart';
}

export async function sendNewRequestEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  jobSite: string;
  electrician: string;
  urgency: boolean;
  note: string;
}) {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject: `⚡ Nouvelle demande — ${data.product}${data.urgency ? ' 🚨 URGENT' : ''}`,
    html: `
      <h2>Nouvelle demande de matériel</h2>
      <p><b>Électricien:</b> ${data.electrician}</p>
      <p><b>Produit:</b> ${data.product}</p>
      <p><b>Quantité:</b> ${data.quantity} ${data.unit}</p>
      <p><b>Chantier:</b> ${data.jobSite}</p>
      <p><b>Urgent:</b> ${data.urgency ? '🚨 Oui' : 'Non'}</p>
      ${data.note ? `<p><b>Note:</b> ${data.note}</p>` : ''}
      <br/>
      <a href="${APP_URL}/dashboard" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Ouvrir logicSupplies
      </a>
    `,
  });
}

export async function sendStatusEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  status: string;
  officeComment?: string;
}) {
  if (!process.env.SMTP_USER) return;
  const approved = data.status === 'approved';
  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject: `${approved ? '✅' : '❌'} Demande ${approved ? 'approuvée' : 'rejetée'} — ${data.product}`,
    html: `
      <h2>Ta demande a été ${approved ? 'approuvée ✅' : 'rejetée ❌'}</h2>
      <p><b>Produit:</b> ${data.product}</p>
      <p><b>Quantité:</b> ${data.quantity} ${data.unit}</p>
      ${!approved && data.officeComment ? `<p><b>Raison:</b> ${data.officeComment}</p>` : ''}
      <br/>
      <a href="${APP_URL}/my-requests" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Voir mes demandes
      </a>
    `,
  });
}

export async function sendCartNotificationEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  jobSite: string;
  supplier: string;
  reason: string;
}) {
  if (!process.env.SMTP_USER) return;
  const label = supplierLabel(data.supplier);
  const cartUrl = supplierCartUrl(data.supplier);
  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject: `🛒 Produit ajouté au panier ${label} — ${data.product}`,
    html: `
      <h2>Produit ajouté au panier ${label} 🛒</h2>
      <p>La commande automatique n'a pas pu être complétée (aucun mode de paiement configuré).</p>
      <p><b>Produit:</b> ${data.product}</p>
      <p><b>Quantité:</b> ${data.quantity} ${data.unit}</p>
      <p><b>Chantier:</b> ${data.jobSite}</p>
      <p><b>Fournisseur sélectionné:</b> ${label}</p>
      <p style="color:#666;font-size:14px;"><i>${data.reason}</i></p>
      <br/>
      <p>Le produit est dans le panier ${label}. Connectez-vous pour finaliser la commande.</p>
      <br/>
      <a href="${cartUrl}" style="background:#f97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Voir le panier ${label}
      </a>
    `,
  });
}

export async function sendOrderConfirmationEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  jobSite: string;
  supplier: string;
  reason: string;
  orderId: string;
  cancelToken: string;
}) {
  if (!process.env.SMTP_USER) return;
  const label = supplierLabel(data.supplier);
  const cancelUrl = `${APP_URL}/cancel-order/${data.cancelToken}`;
  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject: `✅ Commande envoyée à ${label} — ${data.product}`,
    html: `
      <h2>Commande envoyée automatiquement ✅</h2>
      <p><b>Produit:</b> ${data.product}</p>
      <p><b>Quantité:</b> ${data.quantity} ${data.unit}</p>
      <p><b>Chantier:</b> ${data.jobSite}</p>
      <p><b>Fournisseur:</b> ${label}</p>
      <p><b>Commande #:</b> ${data.orderId}</p>
      <p style="color:#666;font-size:14px;"><i>${data.reason}</i></p>
      <br/>
      <p style="color:#666;font-size:14px;">⚠️ Vous avez <b>2 heures</b> pour annuler cette commande.</p>
      <br/>
      <a href="${cancelUrl}" style="background:#ef4444;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Annuler la commande
      </a>
      <br/><br/>
      <p style="color:#999;font-size:12px;">Ce lien expire dans 2 heures.</p>
    `,
  });
}

export async function sendBudgetAlertEmail(to: string, data: {
  type: '80_percent' | '100_percent' | 'large_order';
  jobSite: string;
  committed?: number;
  total?: number;
  amount?: number;
  product?: string;
  threshold?: number;
}) {
  if (!process.env.SMTP_USER) return;

  const fmt = (n: number) =>
    n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });

  let subject = '';
  let body = '';

  if (data.type === '80_percent') {
    subject = `⚠️ Budget à 80% — ${data.jobSite}`;
    body = `
      <h2>⚠️ Alerte budget — 80% atteint</h2>
      <p><b>Projet :</b> ${data.jobSite}</p>
      <p><b>Engagé :</b> ${fmt(data.committed!)} / ${fmt(data.total!)}</p>
      <p style="color:#d97706;">Il reste ${fmt(data.total! - data.committed!)} de budget disponible.</p>
    `;
  } else if (data.type === '100_percent') {
    subject = `🔴 Budget dépassé — ${data.jobSite}`;
    body = `
      <h2>🔴 Alerte budget — 100% dépassé</h2>
      <p><b>Projet :</b> ${data.jobSite}</p>
      <p><b>Engagé :</b> ${fmt(data.committed!)} / ${fmt(data.total!)}</p>
      <p style="color:#dc2626;">Le budget du projet est dépassé de ${fmt(data.committed! - data.total!)}.</p>
    `;
  } else {
    subject = `🟠 Grande commande — ${data.jobSite}`;
    body = `
      <h2>🟠 Alerte — Commande importante</h2>
      <p><b>Projet :</b> ${data.jobSite}</p>
      <p><b>Produit :</b> ${data.product}</p>
      <p><b>Montant :</b> ${fmt(data.amount!)}</p>
      <p style="color:#d97706;">Cette commande dépasse le seuil d'alerte de ${fmt(data.threshold!)}.</p>
    `;
  }

  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: `
      ${body}
      <br/>
      <a href="${APP_URL}/budget" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Voir le dashboard budget
      </a>
    `,
  });
}

export async function sendVerificationCodeEmail(to: string, code: string) {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({
    from: `"logicSupplies" <${process.env.SMTP_USER}>`,
    to,
    subject: `${code} — Votre code de vérification logicSupplies`,
    html: `
      <h2>Vérification de votre adresse email</h2>
      <p>Voici votre code de vérification :</p>
      <div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.3em;padding:16px 0;color:#2563eb;">${code}</div>
      <p style="color:#666;font-size:14px;">Ce code expire dans 15 minutes.</p>
      <p style="color:#666;font-size:14px;">Si vous n'avez pas demandé ce code, ignorez cet email.</p>
    `,
  });
}
