'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

interface User { name: string; role: string; inventoryEnabled?: boolean; }
interface InventoryItem { id: number; barcode: string; name: string; unit: string; description: string | null; total_stock: number; }
interface StockRow { item_id: number; location_id: number; quantity: number; item_name: string; barcode: string; unit: string; location_name: string; location_type: string; }
interface Location { id: number; name: string; type: string; job_site_name: string | null; }

const locationTypeLabel: Record<string, string> = { warehouse: 'Entrepôt', truck: 'Camion', jobsite: 'Chantier' };

export default function InventoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<number | 'all'>('all');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [locationForm, setLocationForm] = useState({ name: '', type: 'warehouse' });
  const [savingLocation, setSavingLocation] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', unit: 'unité', barcode: '' });
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState('');
  const router = useRouter();

  function loadData() {
    return Promise.all([
      fetch('/api/inventory/items').then(r => r.json()),
      fetch('/api/inventory/locations').then(r => r.json()),
      fetch('/api/inventory/stock').then(r => r.json()),
    ]).then(([i, l, s]) => { setItems(i); setLocations(l); setStock(s); });
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (!r.ok) { router.push('/'); return; } return r.json(); })
      .then(u => { if (u) setUser(u); });
    loadData();
  }, [router]);

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) || i.barcode.includes(search)
  );

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setSavingItem(true);
    setItemError('');
    const res = await fetch('/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: itemForm.name, unit: itemForm.unit, barcode: itemForm.barcode || undefined }),
    });
    if (!res.ok) {
      const d = await res.json();
      setItemError(d.error || 'Erreur');
      setSavingItem(false);
      return;
    }
    await loadData();
    setShowAddItem(false);
    setItemForm({ name: '', unit: 'unité', barcode: '' });
    setSavingItem(false);
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    setSavingLocation(true);
    await fetch('/api/inventory/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locationForm),
    });
    await loadData();
    setShowAddLocation(false);
    setLocationForm({ name: '', type: 'warehouse' });
    setSavingLocation(false);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  const isManager = user.role === 'admin' || user.role === 'office';

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Inventaire</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddItem(v => !v)}
              className="border border-gray-300 text-gray-700 px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 hover:bg-gray-50 transition"
            >
              + Article
            </button>
            <button
              onClick={() => router.push('/inventory/scan')}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-blue-700 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              </svg>
              Scanner
            </button>
          </div>
        </div>

        {showAddItem && (
          <form onSubmit={handleAddItem} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Ajouter un article</p>
            <input type="text" required placeholder="Nom de l'article *" value={itemForm.name}
              onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Code-barres (optionnel)" value={itemForm.barcode}
              onChange={e => setItemForm({ ...itemForm, barcode: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Unité (ex: boîte, m, pcs)" value={itemForm.unit}
              onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {itemError && <p className="text-red-600 text-xs">{itemError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowAddItem(false); setItemError(''); }}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={savingItem}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                {savingItem ? 'Création...' : 'Ajouter'}
              </button>
            </div>
          </form>
        )}

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un article ou code-barres..."
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 bg-white"
        />

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <button
            onClick={() => setSelectedLocation('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedLocation === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
          >
            Tous
          </button>
          {locations.map(l => (
            <button
              key={l.id}
              onClick={() => setSelectedLocation(l.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedLocation === l.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
            >
              {l.name}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="flex justify-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-10 h-10 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p className="text-sm">{search ? 'Aucun article trouvé' : 'Aucun article en inventaire'}</p>
            {!search && <p className="text-xs mt-1">Scannez un code-barres ou utilisez "+ Article" pour ajouter</p>}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {filteredItems.map(item => {
            const itemStock = stock.filter(s => s.item_id === item.id);
            const displayStock = selectedLocation === 'all'
              ? item.total_stock
              : (itemStock.find(s => s.location_id === selectedLocation)?.quantity ?? 0);
            const locationBreakdown = itemStock.filter(s => s.quantity > 0);

            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{item.barcode}</p>
                  </div>
                  <div className="ml-3 text-right">
                    <p className={`text-2xl font-bold ${displayStock <= 0 ? 'text-red-500' : 'text-gray-900'}`}>
                      {displayStock}
                    </p>
                    <p className="text-xs text-gray-400">{item.unit}</p>
                  </div>
                </div>
                {selectedLocation === 'all' && locationBreakdown.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {locationBreakdown.map(s => (
                      <span key={s.location_id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {s.location_name}: {s.quantity}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isManager && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 text-sm">Emplacements</h2>
              <button onClick={() => setShowAddLocation(!showAddLocation)} className="text-blue-600 text-sm font-medium">
                + Ajouter
              </button>
            </div>
            {showAddLocation && (
              <form onSubmit={handleAddLocation} className="space-y-3 mb-3">
                <input
                  type="text"
                  placeholder="Nom de l'emplacement *"
                  required
                  value={locationForm.name}
                  onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={locationForm.type}
                  onChange={e => setLocationForm({ ...locationForm, type: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="warehouse">Entrepôt</option>
                  <option value="truck">Camion</option>
                  <option value="jobsite">Chantier</option>
                </select>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddLocation(false)} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Annuler</button>
                  <button type="submit" disabled={savingLocation} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                    {savingLocation ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </form>
            )}
            <div className="space-y-2">
              {locations.map(l => (
                <div key={l.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-800">{l.name}</span>
                  <span className="text-xs text-gray-400">{locationTypeLabel[l.type] || l.type}</span>
                </div>
              ))}
              {locations.length === 0 && <p className="text-xs text-gray-400">Aucun emplacement configuré</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
