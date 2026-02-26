# Design: Favoris de produits pour les électriciens

**Date:** 2026-02-26
**Feature:** Onglet Favoris dans `/new-request`

## Contexte

Les électriciens sur les chantiers perdent du temps à chercher les mêmes produits à chaque commande. On ajoute un système de favoris par électricien pour accéder rapidement aux produits fréquents.

## UI

- Deux onglets en haut de `/new-request` : **"⭐ Favoris"** (actif par défaut) et **"🔍 Rechercher"**
- Dans les résultats de recherche : étoile sur chaque carte produit (pleine = favori, vide = non)
- Tap étoile → toggle favori instantané
- Onglet Favoris : liste des produits favoris, même grille que les résultats de recherche
- Tap sur un favori → même flow normal (quantité, unité, ajouter au panier)
- Si aucun favori : message "Ajoutez des produits en favoris depuis la recherche"

## Base de données

Nouvelle table :
```sql
CREATE TABLE product_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  supplier TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  price REAL,
  unit TEXT,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, supplier, sku),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

## API

- `GET /api/favorites` — retourne les favoris de l'utilisateur connecté
- `POST /api/favorites` — ajoute un produit en favori (body: {supplier, sku, name, image_url, price, unit, category})
- `DELETE /api/favorites` — retire un favori (body: {supplier, sku})

## Fichiers à modifier/créer

- Créer: `app/app/api/favorites/route.ts`
- Modifier: `app/app/new-request/page.tsx`
- Modifier: `app/lib/db.ts` (migration table product_favorites)
