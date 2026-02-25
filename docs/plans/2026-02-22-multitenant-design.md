# Architecture Multi-Tenant — Design Document

**Date :** 2026-02-22
**Statut :** Approuvé

---

## Objectif

Transformer Sparky d'une application single-tenant en une architecture multi-tenant sécurisée où chaque compagnie est complètement isolée. Un seul compte superadmin (le propriétaire du logiciel) crée et gère les compagnies clientes.

---

## Architecture choisie : Shared Database + company_id

Un seul fichier SQLite. Chaque table de données porte une colonne `company_id` (FK → `companies`). Chaque requête API filtre automatiquement par `company_id` injecté depuis la session. C'est l'architecture standard des SaaS (Shopify, Stripe, Linear).

---

## Schéma de base de données

### Nouvelle table

```sql
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subscription_status TEXT DEFAULT 'active'
    CHECK(subscription_status IN ('active', 'suspended', 'cancelled')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tables modifiées (ajout de company_id)

| Table | Changement |
|-------|-----------|
| `users` | + `company_id INTEGER REFERENCES companies(id)` (NULL pour superadmin) · contrainte UNIQUE(email, company_id) remplace UNIQUE(email) · role ajoute `'superadmin'` |
| `job_sites` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `requests` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `supplier_orders` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `supplier_accounts` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `supplier_categories` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `company_settings` | Remplacer `CHECK(id=1)` singleton par `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `budget_alerts` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `purchase_order_logs` | + `company_id INTEGER NOT NULL REFERENCES companies(id)` |
| `products` | **Inchangé** — catalogue global partagé |

### Fresh start

Pas de migration des données existantes. La DB repart à zéro. Le superadmin recrée les compagnies via l'interface `/superadmin`.

---

## Session enrichie

```typescript
interface SessionData {
  userId?: number;
  companyId?: number | null;  // null pour superadmin
  name?: string;
  email?: string;
  role?: 'electrician' | 'office' | 'admin' | 'superadmin';
}
```

Au login : `SELECT id, company_id, role FROM users WHERE email = ? AND company_id = ?` (ou `company_id IS NULL` pour superadmin).

---

## Middleware de sécurité — `app/lib/tenant.ts`

```typescript
export async function getTenantContext() {
  const session = await getSession();
  if (!session.userId) {
    return { error: NextResponse.json({ error: 'Non connecté' }, { status: 401 }) };
  }
  return {
    userId: session.userId,
    companyId: session.companyId ?? null,
    role: session.role as string,
  };
}

export function isSuperAdmin(ctx: TenantContext): boolean {
  return ctx.role === 'superadmin';
}

export async function requireSuperAdmin() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role !== 'superadmin') {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) };
  }
  return ctx;
}
```

### Pattern sécurisé dans chaque route API

```typescript
export async function GET() {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  // Toutes les queries filtrent par company_id
  const sites = db.prepare(
    'SELECT * FROM job_sites WHERE company_id = ? AND status = ?'
  ).all(ctx.companyId, 'active');

  return NextResponse.json(sites);
}
```

### Validation cross-tenant (protection contre manipulation d'IDs)

```typescript
// Avant toute opération sur un enregistrement par ID :
const site = db.prepare(
  'SELECT * FROM job_sites WHERE id = ? AND company_id = ?'
).get(siteId, ctx.companyId);

// Retourner 404 (pas 403) pour ne pas révéler l'existence de la ressource
if (!site) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
```

---

## Rôles par compagnie

| Rôle | company_id | Accès |
|------|-----------|-------|
| `electrician` | ≠ null | Ses propres requests uniquement |
| `office` | ≠ null | Toutes les données de sa compagnie |
| `admin` | ≠ null | Tout + gestion utilisateurs de sa compagnie |
| `superadmin` | `null` | Cross-companies + création/gestion des compagnies |

---

## Super Admin

### Compte unique seedé en DB

```typescript
// Dans initDb() — INSERT OR IGNORE pour ne créer qu'une seule fois
db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password, role, company_id)
  VALUES ('Super Admin', 'superadmin@sparky.app', ?, 'superadmin', NULL)
`).run(hashPassword('changeme'));
```

Mot de passe à changer au premier login.

### Interface `/superadmin`

- **Liste** toutes les compagnies (nom, statut, date création, nombre d'utilisateurs)
- **Créer une compagnie** : formulaire → nom de la compagnie + email admin + mot de passe admin
- **Suspendre / réactiver** une compagnie (`subscription_status`)

### APIs superadmin

```
GET  /api/superadmin/companies        → liste toutes les compagnies
POST /api/superadmin/companies        → créer compagnie + admin principal
PATCH /api/superadmin/companies/[id]  → modifier statut (suspend/activate)
```

### Création d'une compagnie (transaction atomique)

1. `INSERT INTO companies` → récupère `companyId`
2. `INSERT INTO company_settings` avec `company_id` (valeurs par défaut)
3. Seed des catégories fournisseurs (Lumen, Canac, HD, Guillevin) pour `company_id`
4. `INSERT INTO users` avec `role='admin'`, `company_id` → admin principal créé
5. Retourner le tout en JSON

---

## Login multi-tenant

L'utilisateur saisit email + mot de passe. Le login cherche d'abord le superadmin (`company_id IS NULL`), puis cherche par email dans toutes les compagnies actives. Si plusieurs compagnies ont le même email (rare mais possible), on prend la première compagnie active.

> Note : comme email est unique par compagnie, pas de conflit au sein d'une même compagnie. Si l'email existe dans deux compagnies différentes, la première compagnie active trouvée est utilisée. Acceptable pour v1.

---

## company_settings par compagnie

La table `company_settings` passe de singleton (`id=1`) à une ligne par compagnie :

```sql
CREATE TABLE company_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  supplier_preference TEXT DEFAULT 'cheapest',
  lumen_rep_email TEXT,
  large_order_threshold REAL DEFAULT 2000,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Toutes les queries `WHERE id = 1` deviennent `WHERE company_id = ?`.

---

## Scalabilité

- Index sur `company_id` dans toutes les tables → queries O(log n) peu importe le nombre de compagnies
- SQLite supporte facilement des centaines de compagnies avec ce pattern
- `subscription_status` prêt pour un futur système de facturation SaaS

---

## Ce qui ne change pas

- `products` — catalogue global partagé (Lumen, Canac, HD, Guillevin)
- Playwright / supplier automation — inchangé, juste scopé par compagnie
- Frontend UI — aucun sélecteur de compagnie visible pour les utilisateurs normaux
- NavBar, composants React — inchangés sauf pour ajouter route `/superadmin`
