import { Resend } from 'resend';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
function getFrom() {
  return process.env.RESEND_FROM || 'LogicSupplies <onboarding@resend.dev>';
}

type Lang = 'fr' | 'en' | 'es';

const SUPPLIER_LABELS: Record<string, string> = {
  canac: 'Canac', homedepot: 'Home Depot', lumen: 'Lumen',
  guillevin: 'Guillevin', jsv: 'JSV', westburne: 'Westburne',
  nedco: 'Nedco', futech: 'Futech', deschenes: 'Deschênes',
  bmr: 'BMR',
};

const SUPPLIER_CART_URLS: Record<string, string> = {
  canac: 'https://www.canac.ca/panier',
  homedepot: 'https://www.homedepot.ca/checkout/cart',
  lumen: 'https://www.lumen.ca/en/cart',
  guillevin: 'https://www.guillevin.com/cart',
  jsv: 'https://jsv.ca/cart',
  westburne: 'https://www.westburne.ca/cart',
  nedco: 'https://www.nedco.ca/cart',
  futech: 'https://www.futech.ca/cart',
  deschenes: 'https://www.deschenes.ca/cart',
  bmr: 'https://www.bmr.ca/fr/mon-panier',
};

function supplierLabel(supplier: string): string {
  return SUPPLIER_LABELS[supplier] ?? supplier;
}

function supplierCartUrl(supplier: string): string {
  return SUPPLIER_CART_URLS[supplier] ?? '#';
}

export async function sendNewRequestEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  jobSite: string;
  worker: string;
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
    fr: { worker: 'Travailleur', product: 'Produit', qty: 'Quantité', site: 'Chantier', urgent: 'Urgent', note: 'Note' },
    en: { worker: 'Worker', product: 'Product', qty: 'Quantity', site: 'Job site', urgent: 'Urgent', note: 'Note' },
    es: { worker: 'Trabajador', product: 'Producto', qty: 'Cantidad', site: 'Obra', urgent: 'Urgente', note: 'Nota' },
  };
  const l = labels[lang];
  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject: subjects[lang],
    html: `
      <h2>${headings[lang]}</h2>
      <p><b>${l.worker}:</b> ${data.worker}</p>
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
}, lang: Lang = 'fr', testMode?: boolean) {
  if (!process.env.RESEND_API_KEY) return;
  const approved = data.status === 'approved';
  const testPrefix = testMode ? '[TEST] ' : '';
  const subjects: Record<Lang, string> = {
    fr: `${testPrefix}${approved ? '✅' : '❌'} Demande ${approved ? 'approuvée' : 'rejetée'} — ${data.product}`,
    en: `${testPrefix}${approved ? '✅' : '❌'} Request ${approved ? 'approved' : 'rejected'} — ${data.product}`,
    es: `${testPrefix}${approved ? '✅' : '❌'} Solicitud ${approved ? 'aprobada' : 'rechazada'} — ${data.product}`,
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
}, lang: Lang = 'fr', testMode?: boolean) {
  if (!process.env.RESEND_API_KEY) return;
  const label = supplierLabel(data.supplier);
  const cartUrl = supplierCartUrl(data.supplier);
  const testPrefix = testMode ? '[TEST] ' : '';
  const subjects: Record<Lang, string> = {
    fr: `${testPrefix}🛒 Produit ajouté au panier ${label} — ${data.product}`,
    en: `${testPrefix}🛒 Product added to ${label} cart — ${data.product}`,
    es: `${testPrefix}🛒 Producto añadido al carrito ${label} — ${data.product}`,
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
}, lang: Lang = 'fr', testMode?: boolean) {
  if (!process.env.RESEND_API_KEY) return;
  const label = supplierLabel(data.supplier);
  const cancelUrl = `${APP_URL}/cancel-order/${data.cancelToken}`;
  const testPrefix = testMode ? '[TEST] ' : '';
  const subjects: Record<Lang, string> = {
    fr: `${testPrefix}✅ Commande envoyée à ${label} — ${data.product}`,
    en: `${testPrefix}✅ Order sent to ${label} — ${data.product}`,
    es: `${testPrefix}✅ Pedido enviado a ${label} — ${data.product}`,
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

export async function sendOrderFailureEmail(to: string, data: {
  product: string; quantity: number; unit: string; jobSite: string; errorMessage: string;
}, testMode?: boolean) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = getResend();
  await resend.emails.send({
    from: getFrom(),
    to,
    subject: `${testMode ? '[TEST] ' : ''}Erreur de commande — ${data.product}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Erreur de commande automatique</h2>
        <p><b>Produit :</b> ${data.product}</p>
        <p><b>Quantité :</b> ${data.quantity} ${data.unit}</p>
        <p><b>Chantier :</b> ${data.jobSite}</p>
        <p><b>Erreur :</b> ${data.errorMessage}</p>
        <br/>
        <p>La commande devra être passée manuellement.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://logic-supplies-production.up.railway.app'}/approvals"
           style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Voir les demandes
        </a>
      </div>
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

export async function sendReviewRequestEmail(
  to: string,
  clientName: string,
  companyName: string,
  googleReviewUrl: string,
) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResend().emails.send({
      from: getFrom(),
      to,
      subject: 'Merci pour votre confiance',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <p>Bonjour${clientName ? ` ${clientName}` : ''},</p>
          <p>Nous espérons que vous êtes satisfait du travail réalisé par <strong>${companyName}</strong>.</p>
          <p>Votre avis aide énormément notre entreprise à grandir.</p>
          <p>Vous pouvez laisser un commentaire ici :</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${googleReviewUrl}" style="background:#1a73e8;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:bold;display:inline-block">
              Laisser un avis Google
            </a>
          </p>
          <p>Merci beaucoup pour votre confiance.</p>
          <p style="color:#666;font-size:13px;margin-top:32px">— L'équipe ${companyName}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Email] Review request error:', err);
  }
}

export async function sendLowStockAlertEmail(to: string, data: {
  itemName: string; currentStock: number; minStock: number; unit: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = getResend();
  await resend.emails.send({
    from: getFrom(),
    to,
    subject: `Stock bas — ${data.itemName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#f97316">Alerte stock bas</h2>
        <p><b>Article :</b> ${data.itemName}</p>
        <p><b>Stock actuel :</b> ${data.currentStock} ${data.unit}</p>
        <p><b>Minimum requis :</b> ${data.minStock} ${data.unit}</p>
        <br/>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://logic-supplies-production.up.railway.app'}/inventory"
           style="display:inline-block;background:#f97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Voir l'inventaire
        </a>
      </div>
    `,
  });
}

export async function sendOrderTrackingEmail(to: string, data: {
  product: string;
  quantity: number;
  unit: string;
  supplier: string;
  orderId: string;
  trackingStatus: 'ordered' | 'shipped' | 'received';
  jobSite: string;
}, lang: Lang = 'fr', testMode?: boolean) {
  if (!process.env.RESEND_API_KEY) return;
  const label = supplierLabel(data.supplier);
  const testPrefix = testMode ? '[TEST] ' : '';

  const statusLabels: Record<string, Record<Lang, string>> = {
    ordered:  { fr: 'Commandé',  en: 'Ordered',  es: 'Pedido' },
    shipped:  { fr: 'Expédié',   en: 'Shipped',  es: 'Enviado' },
    received: { fr: 'Reçu',      en: 'Received', es: 'Recibido' },
  };
  const statusColors: Record<string, string> = {
    ordered:  'background:#dbeafe;color:#1d4ed8',
    shipped:  'background:#f3e8ff;color:#7c3aed',
    received: 'background:#d1fae5;color:#065f46',
  };
  const nextStep: Record<string, Record<Lang, string>> = {
    ordered:  { fr: 'Vous serez averti lorsque la commande sera expédiée.', en: 'You will be notified when the order is shipped.', es: 'Se le notificará cuando el pedido sea enviado.' },
    shipped:  { fr: 'Vous serez averti lorsque la commande sera reçue.', en: 'You will be notified when the order is received.', es: 'Se le notificará cuando el pedido sea recibido.' },
    received: { fr: 'Le matériel est disponible au bureau. Vous pouvez le récupérer.', en: 'The material is available at the office. You can pick it up.', es: 'El material está disponible en la oficina. Puede recogerlo.' },
  };

  const statusText = statusLabels[data.trackingStatus][lang];
  const subjects: Record<Lang, string> = {
    fr: `${testPrefix}Mise à jour de votre commande — ${data.product}`,
    en: `${testPrefix}Order update — ${data.product}`,
    es: `${testPrefix}Actualización del pedido — ${data.product}`,
  };
  const headings: Record<Lang, string> = {
    fr: 'Mise à jour de commande',
    en: 'Order update',
    es: 'Actualización del pedido',
  };
  const productLabel: Record<Lang, string> = { fr: 'Produit', en: 'Product', es: 'Producto' };
  const qtyLabel: Record<Lang, string> = { fr: 'Quantité', en: 'Quantity', es: 'Cantidad' };
  const siteLabel: Record<Lang, string> = { fr: 'Chantier', en: 'Job site', es: 'Obra' };
  const supplierLbl: Record<Lang, string> = { fr: 'Fournisseur', en: 'Supplier', es: 'Proveedor' };
  const orderLabel: Record<Lang, string> = { fr: 'Commande #', en: 'Order #', es: 'Pedido #' };
  const statusLbl: Record<Lang, string> = { fr: 'Statut', en: 'Status', es: 'Estado' };
  const linkLabel: Record<Lang, string> = { fr: 'Voir mes demandes', en: 'View my requests', es: 'Ver mis solicitudes' };

  const { error } = await getResend().emails.send({
    from: getFrom(),
    to,
    subject: subjects[lang],
    html: `
      <h2>${headings[lang]}</h2>
      <p><b>${productLabel[lang]}:</b> ${data.product}</p>
      <p><b>${qtyLabel[lang]}:</b> ${data.quantity} ${data.unit}</p>
      <p><b>${siteLabel[lang]}:</b> ${data.jobSite || '—'}</p>
      <p><b>${supplierLbl[lang]}:</b> ${label}</p>
      ${data.orderId ? `<p><b>${orderLabel[lang]}:</b> ${data.orderId}</p>` : ''}
      <p><b>${statusLbl[lang]}:</b> <span style="display:inline-block;${statusColors[data.trackingStatus]};padding:4px 12px;border-radius:12px;font-weight:600;font-size:13px;">${statusText}</span></p>
      <br/>
      <p style="color:#666;font-size:14px;">${nextStep[data.trackingStatus][lang]}</p>
      <br/>
      <a href="${APP_URL}/my-requests" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        ${linkLabel[lang]}
      </a>
    `,
  });
  if (error) throw new Error(error.message);
}
