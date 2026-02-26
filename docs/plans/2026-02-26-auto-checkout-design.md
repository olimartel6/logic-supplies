# Design: Paiement automatique des commandes

**Date:** 2026-02-26
**Feature:** Checkout automatique avec carte de crédit lors de l'approbation d'une commande

## Contexte

Actuellement, les fonctions `place*Order` ajoutent le produit au panier mais ne complètent pas le checkout — un admin doit se connecter manuellement au site fournisseur pour finaliser. Cette feature automatise le checkout complet : adresse de livraison + paiement par carte.

## Base de données

**`company_settings`** — 2 nouveaux champs :
```sql
office_address TEXT                                     -- adresse du bureau de la compagnie
default_delivery TEXT DEFAULT 'office'
  CHECK(default_delivery IN ('office', 'jobsite'))      -- livraison par défaut
```

**Nouvelle table `company_payment_methods`** :
```sql
CREATE TABLE IF NOT EXISTS company_payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  card_holder TEXT NOT NULL,
  card_number_encrypted TEXT NOT NULL,
  card_expiry TEXT NOT NULL,
  card_cvv_encrypted TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Carte chiffrée via `encrypt()` (même pattern que `supplier_accounts.password_encrypted`).

## API

- `GET /api/settings/payment` — retourne `{ card_holder, card_last4, card_expiry, configured }` (jamais le numéro complet)
- `POST /api/settings/payment` — sauvegarde/met à jour la carte
- `DELETE /api/settings/payment` — supprime la carte
- `PATCH /api/settings` — déjà existant, on y ajoute `office_address` et `default_delivery`
- `PATCH /api/requests/[id]` — approbation existante, on ajoute `delivery_override: 'office' | 'jobsite'` (optionnel)

## Automatisation checkout

Les 4 fonctions `place*Order` sont étendues pour accepter `address` et `paymentInfo` et compléter le checkout :

```typescript
interface PaymentInfo {
  cardHolder: string;
  cardNumber: string;   // décrypté juste avant usage
  cardExpiry: string;   // "MM/YY"
  cardCvv: string;      // décrypté juste avant usage
}

async function place*Order(
  username: string,
  password: string,
  product: string,
  quantity: number,
  address?: string,       // nouveau
  payment?: PaymentInfo   // nouveau
): Promise<OrderResult>
```

Quand `address` et `payment` sont fournis, la fonction continue après le panier pour :
1. Naviguer vers checkout
2. Entrer/sélectionner l'adresse
3. Entrer la carte
4. Soumettre → retourner le numéro de commande

Sans ces params, comportement actuel conservé (add-to-cart seulement → rétrocompatibilité).

**Complexité par fournisseur :**
- Guillevin (Shopify) — checkout standard, le plus prévisible
- Lumen — checkout typique B2B
- Canac (SAP Commerce Cloud) — checkout complexe
- Home Depot — protection anti-bot agressive, peut nécessiter ajustements

## Flow d'approbation mis à jour

Dans `app/api/requests/[id]/route.ts` :
1. Récupère `delivery_override` du body (ou utilise `default_delivery` de `company_settings`)
2. Résout l'adresse : si 'office' → `company_settings.office_address`, si 'jobsite' → `job_sites.address`
3. Récupère et déchiffre la carte depuis `company_payment_methods`
4. Passe `address` et `paymentInfo` à `selectAndOrder()` → à `place*Order()`

## UI

**`/settings` — nouvelle section "Moyen de paiement" :**
- Formulaire : nom sur carte, numéro (16 chiffres), expiry (MM/YY), CVV
- Sauvegardé → affiche `•••• •••• •••• 4242` + bouton Supprimer
- Champ "Adresse du bureau" (texte libre)
- Toggle "Livraison par défaut : Bureau / Chantier"

**Écran d'approbation (bureau) :**
- Nouveau sélecteur "Livraison" : boutons Bureau / Chantier
- Pré-sélectionné selon `default_delivery`
- Visible uniquement si la carte est configurée (sinon comportement actuel)

## Fichiers à modifier/créer

- Modifier: `app/lib/db.ts` — nouveaux champs + table
- Créer: `app/app/api/settings/payment/route.ts`
- Modifier: `app/app/api/settings/route.ts` — ajouter office_address + default_delivery
- Modifier: `app/lib/lumen.ts` — checkout complet
- Modifier: `app/lib/canac.ts` — checkout complet
- Modifier: `app/lib/homedepot.ts` — checkout complet
- Modifier: `app/lib/guillevin.ts` — checkout complet
- Modifier: `app/lib/supplier-router.ts` — passer address + payment
- Modifier: `app/app/api/requests/[id]/route.ts` — résoudre adresse + récupérer carte
- Modifier: `app/app/settings/page.tsx` — section paiement + adresse + toggle
- Modifier: `app/app/requests/page.tsx` ou composant approbation — sélecteur livraison
