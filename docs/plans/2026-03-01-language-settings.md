# Language Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let each user (electrician, office, admin) individually choose FR/EN/ES; preference persisted in DB, applied to the full UI and to outgoing emails.

**Architecture:** React Context (`LanguageContext`) wraps the layout; translations live in `lib/i18n.ts`; each page calls `setLang(user.language)` after its existing `/api/auth/me` fetch; email functions accept a `lang` param and render content in the correct language. No external i18n library.

**Tech Stack:** Next.js 14 App Router, TypeScript, React Context, better-sqlite3.

---

## Task 1: DB migration + API changes

**Files:**
- Modify: `lib/db.ts` (add migration for `language` column)
- Modify: `app/api/auth/me/route.ts` (GET returns language, PATCH accepts language)

### Step 1: Add migration in `lib/db.ts`

Find the block that checks for `auto_approve` column (around line 536):
```typescript
  if (!userCols.find(c => c.name === 'auto_approve')) {
    db.exec(`ALTER TABLE users ADD COLUMN auto_approve INTEGER DEFAULT 0`);
  }
```

Add immediately after:
```typescript
  if (!userCols.find(c => c.name === 'language')) {
    db.exec(`ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'fr'`);
  }
```

### Step 2: Update `GET /api/auth/me` to return `language`

In `app/api/auth/me/route.ts`, the GET handler currently does:
```typescript
const session = await getSession();
```
It returns session data only. We need to also fetch the user row to get `language`.

Replace the GET function with:
```typescript
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }
  const db = getDb();
  const settings = db.prepare('SELECT inventory_enabled FROM company_settings WHERE company_id = ?').get(session.companyId) as any;
  const company = session.companyId
    ? db.prepare('SELECT subscription_status, superadmin_created FROM companies WHERE id = ?').get(session.companyId) as any
    : null;
  const userRow = db.prepare('SELECT language FROM users WHERE id = ?').get(session.userId) as any;
  return NextResponse.json({
    id: session.userId,
    companyId: session.companyId,
    name: session.name,
    email: session.email,
    role: session.role,
    inventoryEnabled: !!settings?.inventory_enabled,
    subscriptionStatus: company?.subscription_status ?? 'active',
    superadminCreated: !!company?.superadmin_created,
    language: userRow?.language ?? 'fr',
  });
}
```

### Step 3: Update `PATCH /api/auth/me` to accept `language`

In the PATCH function, the body destructure currently is:
```typescript
const { email, currentPassword, newPassword } = await req.json();
```

Replace with:
```typescript
const { email, currentPassword, newPassword, language } = await req.json();
```

Then add after the `newPassword` block (before `return NextResponse.json({ success: true })`):
```typescript
  if (language && ['fr', 'en', 'es'].includes(language)) {
    db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, user.id);
  }
```

### Step 4: Verify manually
- Start dev server: `npm run dev`
- Login, open browser console, run: `fetch('/api/auth/me').then(r=>r.json()).then(console.log)`
- Confirm `language: "fr"` appears in the response

### Step 5: Commit
```bash
git add lib/db.ts app/api/auth/me/route.ts
git commit -m "feat: add language preference to users table and API"
```

---

## Task 2: Create `lib/i18n.ts` with translations and `lib/LanguageContext.tsx`

**Files:**
- Create: `lib/i18n.ts`
- Create: `lib/LanguageContext.tsx`

### Step 1: Create `lib/i18n.ts`

```typescript
export type Lang = 'fr' | 'en' | 'es';

export const translations: Record<Lang, Record<string, string>> = {
  fr: {
    // Common
    loading: 'Chargement...',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    close: 'Fermer',
    confirm: 'Confirmer',
    yes: 'Oui',
    no: 'Non',
    error: 'Erreur',
    success: 'Succès',

    // Auth
    sign_in: 'Se connecter',
    sign_up: 'Créer un compte',
    email: 'Email',
    password: 'Mot de passe',
    confirm_password: 'Confirmer le mot de passe',
    company_name: 'Nom de la compagnie',
    your_name: 'Votre nom',
    sign_in_btn: 'Se connecter',
    signing_in: 'Connexion...',
    terms_accept: "J'accepte les",
    terms_link: "Conditions d'utilisation",
    privacy_accept: "J'accepte la",
    privacy_link: 'Politique de confidentialité',
    send_code: 'Envoyer le code →',
    sending: 'Envoi...',
    verify_code: 'Vérifier →',
    verifying: 'Vérification...',
    continue_payment: 'Continuer vers le paiement →',
    redirecting_payment: 'Redirection vers le paiement...',
    code_sent_to: 'Code envoyé à',
    verification_code: 'Code de vérification',
    resend_code: 'Renvoyer le code',
    resend_cooldown: 'Renvoyer le code ({n}s)',

    // NavBar
    nav_new: 'Nouvelle',
    nav_my_requests: 'Mes demandes',
    nav_approvals: 'Approbations',
    nav_all: 'Toutes',
    nav_budget: 'Budget',
    nav_inventory: 'Inventaire',
    nav_profile: 'Profil',
    nav_admin: 'Admin',
    nav_settings: 'Paramètres',
    nav_logout: 'Déconnexion',

    // New request
    new_request_title: 'Nouvelle demande',
    product_label: 'Produit',
    product_placeholder: 'Ex: Câble NMD 14/2',
    quantity_label: 'Quantité',
    unit_label: 'Unité',
    job_site_label: 'Chantier',
    job_site_select: 'Sélectionner un chantier',
    urgent_label: 'Urgent',
    note_label: 'Note (optionnel)',
    note_placeholder: 'Informations supplémentaires...',
    submit_request: 'Soumettre la demande',
    submitting: 'Envoi...',
    request_submitted: 'Demande envoyée!',
    supplier_label: 'Fournisseur préféré',
    supplier_any: 'N\'importe lequel',
    search_products: 'Rechercher un produit...',
    no_results: 'Aucun résultat',
    add_to_request: 'Ajouter',
    selected_product: 'Produit sélectionné',

    // My requests
    my_requests_title: 'Mes demandes',
    no_requests: 'Aucune demande pour l\'instant.',
    status_pending: 'En attente',
    status_approved: 'Approuvé',
    status_rejected: 'Rejeté',
    office_comment: 'Commentaire du bureau',
    request_detail: 'Détail de la demande',
    quantity_unit: '{qty} {unit}',
    job_site: 'Chantier',
    date: 'Date',
    urgency: 'Urgent',

    // Approvals
    approvals_title: 'Approbations',
    all_requests: 'Toutes les demandes',
    pending_requests: 'En attente',
    approve: 'Approuver',
    reject: 'Rejeter',
    approving: 'Approbation...',
    rejecting: 'Rejet...',
    office_comment_placeholder: 'Raison du rejet (optionnel)...',
    electrician: 'Électricien',
    no_pending: 'Aucune demande en attente.',
    no_requests_all: 'Aucune demande.',
    filter_all: 'Toutes',
    filter_pending: 'En attente',
    filter_approved: 'Approuvées',
    filter_rejected: 'Rejetées',
    delivery_office: 'Livraison au bureau',
    delivery_jobsite: 'Livraison au chantier',

    // Profile
    profile_title: 'Mon profil',
    search_preference: 'Préférence de recherche',
    search_preference_desc: 'Détermine comment les produits sont triés lors d\'une recherche.',
    cheapest: 'Moins cher',
    fastest: 'Plus rapide',
    cheapest_desc: 'Les produits les moins chers apparaissent en premier.',
    fastest_desc: 'Les produits du fournisseur le plus proche du chantier apparaissent en premier.',
    preference_saved: 'Préférence sauvegardée.',
    email_address: 'Adresse email',
    update_email: 'Mettre à jour l\'email',
    email_updated: 'Email mis à jour.',
    change_password: 'Changer le mot de passe',
    current_password: 'Mot de passe actuel',
    new_password: 'Nouveau mot de passe',
    confirm_new_password: 'Confirmer le nouveau mot de passe',
    password_updated: 'Mot de passe mis à jour.',
    update_password_btn: 'Changer le mot de passe',
    language_label: 'Langue',
    language_saved: 'Langue sauvegardée.',

    // Admin
    admin_title: 'Administration',
    job_sites_title: 'Chantiers',
    users_title: 'Utilisateurs',
    add_job_site: 'Ajouter un chantier',
    add_user: 'Ajouter un utilisateur',
    job_site_name: 'Nom du chantier',
    job_site_address: 'Adresse',
    budget: 'Budget',
    role_electrician: 'Électricien',
    role_office: 'Bureau',
    role_admin: 'Admin',
    invite_sent: 'Invitation envoyée.',
    user_deleted: 'Utilisateur supprimé.',
    job_site_deleted: 'Chantier supprimé.',

    // Settings sections
    settings_title: 'Paramètres',
    suppliers_title: 'Fournisseurs',
    billing_title: 'Facturation',
    notifications_title: 'Notifications',
    payment_methods: 'Méthodes de paiement',

    // Budget
    budget_title: 'Budget',
    committed: 'Engagé',
    remaining: 'Restant',
    total: 'Total',
    no_budget_alerts: 'Aucune alerte budget.',

    // Inventory
    inventory_title: 'Inventaire',
    scan_barcode: 'Scanner',
    add_item: 'Ajouter un article',

    // Misc
    saving: 'Sauvegarde...',
    saved: 'Sauvegardé.',
    updating: 'Mise à jour...',
    updated: 'Mis à jour.',
    deleting: 'Suppression...',
    deleted: 'Supprimé.',
  },

  en: {
    // Common
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    error: 'Error',
    success: 'Success',

    // Auth
    sign_in: 'Sign in',
    sign_up: 'Create account',
    email: 'Email',
    password: 'Password',
    confirm_password: 'Confirm password',
    company_name: 'Company name',
    your_name: 'Your name',
    sign_in_btn: 'Sign in',
    signing_in: 'Signing in...',
    terms_accept: 'I accept the',
    terms_link: 'Terms of Use',
    privacy_accept: 'I accept the',
    privacy_link: 'Privacy Policy',
    send_code: 'Send code →',
    sending: 'Sending...',
    verify_code: 'Verify →',
    verifying: 'Verifying...',
    continue_payment: 'Continue to payment →',
    redirecting_payment: 'Redirecting to payment...',
    code_sent_to: 'Code sent to',
    verification_code: 'Verification code',
    resend_code: 'Resend code',
    resend_cooldown: 'Resend code ({n}s)',

    // NavBar
    nav_new: 'New',
    nav_my_requests: 'My requests',
    nav_approvals: 'Approvals',
    nav_all: 'All',
    nav_budget: 'Budget',
    nav_inventory: 'Inventory',
    nav_profile: 'Profile',
    nav_admin: 'Admin',
    nav_settings: 'Settings',
    nav_logout: 'Sign out',

    // New request
    new_request_title: 'New request',
    product_label: 'Product',
    product_placeholder: 'Ex: NMD 14/2 Cable',
    quantity_label: 'Quantity',
    unit_label: 'Unit',
    job_site_label: 'Job site',
    job_site_select: 'Select a job site',
    urgent_label: 'Urgent',
    note_label: 'Note (optional)',
    note_placeholder: 'Additional information...',
    submit_request: 'Submit request',
    submitting: 'Submitting...',
    request_submitted: 'Request submitted!',
    supplier_label: 'Preferred supplier',
    supplier_any: 'Any',
    search_products: 'Search for a product...',
    no_results: 'No results',
    add_to_request: 'Add',
    selected_product: 'Selected product',

    // My requests
    my_requests_title: 'My requests',
    no_requests: 'No requests yet.',
    status_pending: 'Pending',
    status_approved: 'Approved',
    status_rejected: 'Rejected',
    office_comment: 'Office comment',
    request_detail: 'Request detail',
    quantity_unit: '{qty} {unit}',
    job_site: 'Job site',
    date: 'Date',
    urgency: 'Urgent',

    // Approvals
    approvals_title: 'Approvals',
    all_requests: 'All requests',
    pending_requests: 'Pending',
    approve: 'Approve',
    reject: 'Reject',
    approving: 'Approving...',
    rejecting: 'Rejecting...',
    office_comment_placeholder: 'Reason for rejection (optional)...',
    electrician: 'Electrician',
    no_pending: 'No pending requests.',
    no_requests_all: 'No requests.',
    filter_all: 'All',
    filter_pending: 'Pending',
    filter_approved: 'Approved',
    filter_rejected: 'Rejected',
    delivery_office: 'Deliver to office',
    delivery_jobsite: 'Deliver to job site',

    // Profile
    profile_title: 'My profile',
    search_preference: 'Search preference',
    search_preference_desc: 'Determines how products are sorted when searching.',
    cheapest: 'Cheapest',
    fastest: 'Fastest',
    cheapest_desc: 'The cheapest products appear first.',
    fastest_desc: 'Products from the supplier closest to the job site appear first.',
    preference_saved: 'Preference saved.',
    email_address: 'Email address',
    update_email: 'Update email',
    email_updated: 'Email updated.',
    change_password: 'Change password',
    current_password: 'Current password',
    new_password: 'New password',
    confirm_new_password: 'Confirm new password',
    password_updated: 'Password updated.',
    update_password_btn: 'Change password',
    language_label: 'Language',
    language_saved: 'Language saved.',

    // Admin
    admin_title: 'Administration',
    job_sites_title: 'Job sites',
    users_title: 'Users',
    add_job_site: 'Add job site',
    add_user: 'Add user',
    job_site_name: 'Job site name',
    job_site_address: 'Address',
    budget: 'Budget',
    role_electrician: 'Electrician',
    role_office: 'Office',
    role_admin: 'Admin',
    invite_sent: 'Invitation sent.',
    user_deleted: 'User deleted.',
    job_site_deleted: 'Job site deleted.',

    // Settings sections
    settings_title: 'Settings',
    suppliers_title: 'Suppliers',
    billing_title: 'Billing',
    notifications_title: 'Notifications',
    payment_methods: 'Payment methods',

    // Budget
    budget_title: 'Budget',
    committed: 'Committed',
    remaining: 'Remaining',
    total: 'Total',
    no_budget_alerts: 'No budget alerts.',

    // Inventory
    inventory_title: 'Inventory',
    scan_barcode: 'Scan',
    add_item: 'Add item',

    // Misc
    saving: 'Saving...',
    saved: 'Saved.',
    updating: 'Updating...',
    updated: 'Updated.',
    deleting: 'Deleting...',
    deleted: 'Deleted.',
  },

  es: {
    // Common
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    close: 'Cerrar',
    confirm: 'Confirmar',
    yes: 'Sí',
    no: 'No',
    error: 'Error',
    success: 'Éxito',

    // Auth
    sign_in: 'Iniciar sesión',
    sign_up: 'Crear cuenta',
    email: 'Correo electrónico',
    password: 'Contraseña',
    confirm_password: 'Confirmar contraseña',
    company_name: 'Nombre de la empresa',
    your_name: 'Tu nombre',
    sign_in_btn: 'Iniciar sesión',
    signing_in: 'Iniciando sesión...',
    terms_accept: 'Acepto los',
    terms_link: 'Términos de uso',
    privacy_accept: 'Acepto la',
    privacy_link: 'Política de privacidad',
    send_code: 'Enviar código →',
    sending: 'Enviando...',
    verify_code: 'Verificar →',
    verifying: 'Verificando...',
    continue_payment: 'Continuar al pago →',
    redirecting_payment: 'Redirigiendo al pago...',
    code_sent_to: 'Código enviado a',
    verification_code: 'Código de verificación',
    resend_code: 'Reenviar código',
    resend_cooldown: 'Reenviar código ({n}s)',

    // NavBar
    nav_new: 'Nueva',
    nav_my_requests: 'Mis solicitudes',
    nav_approvals: 'Aprobaciones',
    nav_all: 'Todas',
    nav_budget: 'Presupuesto',
    nav_inventory: 'Inventario',
    nav_profile: 'Perfil',
    nav_admin: 'Admin',
    nav_settings: 'Configuración',
    nav_logout: 'Cerrar sesión',

    // New request
    new_request_title: 'Nueva solicitud',
    product_label: 'Producto',
    product_placeholder: 'Ej: Cable NMD 14/2',
    quantity_label: 'Cantidad',
    unit_label: 'Unidad',
    job_site_label: 'Obra',
    job_site_select: 'Seleccionar una obra',
    urgent_label: 'Urgente',
    note_label: 'Nota (opcional)',
    note_placeholder: 'Información adicional...',
    submit_request: 'Enviar solicitud',
    submitting: 'Enviando...',
    request_submitted: '¡Solicitud enviada!',
    supplier_label: 'Proveedor preferido',
    supplier_any: 'Cualquiera',
    search_products: 'Buscar un producto...',
    no_results: 'Sin resultados',
    add_to_request: 'Agregar',
    selected_product: 'Producto seleccionado',

    // My requests
    my_requests_title: 'Mis solicitudes',
    no_requests: 'Sin solicitudes por ahora.',
    status_pending: 'Pendiente',
    status_approved: 'Aprobado',
    status_rejected: 'Rechazado',
    office_comment: 'Comentario de oficina',
    request_detail: 'Detalle de la solicitud',
    quantity_unit: '{qty} {unit}',
    job_site: 'Obra',
    date: 'Fecha',
    urgency: 'Urgente',

    // Approvals
    approvals_title: 'Aprobaciones',
    all_requests: 'Todas las solicitudes',
    pending_requests: 'Pendientes',
    approve: 'Aprobar',
    reject: 'Rechazar',
    approving: 'Aprobando...',
    rejecting: 'Rechazando...',
    office_comment_placeholder: 'Razón del rechazo (opcional)...',
    electrician: 'Electricista',
    no_pending: 'No hay solicitudes pendientes.',
    no_requests_all: 'No hay solicitudes.',
    filter_all: 'Todas',
    filter_pending: 'Pendientes',
    filter_approved: 'Aprobadas',
    filter_rejected: 'Rechazadas',
    delivery_office: 'Entrega en oficina',
    delivery_jobsite: 'Entrega en obra',

    // Profile
    profile_title: 'Mi perfil',
    search_preference: 'Preferencia de búsqueda',
    search_preference_desc: 'Determina cómo se ordenan los productos en la búsqueda.',
    cheapest: 'Más económico',
    fastest: 'Más rápido',
    cheapest_desc: 'Los productos más económicos aparecen primero.',
    fastest_desc: 'Los productos del proveedor más cercano a la obra aparecen primero.',
    preference_saved: 'Preferencia guardada.',
    email_address: 'Correo electrónico',
    update_email: 'Actualizar correo',
    email_updated: 'Correo actualizado.',
    change_password: 'Cambiar contraseña',
    current_password: 'Contraseña actual',
    new_password: 'Nueva contraseña',
    confirm_new_password: 'Confirmar nueva contraseña',
    password_updated: 'Contraseña actualizada.',
    update_password_btn: 'Cambiar contraseña',
    language_label: 'Idioma',
    language_saved: 'Idioma guardado.',

    // Admin
    admin_title: 'Administración',
    job_sites_title: 'Obras',
    users_title: 'Usuarios',
    add_job_site: 'Agregar obra',
    add_user: 'Agregar usuario',
    job_site_name: 'Nombre de la obra',
    job_site_address: 'Dirección',
    budget: 'Presupuesto',
    role_electrician: 'Electricista',
    role_office: 'Oficina',
    role_admin: 'Admin',
    invite_sent: 'Invitación enviada.',
    user_deleted: 'Usuario eliminado.',
    job_site_deleted: 'Obra eliminada.',

    // Settings sections
    settings_title: 'Configuración',
    suppliers_title: 'Proveedores',
    billing_title: 'Facturación',
    notifications_title: 'Notificaciones',
    payment_methods: 'Métodos de pago',

    // Budget
    budget_title: 'Presupuesto',
    committed: 'Comprometido',
    remaining: 'Restante',
    total: 'Total',
    no_budget_alerts: 'Sin alertas de presupuesto.',

    // Inventory
    inventory_title: 'Inventario',
    scan_barcode: 'Escanear',
    add_item: 'Agregar artículo',

    // Misc
    saving: 'Guardando...',
    saved: 'Guardado.',
    updating: 'Actualizando...',
    updated: 'Actualizado.',
    deleting: 'Eliminando...',
    deleted: 'Eliminado.',
  },
};
```

### Step 2: Create `lib/LanguageContext.tsx`

```typescript
'use client';
import { createContext, useContext, useState, ReactNode } from 'react';
import { translations, Lang } from './i18n';

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; }
const LanguageContext = createContext<LangCtx>({ lang: 'fr', setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('fr');
  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}

export function useT() {
  const { lang } = useContext(LanguageContext);
  return (key: string) => translations[lang]?.[key] ?? translations['fr'][key] ?? key;
}
```

### Step 3: Verify the files compile

```bash
npx tsc --noEmit
```
Expected: no errors related to the new files.

### Step 4: Commit

```bash
git add lib/i18n.ts lib/LanguageContext.tsx
git commit -m "feat: add i18n translations and LanguageContext"
```

---

## Task 3: Wrap layout with `LanguageProvider`

**Files:**
- Modify: `app/layout.tsx`

### Step 1: Update `app/layout.tsx`

Replace the entire file:
```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "logicSupplies",
  description: "Gestion des demandes de matériel électrique",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-slate-200 min-h-screen`}>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
```

### Step 2: Verify dev server starts

```bash
npm run dev
```
Expected: no errors, app loads normally.

### Step 3: Commit

```bash
git add app/layout.tsx
git commit -m "feat: wrap layout with LanguageProvider"
```

---

## Task 4: Language selector in Profile page

**Files:**
- Modify: `app/profile/page.tsx`

### Step 1: Add `useLang` + `useT` imports and language state

At the top of the file, add imports:
```typescript
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';
```

Inside the component, after the existing state declarations, add:
```typescript
const { lang, setLang } = useLang();
const t = useT();
const [langSaved, setLangSaved] = useState(false);
```

### Step 2: Call `setLang` after the `/api/auth/me` fetch

The existing `useEffect` has:
```typescript
.then(u => {
  if (!u) return;
  setCurrentUser(u);
  setEmail(u.email);
});
```

Add `setLang((u.language as Lang) || 'fr')` to sync the context when the user loads:
```typescript
.then(u => {
  if (!u) return;
  setCurrentUser(u);
  setEmail(u.email);
  setLang((u.language as Lang) || 'fr');
});
```

### Step 3: Add the `handleLanguage` save function

```typescript
function handleLanguage(l: Lang) {
  setLang(l);
  setLangSaved(false);
  fetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: l }),
  }).then(() => { setLangSaved(true); setTimeout(() => setLangSaved(false), 2000); }).catch(() => {});
}
```

### Step 4: Add the language selector UI block

Add this new section in the JSX, before the email form (around line 141 in the original):

```tsx
{/* Language */}
<div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
  <h2 className="font-semibold text-gray-900 mb-1">{t('language_label')}</h2>
  <div className="flex rounded-xl overflow-hidden border border-gray-200">
    {(['fr', 'en', 'es'] as Lang[]).map((l, i) => (
      <button
        key={l}
        type="button"
        onClick={() => handleLanguage(l)}
        className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
          i > 0 ? 'border-l border-gray-200' : ''
        } ${lang === l ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
      >
        {l === 'fr' ? '🇫🇷 Français' : l === 'en' ? '🇨🇦 English' : '🇪🇸 Español'}
      </button>
    ))}
  </div>
  {langSaved && <p className="text-xs text-green-600 mt-1">{t('language_saved')}</p>}
</div>
```

### Step 5: Verify in browser

- Go to `/profile`
- Click "English" → page still in French (other pages not translated yet, that's OK)
- Click "Español" → same
- Refresh: language should come back from the API (but UI still French until other tasks done)

### Step 6: Commit

```bash
git add app/profile/page.tsx
git commit -m "feat: add language selector to profile page"
```

---

## Task 5: Translate NavBar

**Files:**
- Modify: `components/NavBar.tsx`

### Step 1: Add imports and `useT` in NavBar

The NavBar is already a client component. Add at the top:
```typescript
import { useT } from '@/lib/LanguageContext';
```

Inside the component, add after the existing state:
```typescript
const t = useT();
```

### Step 2: Replace hardcoded strings

Replace these specific strings:
- `'Déconnexion'` → `{t('nav_logout')}`
- `<span>Nouvelle</span>` → `<span>{t('nav_new')}</span>`
- `<span>Mes demandes</span>` → `<span>{t('nav_my_requests')}</span>`
- `<span>Inventaire</span>` (both occurrences) → `<span>{t('nav_inventory')}</span>`
- `<span>Profil</span>` → `<span>{t('nav_profile')}</span>`
- `<span>Approbations</span>` → `<span>{t('nav_approvals')}</span>`
- `<span>Toutes</span>` → `<span>{t('nav_all')}</span>`
- `<span>Budget</span>` → `<span>{t('nav_budget')}</span>`
- `<span>Admin</span>` → `<span>{t('nav_admin')}</span>`
- `<span>Paramètres</span>` → `<span>{t('nav_settings')}</span>`

### Step 3: Test

Switch language to English in profile, navigate back — NavBar labels should be in English.

### Step 4: Commit

```bash
git add components/NavBar.tsx
git commit -m "feat: translate NavBar"
```

---

## Task 6: Translate My Requests page

**Files:**
- Modify: `app/my-requests/page.tsx`

### Step 1: Add imports

```typescript
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';
```

### Step 2: Add `setLang` and `t` in component

```typescript
const { setLang } = useLang();
const t = useT();
```

### Step 3: Sync language after user fetch

In the existing `useEffect` where user is fetched, add:
```typescript
setLang((u.language as Lang) || 'fr');
```

### Step 4: Replace `statusConfig` labels

The `statusConfig` object at the top uses hardcoded strings but is declared outside the component. Move it inside the component and use `t()`:
```typescript
const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: t('status_pending'), color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: t('status_approved'), color: 'bg-green-100 text-green-800' },
  rejected: { label: t('status_rejected'), color: 'bg-red-100 text-red-800' },
};
```

### Step 5: Replace remaining hardcoded strings

Find and replace in the JSX:
- `'Chargement...'` → `{t('loading')}`
- `'Mes demandes'` (h1) → `{t('my_requests_title')}`
- `'Aucune demande pour l\'instant.'` → `{t('no_requests')}`
- `'Commentaire du bureau'` → `{t('office_comment')}`
- `'Chantier'` → `{t('job_site')}`
- `'Urgent'` (label) → `{t('urgency')}`
- `'Fermer'` or close button → `{t('close')}`

### Step 6: Commit

```bash
git add app/my-requests/page.tsx
git commit -m "feat: translate My Requests page"
```

---

## Task 7: Translate Approvals page

**Files:**
- Modify: `app/approvals/page.tsx`

### Step 1: Add imports + hook

Same pattern as Task 6:
```typescript
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';
// Inside component:
const { setLang } = useLang();
const t = useT();
```

### Step 2: Sync language after user fetch

Same pattern: `setLang((u.language as Lang) || 'fr')` after user loads.

### Step 3: Replace hardcoded strings

Key strings to replace:
- `'Chargement...'` → `{t('loading')}`
- `'Approbations'` / `'Toutes les demandes'` headings → use keys
- `'En attente'` / `'Approuvée'` / `'Rejetée'` filter tabs → use keys
- `'Approuver'` / `'Rejeter'` buttons → `{t('approve')}` / `{t('reject')}`
- `'Approbation...'` / `'Rejet...'` → use keys
- `'Électricien'` label → `{t('electrician')}`
- `'Commentaire du bureau...'` placeholder → `{t('office_comment_placeholder')}`
- `'Aucune demande en attente.'` → `{t('no_pending')}`
- `'Aucune demande.'` → `{t('no_requests_all')}`
- `'Livraison au bureau'` / `'Livraison au chantier'` → use keys
- Status badges: use `statusConfig` same as Task 6

### Step 4: Commit

```bash
git add app/approvals/page.tsx
git commit -m "feat: translate Approvals page"
```

---

## Task 8: Translate New Request page

**Files:**
- Modify: `app/new-request/page.tsx`

### Step 1: Add imports + hook + `setLang` call (same pattern as tasks 6 & 7)

### Step 2: Replace hardcoded strings

Key strings:
- `'Nouvelle demande de matériel'` title → `{t('new_request_title')}`
- `'Produit'` label → `{t('product_label')}`
- `'Ex: Câble NMD 14/2'` placeholder → `{t('product_placeholder')}`
- `'Quantité'` → `{t('quantity_label')}`
- `'Chantier'` → `{t('job_site_label')}`
- `'Sélectionner un chantier'` → `{t('job_site_select')}`
- `'Urgent'` → `{t('urgent_label')}`
- `'Note (optionnel)'` → `{t('note_label')}`
- `'Soumettre la demande'` → `{t('submit_request')}`
- `'Envoi...'` → `{t('submitting')}`
- `'Rechercher un produit...'` → `{t('search_products')}`
- `'Aucun résultat'` → `{t('no_results')}`
- `'Fournisseur préféré'` → `{t('supplier_label')}`
- `'N\'importe lequel'` → `{t('supplier_any')}`
- `'Chargement...'` → `{t('loading')}`

### Step 3: Commit

```bash
git add app/new-request/page.tsx
git commit -m "feat: translate New Request page"
```

---

## Task 9: Translate Profile page (remaining strings)

**Files:**
- Modify: `app/profile/page.tsx`

The language selector was already added in Task 4. Now translate the rest of the page.

### Step 1: Replace remaining hardcoded strings

- `'Mon profil'` → `{t('profile_title')}`
- `'Chargement...'` → `{t('loading')}`
- `'Préférence de recherche'` → `{t('search_preference')}`
- `'Détermine comment les produits sont triés lors d\'une recherche.'` → `{t('search_preference_desc')}`
- `'Moins cher'` → `{t('cheapest')}`
- `'Plus rapide'` → `{t('fastest')}`
- `'Les produits les moins chers apparaissent en premier.'` → `{t('cheapest_desc')}`
- `'Les produits du fournisseur le plus proche du chantier apparaissent en premier.'` → `{t('fastest_desc')}`
- `'Préférence sauvegardée.'` → `{t('preference_saved')}`
- `'Adresse email'` → `{t('email_address')}`
- `'Mettre à jour l\'email'` → `{t('update_email')}`
- `'Email mis à jour.'` → `{t('email_updated')}`
- `'Changer le mot de passe'` → `{t('change_password')}`
- `'Mot de passe actuel'` placeholder → `{t('current_password')}`
- `'Nouveau mot de passe'` placeholder → `{t('new_password')}`
- `'Confirmer le nouveau mot de passe'` placeholder → `{t('confirm_new_password')}`
- `'Mot de passe mis à jour.'` → `{t('password_updated')}`
- `'Changer le mot de passe'` button → `{t('update_password_btn')}`

Also: update the `emailMsg` and `pwMsg` text to use translation keys where applicable.

### Step 2: Commit

```bash
git add app/profile/page.tsx
git commit -m "feat: translate remaining Profile page strings"
```

---

## Task 10: Translate Admin and Settings pages

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/settings/page.tsx`

### Step 1: Same pattern for both pages

Add imports + hooks + `setLang` call after user fetch.

### Step 2: `app/admin/page.tsx` — replace key strings

- `'Administration'` → `{t('admin_title')}`
- `'Chantiers'` → `{t('job_sites_title')}`
- `'Utilisateurs'` → `{t('users_title')}`
- `'Ajouter un chantier'` → `{t('add_job_site')}`
- `'Ajouter un utilisateur'` → `{t('add_user')}`
- Role labels (`'Électricien'`, `'Bureau'`, `'Admin'`) → use keys
- `'Invitation envoyée.'` → `{t('invite_sent')}`
- `'Utilisateur supprimé.'` → `{t('user_deleted')}`
- `'Chantier supprimé.'` → `{t('job_site_deleted')}`
- `'Chargement...'` → `{t('loading')}`

### Step 3: `app/settings/page.tsx` — replace key strings

- `'Paramètres'` (title) → `{t('settings_title')}`
- `'Fournisseurs'` section → `{t('suppliers_title')}`
- `'Facturation'` → `{t('billing_title')}`
- `'Notifications'` → `{t('notifications_title')}`
- `'Méthodes de paiement'` → `{t('payment_methods')}`
- `'Sauvegarde...'` → `{t('saving')}`
- `'Sauvegardé.'` → `{t('saved')}`
- `'Chargement...'` → `{t('loading')}`

### Step 4: Commit

```bash
git add app/admin/page.tsx app/settings/page.tsx
git commit -m "feat: translate Admin and Settings pages"
```

---

## Task 11: Translate login page

**Files:**
- Modify: `app/page.tsx`

The login page is special: the user isn't authenticated yet, so there's no `language` from the DB. **Default to `'fr'` — the language selector will update once logged in.** But we still want the login page itself to be translated once the user selects a language in profile and comes back.

### Step 1: Add imports and hook

```typescript
import { useT } from '@/lib/LanguageContext';
// Inside component:
const t = useT();
```

Note: No `setLang` call here since there's no authenticated user yet. The context starts at `'fr'` by default.

### Step 2: Replace hardcoded strings

- `'Se connecter'` toggle → `{t('sign_in')}`
- `'Créer un compte'` toggle → `{t('sign_up')}`
- `'Email'` label → `{t('email')}`
- `'Mot de passe'` label → `{t('password')}`
- `'Confirmer le mot de passe'` label → `{t('confirm_password')}`
- `'Nom de la compagnie'` → `{t('company_name')}`
- `'Votre nom'` → `{t('your_name')}`
- `'Code envoyé à'` → `{t('code_sent_to')}`
- `'Code de vérification'` → `{t('verification_code')}`
- `'Renvoyer le code'` → `{t('resend_code')}`
- Resend cooldown: replace `\`Renvoyer le code (${resendCooldown}s)\`` → `` t('resend_cooldown').replace('{n}', String(resendCooldown)) ``
- Button labels:
  - `'Envoyer le code →'` → `{t('send_code')}`
  - `'Envoi...'` → `{t('sending')}`
  - `'Vérifier →'` → `{t('verify_code')}`
  - `'Vérification...'` → `{t('verifying')}`
  - `'Continuer vers le paiement →'` → `{t('continue_payment')}`
  - `'Redirection vers le paiement...'` → `{t('redirecting_payment')}`
  - `'Se connecter'` (submit) → `{t('sign_in_btn')}`
  - `'Connexion...'` → `{t('signing_in')}`
- Legal checkboxes:
  - `'J\'accepte les'` → `{t('terms_accept')}`
  - `'Conditions d\'utilisation'` → `{t('terms_link')}`
  - `'J\'accepte la'` → `{t('privacy_accept')}`
  - `'Politique de confidentialité'` → `{t('privacy_link')}`

### Step 3: Commit

```bash
git add app/page.tsx
git commit -m "feat: translate login page"
```

---

## Task 12: Translate email functions

**Files:**
- Modify: `lib/email.ts`

### Step 1: Add `lang` parameter to all send functions

The email translations live inline in the function bodies. Add a `lang: 'fr' | 'en' | 'es' = 'fr'` parameter to each function. Use a simple helper to pick the right string.

Replace the content of `lib/email.ts` entirely with:

```typescript
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
```

### Step 2: Commit

```bash
git add lib/email.ts
git commit -m "feat: add lang param to all email functions with FR/EN/ES content"
```

---

## Task 13: Pass user language to email callers

**Files:**
- Modify: `app/api/requests/route.ts` (sendNewRequestEmail caller)
- Modify: `app/api/requests/[id]/route.ts` (sendStatusEmail caller)
- Modify: `lib/approval.ts` (all email callers)

### Step 1: `app/api/requests/route.ts`

The office users are notified when a new request is submitted. Look up each office user's language:

Find the block (around line 71):
```typescript
for (const u of officeUsers) {
  sendNewRequestEmail(u.email, {
    ...
  }).catch(console.error);
}
```

Replace with:
```typescript
const officeUsersWithLang = db.prepare("SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(companyId) as { email: string; language: string }[];
for (const u of officeUsersWithLang) {
  sendNewRequestEmail(u.email, {
    product, quantity, unit,
    jobSite: jobSite?.name || '',
    electrician: '',
    urgency: !!urgency,
    note: note || '',
  }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
}
```

Also update the existing query variable name if it was `officeUsers` — just rename it to `officeUsersWithLang` and update all usages in that block.

### Step 2: `app/api/requests/[id]/route.ts`

For `sendStatusEmail`, the electrician's language needs to be fetched. The query already joins with users:
```typescript
SELECT r.*, u.email as electrician_email FROM requests r LEFT JOIN users u ON r.electrician_id = u.id
```

Add `u.language as electrician_language` to the SELECT:
```typescript
SELECT r.*, u.email as electrician_email, u.language as electrician_language FROM requests r LEFT JOIN users u ON r.electrician_id = u.id
```

Then pass `request.electrician_language` to the email call:
```typescript
sendStatusEmail(request.electrician_email, {
  product: request.product, quantity: request.quantity, unit: request.unit,
  status, officeComment: office_comment,
}, (request.electrician_language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
```

### Step 3: `lib/approval.ts`

Several email calls here. For each, look up the user's language from the users table.

**For `sendStatusEmail` (electrician, around line 107):**
The `request` object already has `electrician_email`. Add `electrician_language` to the request query at the top of `triggerApproval`:

Find the query that fetches the request (there should be one near the top of the function). Add `u.language as electrician_language` to the SELECT joining with users.

Then:
```typescript
sendStatusEmail(request.electrician_email, {
  product: request.product, quantity: request.quantity, unit: request.unit,
  status: 'approved', officeComment: office_comment,
}, (request.electrician_language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
```

**For `sendBudgetAlertEmail` (office users, around line 69):**
Change the `officeEmails` query to also fetch `language`:
```typescript
const officeEmails = db.prepare("SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(companyId) as { email: string; language: string }[];
```

Then pass language in each call:
```typescript
sendBudgetAlertEmail(u.email, { ... }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
```

**For `sendOrderConfirmationEmail` and `sendCartNotificationEmail` (around line 158):**
The `allEmails` array is constructed from office users and electrician. Change to carry language too:
```typescript
const officeUsers = db.prepare("SELECT email, language FROM users WHERE role IN ('office', 'admin') AND company_id = ?").all(companyId) as { email: string; language: string }[];
const allRecipients = [
  ...officeUsers,
  { email: request.electrician_email, language: request.electrician_language },
].filter(u => u.email);
```

Then:
```typescript
if (result.success) {
  for (const u of allRecipients) {
    sendOrderConfirmationEmail(u.email, { ... }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
  }
} else if (result.inCart) {
  for (const u of allRecipients) {
    sendCartNotificationEmail(u.email, { ... }, (u.language as 'fr' | 'en' | 'es') || 'fr').catch(console.error);
  }
}
```

### Step 4: Verify TypeScript compiles

```bash
npx tsc --noEmit
```
Expected: no errors.

### Step 5: Commit

```bash
git add app/api/requests/route.ts app/api/requests/[id]/route.ts lib/approval.ts
git commit -m "feat: pass user language to all email callers"
```

---

## Task 14: Final verification and push

### Step 1: Build

```bash
npm run build
```
Expected: build succeeds with no errors.

### Step 2: Test the full flow manually

1. Login as an electrician → app loads in French
2. Go to Profile → select English → NavBar changes to English, all pages in English
3. Change to Spanish → verify
4. Log out, log back in → language persists (comes from DB)

### Step 3: Push

```bash
git push
cd /Users/oli/Downloads/project\ sparky && git add app && git commit -m "chore: update app submodule" && git push
```
