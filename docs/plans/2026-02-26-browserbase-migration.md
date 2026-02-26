# BrowserBase Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer tous les `chromium.launch()` locaux par BrowserBase cloud pour que l'automatisation des fournisseurs fonctionne de façon fiable sur Railway.

**Architecture:** Créer un helper centralisé `lib/browser.ts` qui crée une session BrowserBase et retourne un browser Playwright connecté via CDP. Chaque fichier fournisseur remplace `chromium.launch(...)` par `createBrowserbaseBrowser()`. Tout le code Playwright existant (login, navigation, click) reste identique.

**Tech Stack:** `@browserbasehq/sdk`, `playwright` (déjà installé), variables d'env `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`

---

### Task 1: Installer le package et créer lib/browser.ts

**Files:**
- Modify: `app/package.json`
- Create: `app/lib/browser.ts`

**Step 1: Installer @browserbasehq/sdk**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npm install @browserbasehq/sdk
```
Attendu: package installé dans node_modules, package.json mis à jour

**Step 2: Créer lib/browser.ts**

```typescript
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright';

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY!,
});

export async function createBrowserbaseBrowser() {
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });
  return chromium.connectOverCDP(session.connectUrl);
}
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/browser.ts package.json package-lock.json && git commit -m "feat: add BrowserBase browser helper"
```

---

### Task 2: Migrer lumen.ts et lumen-catalog.ts

**Files:**
- Modify: `app/lib/lumen.ts`
- Modify: `app/lib/lumen-catalog.ts`

**Step 1: Mettre à jour lumen.ts**

Dans `lumen.ts`, trouver la ligne 1 :
```typescript
import { chromium } from 'playwright';
```
Remplacer par :
```typescript
import { createBrowserbaseBrowser } from './browser';
```

Ensuite, trouver CHAQUE occurrence de `chromium.launch(...)` dans le fichier (il y en a 4 : dans `testLumenConnection`, `placeLumenOrder`, `getLumenPrice`, `cancelLumenOrder`).

Chaque occurrence ressemble à :
```typescript
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});
```
Remplacer chacune par :
```typescript
const browser = await createBrowserbaseBrowser();
```

**Step 2: Mettre à jour lumen-catalog.ts**

Dans `lumen-catalog.ts`, ligne 1 :
```typescript
import { chromium } from 'playwright';
```
Remplacer par :
```typescript
import { createBrowserbaseBrowser } from './browser';
```

Trouver :
```typescript
const browser = await chromium.launch({ headless: true });
```
Remplacer par :
```typescript
const browser = await createBrowserbaseBrowser();
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/lumen.ts lib/lumen-catalog.ts && git commit -m "feat: migrate Lumen to BrowserBase"
```

---

### Task 3: Migrer canac.ts et canac-catalog.ts

**Files:**
- Modify: `app/lib/canac.ts`
- Modify: `app/lib/canac-catalog.ts`

**Step 1: Mettre à jour canac.ts**

Ligne 1 de `canac.ts` :
```typescript
import { chromium } from 'playwright';
```
Remplacer par :
```typescript
import { createBrowserbaseBrowser } from './browser';
```

Trouver CHAQUE `chromium.launch(...)` (3 occurrences : `testCanacConnection`, `getCanacPrice`, `placeCanacOrder`) :
```typescript
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});
```
Remplacer chacune par :
```typescript
const browser = await createBrowserbaseBrowser();
```

**Step 2: Mettre à jour canac-catalog.ts**

Ligne 1 de `canac-catalog.ts` :
```typescript
import { chromium } from 'playwright';
```
Remplacer par :
```typescript
import { createBrowserbaseBrowser } from './browser';
```

Trouver `chromium.launch(...)` et remplacer par :
```typescript
const browser = await createBrowserbaseBrowser();
```

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/canac.ts lib/canac-catalog.ts && git commit -m "feat: migrate Canac to BrowserBase"
```

---

### Task 4: Migrer homedepot.ts et homedepot-catalog.ts

**Files:**
- Modify: `app/lib/homedepot.ts`
- Modify: `app/lib/homedepot-catalog.ts`

**Note importante:** `homedepot.ts` a une constante `CHROME_PATH` pour le chemin vers Chrome sur macOS (nécessaire pour contourner Cloudflare). Avec BrowserBase, cette constante n'est plus nécessaire — BrowserBase gère Cloudflare de son côté.

**Step 1: Mettre à jour homedepot.ts**

Ligne 1 :
```typescript
import { chromium } from 'playwright';
```
Remplacer par :
```typescript
import { createBrowserbaseBrowser } from './browser';
```

Trouver et supprimer la constante CHROME_PATH (quelque chose comme) :
```typescript
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
```
La supprimer complètement.

Trouver CHAQUE `chromium.launch(...)` (3 occurrences : `testHomeDepotConnection`, `getHomeDepotPrice`, `placeHomeDepotOrder`). Chaque occurrence ressemble à :
```typescript
const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_PATH,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
});
```
Remplacer chacune par :
```typescript
const browser = await createBrowserbaseBrowser();
```

**Step 2: Mettre à jour homedepot-catalog.ts**

Même pattern : remplacer `import { chromium }` par `import { createBrowserbaseBrowser }` et `chromium.launch(...)` par `createBrowserbaseBrowser()`.

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Si erreur sur `CHROME_PATH` utilisé ailleurs, supprimer toutes les références restantes.

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/homedepot.ts lib/homedepot-catalog.ts && git commit -m "feat: migrate Home Depot to BrowserBase, remove macOS Chrome path"
```

---

### Task 5: Migrer guillevin.ts et guillevin-catalog.ts

**Files:**
- Modify: `app/lib/guillevin.ts`
- Modify: `app/lib/guillevin-catalog.ts`

**Step 1: Mettre à jour guillevin.ts**

Ligne 1 :
```typescript
import { chromium } from 'playwright';
```
Remplacer par :
```typescript
import { createBrowserbaseBrowser } from './browser';
```

Trouver CHAQUE `chromium.launch(...)` (3 occurrences : `testGuillevinConnection`, `getGuillevinPrice`, `placeGuillevinOrder`) :
```typescript
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
});
```
Remplacer chacune par :
```typescript
const browser = await createBrowserbaseBrowser();
```

**Step 2: Mettre à jour guillevin-catalog.ts**

Même pattern.

**Step 3: Vérifier TypeScript**

```bash
cd "/Users/oli/Downloads/project sparky/app" && npx tsc --noEmit 2>&1 | head -20
```
Attendu: aucune erreur

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add lib/guillevin.ts lib/guillevin-catalog.ts && git commit -m "feat: migrate Guillevin to BrowserBase"
```

---

### Task 6: Documenter les variables d'environnement Railway

**Files:**
- Modify: `app/.env.example` (créer si n'existe pas)

**Step 1: Vérifier si .env.example existe**

```bash
ls "/Users/oli/Downloads/project sparky/app/.env"* 2>/dev/null
```

**Step 2: Ajouter les variables BrowserBase**

Dans `.env.example` (ou créer le fichier), ajouter :
```
# BrowserBase — cloud browser service pour l'automatisation des fournisseurs
# Obtenir sur https://browserbase.com/dashboard
BROWSERBASE_API_KEY=bb_live_xxxxxxxxxxxxx
BROWSERBASE_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Step 3: Vérifier que .env.example n'est PAS dans .gitignore**

```bash
cat "/Users/oli/Downloads/project sparky/app/.gitignore" 2>/dev/null | grep env
```
Le fichier `.env.example` doit être commité (c'est de la doc, pas des secrets).

**Step 4: Commit**

```bash
cd "/Users/oli/Downloads/project sparky/app" && git add .env.example && git commit -m "docs: add BrowserBase env vars to .env.example"
```

---

### Notes de déploiement Railway

Après avoir mergé, ajouter ces deux variables dans le dashboard Railway :
- `BROWSERBASE_API_KEY` → ta clé API BrowserBase
- `BROWSERBASE_PROJECT_ID` → ton Project ID BrowserBase

Ces valeurs se trouvent sur https://www.browserbase.com/overview
