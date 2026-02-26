# Design: Import catalogue fournisseurs depuis le super admin

**Date:** 2026-02-26
**Feature:** Section "Catalogues fournisseurs" dans `/superadmin`

## Contexte

La table `products` est globale (pas de `company_id`) — un seul import met à jour le catalogue pour toutes les compagnies. Actuellement, l'import est déclenché par compagnie via `/api/supplier/import`. Le super admin a besoin de pouvoir importer tous les fournisseurs d'un seul endroit, avec ses propres credentials.

## Base de données

Réutilise les tables existantes avec `company_id = 0` comme sentinelle "super admin" :

- `supplier_accounts WHERE company_id = 0` — credentials super admin par fournisseur
- `supplier_categories WHERE company_id = 0` — catégories seeded automatiquement (toutes enabled) lors du premier POST account

Aucune nouvelle table. Les credentials sont chiffrés comme les autres via `encrypt()`.

## API

- `GET /api/superadmin/catalog/account?supplier=X` — lire le compte super admin d'un fournisseur
- `POST /api/superadmin/catalog/account` — sauvegarder credentials + seed catégories si première fois
- `GET /api/superadmin/catalog/import?supplier=X` — stats (count, lastSync) sans importer
- `POST /api/superadmin/catalog/import?supplier=X` — SSE stream, importe un fournisseur (company_id=0)
- `POST /api/superadmin/catalog/import-all` — SSE stream, importe les 4 fournisseurs en séquence

Tous les endpoints vérifient le rôle superadmin.

## UI

Nouvelle section "Catalogues fournisseurs" dans `app/superadmin/page.tsx`, en bas du dashboard.

**Layout :**
- Bouton "Importer tous les catalogues" en haut de section
- 4 cartes fournisseur (Lumen, Canac, Home Depot, Guillevin) en grille 2×2 (mobile) / 4×1 (desktop)

**Chaque carte :**
- Nom fournisseur + badge couleur
- Nombre de produits + date dernier sync (ou "Non configuré" si pas de credentials)
- Bouton "Configurer" → inline form username/password (toggle)
- Bouton "Importer" (désactivé si non configuré)

**Progress (import en cours) :**
- Barre de progression avec texte "Lumen — Fils et câbles (45%)"
- Affichée sous les cartes pendant un import individuel ou global

## Fichiers à modifier/créer

- Créer: `app/app/api/superadmin/catalog/account/route.ts`
- Créer: `app/app/api/superadmin/catalog/import/route.ts`
- Créer: `app/app/api/superadmin/catalog/import-all/route.ts`
- Modifier: `app/app/superadmin/page.tsx` (ajouter la section catalogues)
