import { Resend } from 'resend';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
function getFrom() {
  return process.env.RESEND_FROM || 'LogicSupplies <onboarding@resend.dev>';
}

type Lang = 'fr' | 'en' | 'es';

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
}, lang: Lang = 'fr') {
  if (!process.env.RESEND_API_KEY) return;
  const subjects: Record<Lang, string> = {
    fr: `⚡ Nouvelle demande — ${data.product}${data.urgency ? ' 🚨 URGENT' : ''}`,
    en: `⚡ New request — ${data.product}${data.urgency ? ' 🚨 URGENT' : ''}`,
    es: `⚡ Nueva solicitud — ${data.product}${data.urgency ? ' 🚨 URGENTE' : ''}`,
  };
  const headings: Record<Lang, string> = {
    fr: 'Nouvelle demande de matériel',
    en: 'New material request',
    es: 'Nueva solicitud de material',
  };
  const labels: Record<Lang, Record<string, string>> = {
    fr: { electrician: 'Électricien', product: 'Produit', qty: 'Quantité', site: 'Chantier', urgent: 'Urgent', note: 'Note' },
    en: { electrician: 'Electrician', product: 'Product', qty: 'Quantity', site: 'Job site', urgent: 'Urgent', note: 'Note' },
    es: { electrician: 'Electricista', product: 'Producto', qty: 'Cantidad', site: 'Obra', urgent: 'Urgente', note: 'Nota' },
  };
  const l = labels[lang];
  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject: subjects[lang],
    html: `
      <h2>${headings[lang]}</h2>
      <p><b>${l.electrician}:</b> ${data.electrician}</p>
      <p><b>${l.product}:</b> ${data.product}</p>
      <p><b>${l.qty}:</b> ${data.quantity} ${data.unit}</p>
      <p><b>${l.site}:</b> ${data.jobSite}</p>
      <p><b>${l.urgent}:</b> ${data.urgency ? '🚨 Oui / Yes / Sí' : 'Non / No'}</p>
      ${data.note ? `<p><b>${l.note}:</b> ${data.note}</p>` : ''}
      <br/>
      <a href="${APP_URL}/dashboard" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Ouvrir logicSupplies
      </a>
    `,
  });
  if (error) throw new Error(error.message);
}

export async function sendStatusEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  status: string;
  officeComment?: string;
}, lang: Lang = 'fr') {
  if (!process.env.RESEND_API_KEY) return;
  const approved = data.status === 'approved';
  const subjects: Record<Lang, string> = {
    fr: `${approved ? '✅' : '❌'} Demande ${approved ? 'approuvée' : 'rejetée'} — ${data.product}`,
    en: `${approved ? '✅' : '❌'} Request ${approved ? 'approved' : 'rejected'} — ${data.product}`,
    es: `${approved ? '✅' : '❌'} Solicitud ${approved ? 'aprobada' : 'rechazada'} — ${data.product}`,
  };
  const headings: Record<Lang, string> = {
    fr: `Ta demande a été ${approved ? 'approuvée ✅' : 'rejetée ❌'}`,
    en: `Your request has been ${approved ? 'approved ✅' : 'rejected ❌'}`,
    es: `Tu solicitud ha sido ${approved ? 'aprobada ✅' : 'rechazada ❌'}`,
  };
  const productLabel: Record<Lang, string> = { fr: 'Produit', en: 'Product', es: 'Producto' };
  const qtyLabel: Record<Lang, string> = { fr: 'Quantité', en: 'Quantity', es: 'Cantidad' };
  const reasonLabel: Record<Lang, string> = { fr: 'Raison', en: 'Reason', es: 'Razón' };
  const linkLabel: Record<Lang, string> = { fr: 'Voir mes demandes', en: 'View my requests', es: 'Ver mis solicitudes' };
  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject: subjects[lang],
    html: `
      <h2>${headings[lang]}</h2>
      <p><b>${productLabel[lang]}:</b> ${data.product}</p>
      <p><b>${qtyLabel[lang]}:</b> ${data.quantity} ${data.unit}</p>
      ${!approved && data.officeComment ? `<p><b>${reasonLabel[lang]}:</b> ${data.officeComment}</p>` : ''}
      <br/>
      <a href="${APP_URL}/my-requests" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        ${linkLabel[lang]}
      </a>
    `,
  });
  if (error) throw new Error(error.message);
}

export async function sendCartNotificationEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  jobSite: string;
  supplier: string;
  reason: string;
}, lang: Lang = 'fr') {
  if (!process.env.RESEND_API_KEY) return;
  const label = supplierLabel(data.supplier);
  const cartUrl = supplierCartUrl(data.supplier);
  const subjects: Record<Lang, string> = {
    fr: `🛒 Produit ajouté au panier ${label} — ${data.product}`,
    en: `🛒 Product added to ${label} cart — ${data.product}`,
    es: `🛒 Producto añadido al carrito ${label} — ${data.product}`,
  };
  const headings: Record<Lang, string> = {
    fr: `Produit ajouté au panier ${label} 🛒`,
    en: `Product added to ${label} cart 🛒`,
    es: `Producto añadido al carrito ${label} 🛒`,
  };
  const desc: Record<Lang, string> = {
    fr: "La commande automatique n'a pas pu être complétée (aucun mode de paiement configuré).",
    en: "The automatic order could not be completed (no payment method configured).",
    es: "El pedido automático no pudo completarse (sin método de pago configurado).",
  };
  const cartMsg: Record<Lang, string> = {
    fr: `Le produit est dans le panier ${label}. Connectez-vous pour finaliser la commande.`,
    en: `The product is in the ${label} cart. Log in to complete the order.`,
    es: `El producto está en el carrito de ${label}. Inicia sesión para completar el pedido.`,
  };
  const btnLabel: Record<Lang, string> = {
    fr: `Voir le panier ${label}`,
    en: `View ${label} cart`,
    es: `Ver carrito ${label}`,
  };
  const productLabel: Record<Lang, string> = { fr: 'Produit', en: 'Product', es: 'Producto' };
  const qtyLabel: Record<Lang, string> = { fr: 'Quantité', en: 'Quantity', es: 'Cantidad' };
  const siteLabel: Record<Lang, string> = { fr: 'Chantier', en: 'Job site', es: 'Obra' };
  const supplierLabelTr: Record<Lang, string> = { fr: 'Fournisseur sélectionné', en: 'Selected supplier', es: 'Proveedor seleccionado' };
  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject: subjects[lang],
    html: `
      <h2>${headings[lang]}</h2>
      <p>${desc[lang]}</p>
      <p><b>${productLabel[lang]}:</b> ${data.product}</p>
      <p><b>${qtyLabel[lang]}:</b> ${data.quantity} ${data.unit}</p>
      <p><b>${siteLabel[lang]}:</b> ${data.jobSite}</p>
      <p><b>${supplierLabelTr[lang]}:</b> ${label}</p>
      <p style="color:#666;font-size:14px;"><i>${data.reason}</i></p>
      <br/>
      <p>${cartMsg[lang]}</p>
      <br/>
      <a href="${cartUrl}" style="background:#f97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        ${btnLabel[lang]}
      </a>
    `,
  });
  if (error) throw new Error(error.message);
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
}, lang: Lang = 'fr') {
  if (!process.env.RESEND_API_KEY) return;
  const label = supplierLabel(data.supplier);
  const cancelUrl = `${APP_URL}/cancel-order/${data.cancelToken}`;
  const subjects: Record<Lang, string> = {
    fr: `✅ Commande envoyée à ${label} — ${data.product}`,
    en: `✅ Order sent to ${label} — ${data.product}`,
    es: `✅ Pedido enviado a ${label} — ${data.product}`,
  };
  const headings: Record<Lang, string> = {
    fr: 'Commande envoyée automatiquement ✅',
    en: 'Order sent automatically ✅',
    es: 'Pedido enviado automáticamente ✅',
  };
  const cancelWarning: Record<Lang, string> = {
    fr: 'Vous avez <b>2 heures</b> pour annuler cette commande.',
    en: 'You have <b>2 hours</b> to cancel this order.',
    es: 'Tienes <b>2 horas</b> para cancelar este pedido.',
  };
  const cancelBtn: Record<Lang, string> = {
    fr: 'Annuler la commande',
    en: 'Cancel the order',
    es: 'Cancelar el pedido',
  };
  const expiryNote: Record<Lang, string> = {
    fr: 'Ce lien expire dans 2 heures.',
    en: 'This link expires in 2 hours.',
    es: 'Este enlace expira en 2 horas.',
  };
  const productLabel: Record<Lang, string> = { fr: 'Produit', en: 'Product', es: 'Producto' };
  const qtyLabel: Record<Lang, string> = { fr: 'Quantité', en: 'Quantity', es: 'Cantidad' };
  const siteLabel: Record<Lang, string> = { fr: 'Chantier', en: 'Job site', es: 'Obra' };
  const supplierLabelTr: Record<Lang, string> = { fr: 'Fournisseur', en: 'Supplier', es: 'Proveedor' };
  const orderLabel: Record<Lang, string> = { fr: 'Commande #', en: 'Order #', es: 'Pedido #' };
  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject: subjects[lang],
    html: `
      <h2>${headings[lang]}</h2>
      <p><b>${productLabel[lang]}:</b> ${data.product}</p>
      <p><b>${qtyLabel[lang]}:</b> ${data.quantity} ${data.unit}</p>
      <p><b>${siteLabel[lang]}:</b> ${data.jobSite}</p>
      <p><b>${supplierLabelTr[lang]}:</b> ${label}</p>
      <p><b>${orderLabel[lang]}:</b> ${data.orderId}</p>
      <p style="color:#666;font-size:14px;"><i>${data.reason}</i></p>
      <br/>
      <p style="color:#666;font-size:14px;">⚠️ ${cancelWarning[lang]}</p>
      <br/>
      <a href="${cancelUrl}" style="background:#ef4444;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        ${cancelBtn[lang]}
      </a>
      <br/><br/>
      <p style="color:#999;font-size:12px;">${expiryNote[lang]}</p>
    `,
  });
  if (error) throw new Error(error.message);
}

export async function sendBudgetAlertEmail(to: string, data: {
  type: '80_percent' | '100_percent' | 'large_order';
  jobSite: string;
  committed?: number;
  total?: number;
  amount?: number;
  product?: string;
  threshold?: number;
}, lang: Lang = 'fr') {
  if (!process.env.RESEND_API_KEY) return;

  const fmt = (n: number) =>
    n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });

  const projectLabel: Record<Lang, string> = { fr: 'Projet', en: 'Project', es: 'Proyecto' };
  const committedLabel: Record<Lang, string> = { fr: 'Engagé', en: 'Committed', es: 'Comprometido' };
  const amountLabel: Record<Lang, string> = { fr: 'Montant', en: 'Amount', es: 'Monto' };
  const productLabel: Record<Lang, string> = { fr: 'Produit', en: 'Product', es: 'Producto' };
  const dashboardBtn: Record<Lang, string> = { fr: 'Voir le dashboard budget', en: 'View budget dashboard', es: 'Ver panel de presupuesto' };

  let subject = '';
  let body = '';

  if (data.type === '80_percent') {
    const titles: Record<Lang, string> = { fr: '⚠️ Budget à 80% — ', en: '⚠️ Budget at 80% — ', es: '⚠️ Presupuesto al 80% — ' };
    const headings: Record<Lang, string> = { fr: '⚠️ Alerte budget — 80% atteint', en: '⚠️ Budget alert — 80% reached', es: '⚠️ Alerta presupuesto — 80% alcanzado' };
    const remaining: Record<Lang, string> = {
      fr: `Il reste ${fmt(data.total! - data.committed!)} de budget disponible.`,
      en: `${fmt(data.total! - data.committed!)} of budget remaining.`,
      es: `Quedan ${fmt(data.total! - data.committed!)} de presupuesto disponible.`,
    };
    subject = titles[lang] + data.jobSite;
    body = `<h2>${headings[lang]}</h2><p><b>${projectLabel[lang]} :</b> ${data.jobSite}</p><p><b>${committedLabel[lang]} :</b> ${fmt(data.committed!)} / ${fmt(data.total!)}</p><p style="color:#d97706;">${remaining[lang]}</p>`;
  } else if (data.type === '100_percent') {
    const titles: Record<Lang, string> = { fr: '🔴 Budget dépassé — ', en: '🔴 Budget exceeded — ', es: '🔴 Presupuesto excedido — ' };
    const headings: Record<Lang, string> = { fr: '🔴 Alerte budget — 100% dépassé', en: '🔴 Budget alert — 100% exceeded', es: '🔴 Alerta presupuesto — 100% excedido' };
    const over: Record<Lang, string> = {
      fr: `Le budget du projet est dépassé de ${fmt(data.committed! - data.total!)}.`,
      en: `The project budget is exceeded by ${fmt(data.committed! - data.total!)}.`,
      es: `El presupuesto del proyecto está excedido por ${fmt(data.committed! - data.total!)}.`,
    };
    subject = titles[lang] + data.jobSite;
    body = `<h2>${headings[lang]}</h2><p><b>${projectLabel[lang]} :</b> ${data.jobSite}</p><p><b>${committedLabel[lang]} :</b> ${fmt(data.committed!)} / ${fmt(data.total!)}</p><p style="color:#dc2626;">${over[lang]}</p>`;
  } else {
    const titles: Record<Lang, string> = { fr: '🟠 Grande commande — ', en: '🟠 Large order — ', es: '🟠 Pedido grande — ' };
    const headings: Record<Lang, string> = { fr: '🟠 Alerte — Commande importante', en: '🟠 Alert — Large order', es: '🟠 Alerta — Pedido importante' };
    const thresholdMsg: Record<Lang, string> = {
      fr: `Cette commande dépasse le seuil d'alerte de ${fmt(data.threshold!)}.`,
      en: `This order exceeds the alert threshold of ${fmt(data.threshold!)}.`,
      es: `Este pedido supera el umbral de alerta de ${fmt(data.threshold!)}.`,
    };
    subject = titles[lang] + data.jobSite;
    body = `<h2>${headings[lang]}</h2><p><b>${projectLabel[lang]} :</b> ${data.jobSite}</p><p><b>${productLabel[lang]} :</b> ${data.product}</p><p><b>${amountLabel[lang]} :</b> ${fmt(data.amount!)}</p><p style="color:#d97706;">${thresholdMsg[lang]}</p>`;
  }

  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject,
    html: `
      ${body}
      <br/>
      <a href="${APP_URL}/budget" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        ${dashboardBtn[lang]}
      </a>
    `,
  });
  if (error) throw new Error(error.message);
}

export async function sendVerificationCodeEmail(to: string, code: string) {
  if (!process.env.RESEND_API_KEY) return;
  const { error } = await getResend().emails.send({
    from: getFrom(),
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
  if (error) throw new Error(error.message);
}
