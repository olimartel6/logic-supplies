# Filtre fournisseur — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un bouton "Filtrer" avec dropdown de cases à cocher pour filtrer les résultats de recherche par fournisseur dans `/new-request`.

**Architecture:** Filtre 100% côté client — on ajoute un state `selectedSuppliers` et on calcule `filteredResults` à partir de `results`. Le bouton Filtrer ouvre un dropdown avec 4 checkboxes (Lumen, Canac, Home Depot, Guillevin). Se ferme en cliquant à l'extérieur.

**Tech Stack:** React state + useRef + useEffect (click-outside), Tailwind CSS, TypeScript

---

### Task 1: Ajouter les states et la logique de filtrage

**Files:**
- Modify: `app/app/new-request/page.tsx:36-62`

**Step 1: Ajouter les imports manquants**

Ligne 2, `useRef` est déjà importé. Vérifier que `useRef` est bien dans les imports. Si non, l'ajouter.

**Step 2: Ajouter les nouveaux states après ligne 61 (après `searchTimeout`)**

```typescript
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>(['lumen', 'canac', 'homedepot', 'guillevin']);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
```

**Step 3: Ajouter le useEffect pour fermer le dropdown au clic extérieur**

Ajouter après l'existing `useEffect` (après ligne 77) :

```typescript
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
```

**Step 4: Calculer filteredResults**

Ajouter juste avant le `return (` (avant ligne 227) :

```typescript
  const filteredResults = results.filter(p => selectedSuppliers.includes(p.supplier));
  const activeFilterCount = selectedSuppliers.length < 4 ? 4 - selectedSuppliers.length : 0;
```

Note: `activeFilterCount` = nombre de fournisseurs désactivés (pour le badge sur le bouton)

**Step 5: Commit**

```bash
git add app/app/new-request/page.tsx
git commit -m "feat: add supplier filter state and filteredResults logic"
```

---

### Task 2: Ajouter le bouton Filtrer et le dropdown dans l'UI

**Files:**
- Modify: `app/app/new-request/page.tsx:245-260`

**Step 1: Remplacer la form de recherche avec le bouton filtrer**

Trouver ce bloc (ligne ~245) :
```tsx
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              ...
            />
            <button
              type="submit"
              className="bg-yellow-400 text-slate-900 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-yellow-300 transition flex-shrink-0"
            >
              Chercher
            </button>
          </form>
```

Remplacer par :
```tsx
          <div className="flex gap-2">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="Rechercher du matériel électrique..."
                autoComplete="off"
                className="flex-1 rounded-xl pl-4 pr-4 py-2.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                type="submit"
                className="bg-yellow-400 text-slate-900 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-yellow-300 transition flex-shrink-0"
              >
                Chercher
              </button>
            </form>

            {/* Bouton Filtrer */}
            <div ref={filterRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setFilterOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition flex-shrink-0 ${
                  activeFilterCount > 0
                    ? 'bg-yellow-400 text-slate-900'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
                </svg>
                Filtrer
                {activeFilterCount > 0 && (
                  <span className="bg-slate-900 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 p-3 min-w-[160px] z-20">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fournisseurs</p>
                  {[
                    { key: 'lumen', label: 'Lumen', cls: 'text-blue-600' },
                    { key: 'canac', label: 'Canac', cls: 'text-green-600' },
                    { key: 'homedepot', label: 'Home Depot', cls: 'text-orange-600' },
                    { key: 'guillevin', label: 'Guillevin', cls: 'text-purple-600' },
                  ].map(s => (
                    <label key={s.key} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded-lg px-1">
                      <input
                        type="checkbox"
                        checked={selectedSuppliers.includes(s.key)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedSuppliers(prev => [...prev, s.key]);
                          } else {
                            setSelectedSuppliers(prev => prev.filter(x => x !== s.key));
                          }
                        }}
                        className="w-4 h-4 rounded accent-yellow-400"
                      />
                      <span className={`text-sm font-medium ${s.cls}`}>{s.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
```

**Step 2: Commit**

```bash
git add app/app/new-request/page.tsx
git commit -m "feat: add supplier filter dropdown button UI"
```

---

### Task 3: Appliquer le filtre aux résultats affichés

**Files:**
- Modify: `app/app/new-request/page.tsx:527-560`

**Step 1: Remplacer `results` par `filteredResults` dans la section résultats**

Trouver (ligne ~527) :
```tsx
            {!searching && results.length > 0 && (
              <>
                <p className="text-xs text-gray-500 mb-3 font-medium">
                  {results.length} résultat{results.length > 1 ? 's' : ''} pour &laquo; {query} &raquo;
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {results.map((p, i) => {
```

Remplacer par :
```tsx
            {!searching && results.length > 0 && (
              <>
                {selectedSuppliers.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="font-medium text-gray-600">Aucun fournisseur sélectionné</p>
                    <p className="text-sm mt-1">Activez au moins un fournisseur dans les filtres</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3 font-medium">
                      {filteredResults.length} résultat{filteredResults.length > 1 ? 's' : ''} pour &laquo; {query} &raquo;
                      {activeFilterCount > 0 && <span className="ml-1 text-yellow-600">({activeFilterCount} fournisseur{activeFilterCount > 1 ? 's' : ''} masqué{activeFilterCount > 1 ? 's' : ''})</span>}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {filteredResults.map((p, i) => {
```

**Step 2: Fermer les balises correctement**

Après la fermeture `</div>` de la grid et le `})}`des résultats, ajouter `</>` et `)}` pour fermer le ternaire. La structure finale doit être :

```tsx
                    </div>
                  </>
                )}
              </>
            )}
```

**Step 3: Tester manuellement**
- Ouvrir http://localhost:3000/new-request
- Chercher "fil"
- Cliquer "Filtrer" → décocher "Canac" → vérifier que les produits Canac disparaissent
- Le badge "1" doit apparaître sur le bouton Filtrer
- Décocher tout → message "Aucun fournisseur sélectionné"
- Cliquer hors du dropdown → il se ferme

**Step 4: Commit**

```bash
git add app/app/new-request/page.tsx
git commit -m "feat: apply supplier filter to search results display"
```
