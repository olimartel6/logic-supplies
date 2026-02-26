'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

interface User { name: string; role: string; inventoryEnabled?: boolean; }
interface JobSite { id: number; name: string; address: string; }
interface Product {
  name: string;
  sku: string;
  image_url: string;
  price: number | null;
  unit: string;
  category: string;
  supplier: string;
}
interface CartItem {
  product: Product;
  quantity: number;
  unit: string;
}

function supplierBadge(supplier: string) {
  if (supplier === 'canac') return { label: 'Canac', cls: 'bg-green-100 text-green-700' };
  if (supplier === 'homedepot') return { label: 'Home Depot', cls: 'bg-orange-100 text-orange-700' };
  if (supplier === 'guillevin') return { label: 'Guillevin', cls: 'bg-purple-100 text-purple-700' };
  return { label: 'Lumen', cls: 'bg-blue-100 text-blue-700' };
}

function supplierColor(supplier: string) {
  if (supplier === 'canac') return 'border-green-200 bg-green-50';
  if (supplier === 'homedepot') return 'border-orange-200 bg-orange-50';
  return 'border-blue-200 bg-blue-50';
}

export default function NewRequestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [jobSites, setJobSites] = useState<JobSite[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState('1');
  const [pendingUnit, setPendingUnit] = useState('units');

  // Shared order fields
  const [jobSiteId, setJobSiteId] = useState('');
  const [urgency, setUrgency] = useState(false);
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [success, setSuccess] = useState(false);
  const [preference, setPreference] = useState<'cheapest' | 'fastest'>('cheapest');
  const [cheaperModal, setCheaperModal] = useState<{ selected: Product; cheaper: Product } | null>(null);
  const [nearestBranch, setNearestBranch] = useState<{ name: string; address: string; distanceKm?: number } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>(['lumen', 'canac', 'homedepot', 'guillevin']);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role !== 'electrician') { router.push('/approvals'); return; }
      setUser(u);
    });
    fetch('/api/job-sites').then(r => r.json()).then(setJobSites);
    fetch('/api/supplier/preference').then(r => r.json()).then((d: { preference: 'cheapest' | 'fastest' }) => {
      if (d?.preference) setPreference(d.preference);
    });
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback(async (q: string, siteId?: string) => {
    if (q.trim().length < 2) { setResults([]); setHasSearched(false); return; }
    setSearching(true);
    setHasSearched(true);
    try {
      const siteParam = siteId ? `&job_site_id=${siteId}` : '';
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=24${siteParam}`);
      setResults(await res.json());
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(val, jobSiteId || undefined), 300);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    doSearch(query, jobSiteId || undefined);
  }

  function fetchNearestBranch(supplier: string, siteId: string) {
    if (!supplier) return;
    const siteParam = siteId ? `&job_site_id=${siteId}` : '';
    fetch(`/api/nearest-branch?supplier=${encodeURIComponent(supplier)}${siteParam}`)
      .then(r => r.json())
      .then(data => setNearestBranch(data))
      .catch(() => setNearestBranch(null));
  }

  function handleJobSiteChange(id: string) {
    setJobSiteId(id);
    if (query.trim().length >= 2) {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      doSearch(query, id || undefined);
    }
    if (pendingProduct) fetchNearestBranch(pendingProduct.supplier, id);
  }

  function pickProduct(p: Product) {
    setPendingProduct(p);
    const unitMap: Record<string, string> = { feet: 'feet', m: 'other', units: 'units' };
    setPendingUnit(unitMap[p.unit] || 'units');
    setPendingQty('1');
    setResults([]);
    setHasSearched(false);
    setNearestBranch(null);
    fetchNearestBranch(p.supplier, jobSiteId);

    if (p.price != null) {
      const keywords = p.name.split(' ').slice(0, 4).join(' ');
      fetch(`/api/products?q=${encodeURIComponent(keywords)}&limit=24`)
        .then(r => r.json())
        .then((all: Product[]) => {
          const cheaper = all
            .filter(s => s.supplier !== p.supplier && s.price != null && s.price < p.price!)
            .sort((a, b) => a.price! - b.price!)[0];
          if (cheaper) setCheaperModal({ selected: p, cheaper });
        })
        .catch(() => {});
    }
  }

  function addToCart() {
    if (!pendingProduct) return;
    setCart(c => [...c, { product: pendingProduct, quantity: parseInt(pendingQty) || 1, unit: pendingUnit }]);
    setPendingProduct(null);
    setNearestBranch(null);
    setQuery('');
  }

  function removeFromCart(index: number) {
    setCart(c => c.filter((_, i) => i !== index));
  }

  function confirmCheaper() {
    if (!cheaperModal) return;
    const p = cheaperModal.cheaper;
    setPendingProduct(p);
    const unitMap: Record<string, string> = { feet: 'feet', m: 'other', units: 'units' };
    setPendingUnit(unitMap[p.unit] || 'units');
    setCheaperModal(null);
    fetchNearestBranch(p.supplier, jobSiteId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setLoading(true);
    let count = 0;
    for (const item of cart) {
      try {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: item.product.name,
            quantity: item.quantity,
            unit: item.unit,
            job_site_id: jobSiteId,
            urgency,
            note,
            supplier: item.product.supplier,
          }),
        });
        if (res.ok) count++;
      } catch {}
    }
    setLoading(false);
    if (count > 0) {
      setSuccessCount(count);
      setSuccess(true);
      setCart([]);
      setTimeout(() => router.push('/my-requests'), 2000);
    }
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  if (success) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-green-500">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {successCount} demande{successCount > 1 ? 's' : ''} envoyée{successCount > 1 ? 's' : ''} !
        </h2>
        <p className="text-gray-500 mt-2">Le bureau va recevoir une notification.</p>
      </div>
    </div>
  );

  const filteredResults = results.filter(p => selectedSuppliers.includes(p.supplier));
  const activeFilterCount = selectedSuppliers.length < 4 ? 4 - selectedSuppliers.length : 0;

  const pendingBadge = pendingProduct ? supplierBadge(pendingProduct.supplier) : null;
  const pendingTotal = pendingProduct?.price != null && parseInt(pendingQty) > 0
    ? pendingProduct.price * (parseInt(pendingQty) || 1) : null;
  const cartTotal = cart.length > 0 && cart.every(i => i.product.price != null)
    ? cart.reduce((sum, i) => sum + (i.product.price! * i.quantity), 0) : null;

  return (
    <div className="pb-24">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} />

      {/* Sticky search bar */}
      <div className="bg-slate-800 px-4 pt-3 pb-3 sticky top-[56px] z-10 shadow-md">
        <div className="max-w-lg mx-auto space-y-2">
          {/* Chantier */}
          {jobSites.length > 0 && (
            <select
              value={jobSiteId}
              onChange={e => handleJobSiteChange(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm bg-slate-700 text-white border border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="">Sélectionner un chantier</option>
              {jobSites.map(s => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
            </select>
          )}
          <form onSubmit={handleSearch} className="flex gap-2">
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
          {query.length >= 2 && !pendingProduct && (
            <p className="text-center text-xs text-slate-400">
              {preference === 'cheapest'
                ? 'Trié par prix — le moins cher en premier'
                : jobSiteId
                  ? 'Trié par succursale la plus proche du chantier'
                  : 'Sélectionnez un chantier pour trier par proximité'}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ─── Produit en cours de configuration ─── */}
        {pendingProduct && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <div className="w-20 h-20 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
                {pendingProduct.image_url ? (
                  <img src={pendingProduct.image_url} alt="" className="w-full h-full object-contain p-1" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-10 h-10 text-gray-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-snug mb-1.5">{pendingProduct.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pendingBadge!.cls}`}>{pendingBadge!.label}</span>
                {pendingProduct.price != null && (
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {pendingProduct.price.toFixed(2)} $
                    {pendingProduct.unit !== 'units' && (
                      <span className="text-xs font-normal text-gray-400 ml-1">/{pendingProduct.unit}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            {nearestBranch && (
              <div className="px-4 pb-3 flex items-start gap-2 border-t border-gray-100 pt-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <div className="text-xs text-gray-600 leading-snug">
                  <span className="font-medium text-gray-800">{nearestBranch.name}</span>
                  <span className="mx-1 text-gray-400">—</span>
                  {nearestBranch.address}
                  {nearestBranch.distanceKm != null && (
                    <span className="ml-1.5 text-gray-400">({nearestBranch.distanceKm.toFixed(1)} km)</span>
                  )}
                </div>
              </div>
            )}
            <div className="px-4 pb-4 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={pendingQty}
                    onChange={e => setPendingQty(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unité</label>
                  <select
                    value={pendingUnit}
                    onChange={e => setPendingUnit(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="units">unités</option>
                    <option value="boxes">boîtes</option>
                    <option value="rolls">rouleaux</option>
                    <option value="feet">pieds</option>
                    <option value="other">autre</option>
                  </select>
                </div>
              </div>
              {pendingTotal != null && (
                <p className="text-xs text-gray-500">
                  Sous-total estimé : <span className="font-bold text-gray-800">{pendingTotal.toFixed(2)} $</span>
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPendingProduct(null); setNearestBranch(null); }}
                  className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition font-medium"
                >
                  ← Annuler
                </button>
                <button
                  type="button"
                  onClick={addToCart}
                  className="flex-[2] bg-yellow-400 text-slate-900 py-2.5 rounded-xl text-sm font-bold hover:bg-yellow-300 transition flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                  </svg>
                  Ajouter au panier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Panier ─── */}
        {cart.length > 0 && !pendingProduct && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                </svg>
                Panier ({cart.length} article{cart.length > 1 ? 's' : ''})
              </h2>
              {cartTotal != null && (
                <span className="text-sm font-bold text-blue-700">{cartTotal.toFixed(2)} $</span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {cart.map((item, i) => {
                const b = supplierBadge(item.product.supplier);
                const lineTotal = item.product.price != null ? item.product.price * item.quantity : null;
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
                      {item.product.image_url ? (
                        <img src={item.product.image_url} alt="" className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 text-gray-300">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 leading-snug truncate">{item.product.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
                        <span className="text-xs text-gray-500">{item.quantity} {item.unit}</span>
                        {lineTotal != null && (
                          <span className="text-xs font-semibold text-gray-700 ml-auto">{lineTotal.toFixed(2)} $</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(i)}
                      className="text-gray-400 hover:text-red-500 transition flex-shrink-0 ml-1 p-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Formulaire de commande (visible si panier non vide et pas en mode ajout) ─── */}
        {cart.length > 0 && !pendingProduct && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chantier *</label>
                <select
                  value={jobSiteId}
                  onChange={e => handleJobSiteChange(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner un chantier</option>
                  {jobSites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optionnel)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ex: Besoin pour demain matin"
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={urgency}
                  onChange={e => setUrgency(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <span className="font-medium text-red-600 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                  </svg>
                  Urgent
                </span>
              </label>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 text-slate-900 py-4 rounded-2xl font-bold text-lg hover:bg-yellow-300 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? 'Envoi en cours...' : `Envoyer ${cart.length} demande${cart.length > 1 ? 's' : ''}`}
            </button>
          </form>
        )}

        {/* ─── Résultats de recherche (masqués quand un produit est en cours de config) ─── */}
        {!pendingProduct && (
          <>
            {searching && (
              <div className="text-center py-16 text-gray-400">
                <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Recherche en cours...</p>
              </div>
            )}

            {!searching && hasSearched && results.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="flex justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-12 h-12 text-gray-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </div>
                <p className="font-medium text-gray-600">Aucun produit trouvé</p>
                <p className="text-sm mt-1">pour &laquo; {query} &raquo;</p>
                <p className="text-xs mt-3 text-gray-400">Essayez d&apos;autres mots-clés ou importez les catalogues dans les paramètres</p>
              </div>
            )}

            {!searching && !hasSearched && cart.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="flex justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-12 h-12 text-gray-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </div>
                <p className="font-semibold text-gray-600 text-base mb-1">Recherchez du matériel</p>
                <p className="text-sm">Fil, conduit, boîte de jonction, disjoncteur...</p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                  {['Fil 12/2', 'Conduit EMT', 'Disjoncteur', 'Boîte jonction'].map(kw => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => { setQuery(kw); doSearch(kw); }}
                      className="bg-slate-100 hover:bg-yellow-100 text-slate-600 text-xs px-3 py-1.5 rounded-full transition"
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!searching && results.length > 0 && (
              <>
                <p className="text-xs text-gray-500 mb-3 font-medium">
                  {results.length} résultat{results.length > 1 ? 's' : ''} pour &laquo; {query} &raquo;
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {results.map((p, i) => {
                    const b = supplierBadge(p.supplier);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-yellow-300 active:scale-[0.98] transition-all flex flex-col"
                      >
                        <div className="w-full bg-gray-50 flex items-center justify-center p-3" style={{ aspectRatio: '1' }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-full h-full object-contain" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-10 h-10 text-gray-300">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                          )}
                        </div>
                        <div className="p-3 flex flex-col flex-1 gap-1.5">
                          <p className="text-xs text-gray-800 font-medium leading-snug" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                            {p.name}
                          </p>
                          <span className={`self-start text-xs px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>
                            {b.label}
                          </span>
                          {p.price != null ? (
                            <div className="mt-auto pt-1">
                              <p className="text-base font-bold text-gray-900 leading-none">{p.price.toFixed(2)} $</p>
                              {p.unit !== 'units' && <p className="text-xs text-gray-400 mt-0.5">/{p.unit}</p>}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic mt-auto pt-1">Prix sur demande</p>
                          )}
                        </div>
                        <div className="px-3 pb-3">
                          <div className="w-full bg-yellow-400 text-slate-900 py-2 rounded-xl text-xs font-bold text-center">
                            Choisir
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Cheaper alternative modal */}
      {cheaperModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-green-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
                <h2 className="text-base font-bold text-gray-900">Option moins chère disponible</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4">Un autre fournisseur propose un produit similaire à meilleur prix.</p>

              <div className={`rounded-2xl border p-4 mb-3 ${supplierColor(cheaperModal.selected.supplier)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Votre choix</p>
                    <p className="text-sm font-medium text-gray-900 leading-tight">{cheaperModal.selected.name}</p>
                    <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${supplierBadge(cheaperModal.selected.supplier).cls}`}>
                      {supplierBadge(cheaperModal.selected.supplier).label}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-gray-900">{cheaperModal.selected.price!.toFixed(2)} $</p>
                    <p className="text-xs text-gray-400">/{cheaperModal.selected.unit}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-4 mb-5 relative">
                <span className="absolute -top-2.5 left-4 bg-green-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  Économie {(cheaperModal.selected.price! - cheaperModal.cheaper.price!).toFixed(2)} $
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Moins cher</p>
                    <p className="text-sm font-medium text-gray-900 leading-tight">{cheaperModal.cheaper.name}</p>
                    <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${supplierBadge(cheaperModal.cheaper.supplier).cls}`}>
                      {supplierBadge(cheaperModal.cheaper.supplier).label}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-green-700">{cheaperModal.cheaper.price!.toFixed(2)} $</p>
                    <p className="text-xs text-gray-400">/{cheaperModal.cheaper.unit}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button onClick={confirmCheaper} className="w-full bg-green-600 text-white py-3 rounded-2xl font-semibold hover:bg-green-700 transition">
                  Choisir le moins cher
                </button>
                <button onClick={() => setCheaperModal(null)} className="w-full border border-gray-300 text-gray-700 py-3 rounded-2xl font-medium hover:bg-gray-50 transition text-sm">
                  Garder mon choix ({cheaperModal.selected.price!.toFixed(2)} $)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
