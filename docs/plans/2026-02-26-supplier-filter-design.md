# Design: Filtre par fournisseur dans la recherche de produits

**Date:** 2026-02-26
**Feature:** Filtre fournisseur dans `/new-request`

## Contexte

La page `/new-request/page.tsx` permet aux électriciens de chercher des produits parmi 4 fournisseurs (Lumen, Canac, Home Depot, Guillevin). Actuellement, aucun filtre par fournisseur n'est disponible dans l'UI.

## Objectif

Ajouter un bouton "Filtrer" avec un dropdown de cases à cocher pour filtrer les résultats par fournisseur.

## UI

- Bouton **"Filtrer (N)"** à droite de la barre de recherche (N = nombre de fournisseurs actifs)
- Dropdown avec 4 cases à cocher : Lumen, Canac, Home Depot, Guillevin
- Se ferme en cliquant à l'extérieur
- Badge sur le bouton si filtre actif

## Comportement

- Par défaut : tous les fournisseurs cochés (tout affiché)
- Filtre **côté client** sur `results` déjà chargés — pas de nouvelle requête API
- Si tous décochés : message "Aucun fournisseur sélectionné"

## Fichiers à modifier

- `app/app/new-request/page.tsx` — ajouter state `selectedSuppliers`, bouton dropdown, et logique de filtrage sur `results`
