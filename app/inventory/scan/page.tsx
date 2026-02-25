'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-gray-900 rounded-2xl" style={{ aspectRatio: '1' }}>
      <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface User { name: string; role: string; inventoryEnabled?: boolean; }
interface FoundItem {
  id: number; barcode: string; name: string; unit: string;
  stock: Array<{ location_id: number; location_name: string; location_type: string; quantity: number; }>;
}
interface Location { id: number; name: string; type: string; }
interface SimpleItem { id: number; name: string; barcode: string; unit: string; }

type ScanState = 'scanning' | 'found' | 'not_found' | 'done';

export default function ScanPage() {
  const [user, setUser] = useState<User | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allItems, setAllItems] = useState<SimpleItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [scannerActive, setScannerActive] = useState(true);
  const [lastBarcode, setLastBarcode] = useState('');
  const [foundItem, setFoundItem] = useState<FoundItem | null>(null);
  const [action, setAction] = useState<'entry' | 'exit' | 'transfer'>('exit');
  const [quantity, setQuantity] = useState('1');
  const [toLocationId, setToLocationId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [quickLog, setQuickLog] = useState<Array<{ name: string; qty: number }>>([]);
  const [newItemForm, setNewItemForm] = useState({ name: '', unit: 'unité' });
  const [savingNew, setSavingNew] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualAddForm, setManualAddForm] = useState({ name: '', unit: 'unité' });
  const [savingManual, setSavingManual] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (!r.ok) { router.push('/'); return; } return r.json(); })
      .then(u => { if (u) setUser(u); });
    Promise.all([
      fetch('/api/inventory/locations').then(r => r.json()),
      fetch('/api/inventory/items').then(r => r.json()),
    ]).then(([locs, items]) => {
      setLocations(locs);
      setAllItems(items);
      if (locs.length > 0) setSelectedLocation(locs[0].id);
    });
  }, [router]);

  const lookupBarcode = useCallback(async (barcode: string, isQuick: boolean) => {
    const res = await fetch(`/api/inventory/items/${encodeURIComponent(barcode)}`);
    const data = await res.json();

    if (!data.found) {
      if (isQuick) {
        setScanState('not_found');
        setTimeout(() => { setScanState('scanning'); setScannerActive(true); }, 2000);
        return;
      }
      setScanState('not_found');
      return;
    }

    if (isQuick && selectedLocation) {
      const r = await fetch('/api/inventory/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: data.item.id, action: 'exit', quantity: 1, location_id: selectedLocation }),
      });
      const result = await r.json();
      if (r.ok) {
        setQuickLog(prev => [...prev, { name: data.item.name, qty: 1 }]);
      } else {
        setQuickLog(prev => [...prev, { name: `⚠️ ${data.item.name} (${result.error})`, qty: 0 }]);
      }
      setScanState('scanning');
      setScannerActive(true);
      return;
    }

    setFoundItem(data.item);
    setScanState('found');
  }, [selectedLocation]);

  const handleScan = useCallback(async (barcode: string) => {
    if (!scannerActive) return;
    setScannerActive(false);
    setLastBarcode(barcode);
    await lookupBarcode(barcode, quickMode);
  }, [scannerActive, quickMode, lookupBarcode]);

  async function handleConfirm() {
    if (!foundItem || !selectedLocation) return;
    setSubmitting(true);
    setSubmitError(null);
    const qty = parseFloat(quantity) || 1;
    const body: Record<string, unknown> = { item_id: foundItem.id, action, quantity: qty };
    if (action === 'transfer') {
      body.from_location_id = selectedLocation;
      body.to_location_id = toLocationId;
    } else {
      body.location_id = selectedLocation;
    }
    const res = await fetch('/api/inventory/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setSubmitError(d.error || 'Erreur');
      setSubmitting(false);
      return;
    }
    setScanState('done');
    setSubmitting(false);
    setTimeout(() => {
      setFoundItem(null);
      setQuantity('1');
      setSubmitError(null);
      setScanState('scanning');
      setScannerActive(true);
    }, 1500);
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setSavingNew(true);
    await fetch('/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: lastBarcode, ...newItemForm }),
    });
    setSavingNew(false);
    setNewItemForm({ name: '', unit: 'unité' });
    await lookupBarcode(lastBarcode, false);
  }

  async function handleManualCreate(e: React.FormEvent) {
    e.preventDefault();
    setSavingManual(true);
    const res = await fetch('/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manualAddForm),
    });
    const data = await res.json();
    setSavingManual(false);
    setManualAddForm({ name: '', unit: 'unité' });
    setShowManualAdd(false);
    setAllItems(prev => [...prev, { id: data.id, name: manualAddForm.name, barcode: data.barcode, unit: manualAddForm.unit }]);
    await lookupBarcode(data.barcode, false);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  return (
    <div className="pb-24">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} />
      <div className="max-w-lg mx-auto px-4 py-4">

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/inventory')} className="text-gray-500 hover:text-gray-800 text-sm font-medium">← Retour</button>
            <h1 className="text-lg font-bold text-gray-900">Scanner</h1>
          </div>
          <button
            onClick={() => { setQuickMode(q => !q); setScanState('scanning'); setScannerActive(true); setQuickLog([]); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${quickMode ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-200 text-gray-600'}`}
          >
            {quickMode ? '⚡ Mode rapide ON' : 'Mode rapide'}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Emplacement actuel</label>
          <select
            value={selectedLocation ?? ''}
            onChange={e => setSelectedLocation(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="" disabled>Sélectionner un emplacement</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {quickMode && quickLog.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 mb-4">
            <p className="text-xs font-bold text-yellow-800 mb-2">Sorties enregistrées</p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {quickLog.slice().reverse().map((l, i) => (
                <div key={i} className="flex justify-between text-xs text-yellow-700">
                  <span className="truncate">{l.name}</span>
                  {l.qty > 0 && <span className="font-semibold ml-2 shrink-0">-{l.qty}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(scanState === 'scanning' || (scanState === 'not_found' && quickMode)) && (
          <>
            <BarcodeScanner onScan={handleScan} active={scannerActive} />
            {scanState === 'not_found' && quickMode && (
              <p className="text-center text-orange-600 text-sm font-medium mt-3">Produit non reconnu — Rescannez</p>
            )}
            {!quickMode && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 text-center mb-2">Ou chercher manuellement</p>
                <input
                  type="search"
                  placeholder="Nom ou code-barres..."
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                {manualSearch.length > 1 && (
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {allItems.filter(i =>
                      i.name.toLowerCase().includes(manualSearch.toLowerCase()) || i.barcode.includes(manualSearch)
                    ).slice(0, 8).map(i => (
                      <button
                        key={i.id}
                        onClick={async () => {
                          setScannerActive(false);
                          setLastBarcode(i.barcode);
                          setManualSearch('');
                          await lookupBarcode(i.barcode, false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition"
                      >
                        {i.name}
                        <span className="text-xs text-gray-400 ml-2 font-mono">{i.barcode}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!showManualAdd && (
                  <button
                    onClick={() => setShowManualAdd(true)}
                    className="mt-3 w-full border border-dashed border-gray-300 text-gray-500 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
                  >
                    + Créer un article sans code-barres
                  </button>
                )}
                {showManualAdd && (
                  <form onSubmit={handleManualCreate} className="mt-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-800">Nouvel article sans code-barres</p>
                    <input type="text" required placeholder="Nom de l'article *" value={manualAddForm.name}
                      onChange={e => setManualAddForm({ ...manualAddForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="Unité (ex: boîte, m, pcs)" value={manualAddForm.unit}
                      onChange={e => setManualAddForm({ ...manualAddForm, unit: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowManualAdd(false)}
                        className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Annuler</button>
                      <button type="submit" disabled={savingManual}
                        className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                        {savingManual ? 'Création...' : 'Créer et enregistrer'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {scanState === 'not_found' && !quickMode && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <p className="font-semibold text-orange-900 mb-1">Produit non reconnu</p>
            <p className="text-sm text-orange-700 font-mono mb-4">{lastBarcode}</p>
            <form onSubmit={handleCreateItem} className="space-y-3 mb-4">
              <p className="text-sm font-medium text-gray-700">Créer un nouvel article</p>
              <input type="text" required placeholder="Nom de l'article *" value={newItemForm.name}
                onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <input type="text" placeholder="Unité (ex: boîte, m, pcs)" value={newItemForm.unit}
                onChange={e => setNewItemForm({ ...newItemForm, unit: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setScanState('scanning'); setScannerActive(true); }}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Rescanner
                </button>
                <button type="submit" disabled={savingNew}
                  className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                  {savingNew ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
            <div className="border-t border-orange-200 pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Ou associer à un article existant</p>
              <input type="search" placeholder="Rechercher..." value={manualSearch}
                onChange={e => setManualSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
              {manualSearch.length > 1 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allItems.filter(i => i.name.toLowerCase().includes(manualSearch.toLowerCase())).slice(0, 6).map(i => (
                    <button key={i.id}
                      onClick={async () => {
                        await fetch(`/api/inventory/items/${i.id}/associate`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ barcode: lastBarcode }),
                        });
                        setManualSearch('');
                        await lookupBarcode(lastBarcode, false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition">
                      {i.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {scanState === 'found' && foundItem && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">{foundItem.name}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{lastBarcode}</p>
              </div>
              <button onClick={() => { setScanState('scanning'); setScannerActive(true); setFoundItem(null); }}
                className="text-gray-400 text-2xl leading-none ml-3">×</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {foundItem.stock.filter(s => s.quantity > 0).map(s => (
                <span key={s.location_id} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                  {s.location_name}: {s.quantity} {foundItem.unit}
                </span>
              ))}
              {foundItem.stock.every(s => s.quantity === 0) && (
                <span className="text-xs text-gray-400 italic">Aucun stock enregistré</span>
              )}
            </div>
            <div className="flex gap-2 mb-4">
              {(['entry', 'exit', 'transfer'] as const).map(a => (
                <button key={a} onClick={() => setAction(a)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition ${action === a
                    ? a === 'entry' ? 'border-green-500 bg-green-50 text-green-700'
                      : a === 'exit' ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {a === 'entry' ? 'Entrée' : a === 'exit' ? 'Sortie' : 'Transfert'}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Quantité</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setQuantity(q => String(Math.max(1, Number(q) - 1)))}
                  className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 text-xl font-bold flex items-center justify-center hover:bg-gray-200 transition">−</button>
                <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
                  className="flex-1 text-center text-2xl font-bold border border-gray-300 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => setQuantity(q => String(Number(q) + 1))}
                  className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 text-xl font-bold flex items-center justify-center hover:bg-gray-200 transition">+</button>
              </div>
            </div>
            {action === 'transfer' && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Destination</label>
                <select value={toLocationId ?? ''} onChange={e => setToLocationId(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="" disabled>Choisir une destination</option>
                  {locations.filter(l => l.id !== selectedLocation).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
            {submitError && <p className="text-red-600 text-sm mb-3">{submitError}</p>}
            <button onClick={handleConfirm}
              disabled={submitting || !selectedLocation || (action === 'transfer' && !toLocationId)}
              className={`w-full py-4 rounded-2xl text-white font-bold text-base disabled:opacity-50 transition ${
                action === 'entry' ? 'bg-green-600 hover:bg-green-700'
                : action === 'exit' ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'}`}>
              {submitting ? 'Enregistrement...'
                : action === 'entry' ? `+ ${quantity} ${foundItem.unit} — Confirmer`
                : action === 'exit' ? `− ${quantity} ${foundItem.unit} — Confirmer`
                : `Transférer ${quantity} ${foundItem.unit}`}
            </button>
          </div>
        )}

        {scanState === 'done' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="font-bold text-gray-900 text-lg">Enregistré</p>
          </div>
        )}
      </div>

      {quickMode && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-20">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => { setQuickMode(false); setQuickLog([]); router.push('/inventory'); }}
              className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold text-base shadow-xl"
            >
              Terminer ({quickLog.length} scan{quickLog.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
