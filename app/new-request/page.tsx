'use client';
import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { useLang, useT } from '@/lib/LanguageContext';
import type { Lang } from '@/lib/i18n';

interface User { name: string; role: string; inventoryEnabled?: boolean; marketingEnabled?: boolean; }
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

const ALL_SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin', 'bmr', 'westburne', 'nedco', 'futech', 'deschenes', 'jsv', 'rona'] as const;

function supplierBadge(supplier: string) {
  if (supplier === 'canac') return { label: 'Canac', cls: 'bg-green-100 text-green-700' };
  if (supplier === 'homedepot') return { label: 'Home Depot', cls: 'bg-orange-100 text-orange-700' };
  if (supplier === 'guillevin') return { label: 'Guillevin', cls: 'bg-purple-100 text-purple-700' };
  if (supplier === 'bmr') return { label: 'BMR', cls: 'bg-red-100 text-red-700' };
  if (supplier === 'westburne') return { label: 'Westburne', cls: 'bg-teal-100 text-teal-700' };
  if (supplier === 'nedco') return { label: 'Nedco', cls: 'bg-cyan-100 text-cyan-700' };
  if (supplier === 'futech') return { label: 'Futech', cls: 'bg-amber-100 text-amber-700' };
  if (supplier === 'deschenes') return { label: 'Deschênes', cls: 'bg-indigo-100 text-indigo-700' };
  if (supplier === 'jsv') return { label: 'JSV', cls: 'bg-yellow-100 text-yellow-700' };
  if (supplier === 'rona') return { label: 'Rona', cls: 'bg-sky-100 text-sky-700' };
  return { label: 'Lumen', cls: 'bg-blue-100 text-blue-700' };
}

function supplierColor(supplier: string) {
  if (supplier === 'canac') return 'border-green-200 bg-green-50';
  if (supplier === 'homedepot') return 'border-orange-200 bg-orange-50';
  if (supplier === 'bmr') return 'border-red-200 bg-red-50';
  if (supplier === 'jsv') return 'border-yellow-200 bg-yellow-50';
  if (supplier === 'westburne') return 'border-teal-200 bg-teal-50';
  if (supplier === 'nedco') return 'border-cyan-200 bg-cyan-50';
  if (supplier === 'futech') return 'border-amber-200 bg-amber-50';
  if (supplier === 'deschenes') return 'border-indigo-200 bg-indigo-50';
  if (supplier === 'rona') return 'border-sky-200 bg-sky-50';
  return 'border-blue-200 bg-blue-50';
}

export default function NewRequestPage() {
  return <Suspense><NewRequestContent /></Suspense>;
}

function NewRequestContent() {
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [success, setSuccess] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [preference, setPreference] = useState<'cheapest' | 'fastest'>('cheapest');
  const [cheaperModal, setCheaperModal] = useState<{ selected: Product; cheaper: Product } | null>(null);
  const [nearestBranch, setNearestBranch] = useState<{ name: string; address: string; distanceKm?: number } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([...ALL_SUPPLIERS]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { setLang } = useLang();
  const t = useT();

  const [activeTab, setActiveTab] = useState<'favoris' | 'recherche'>('recherche');
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [favoriteSKUs, setFavoriteSKUs] = useState<Set<string>>(new Set());

  // Templates
  const [templates, setTemplates] = useState<{ id: number; name: string; use_count: number; creator_name: string }[]>([]);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  // Price history
  const [priceHistory, setPriceHistory] = useState<{ price: number; recorded_at: string }[]>([]);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);

  // Suggestions (previously ordered products)
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites');
      if (!res.ok) return;
      const data: Product[] = await res.json();
      setFavorites(data);
      setFavoriteSKUs(new Set(data.map(p => `${p.supplier}:${p.sku}`)));
    } catch {
      setFavorites([]);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data);
    } catch {
      setTemplates([]);
    }
  }, []);

  async function saveTemplate() {
    if (cart.length === 0) return;
    const name = prompt('Nom du modèle :');
    if (!name || !name.trim()) return;
    const items = cart.map(c => ({
      product: c.product,
      quantity: c.quantity,
      unit: c.unit,
    }));
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), items }),
    });
    if (res.ok) {
      loadTemplates();
      alert('Modèle sauvegardé !');
    }
  }

  async function loadTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}/use`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    const items: CartItem[] = data.items;
    setCart(prev => [...prev, ...items]);
    setTemplateDropdownOpen(false);
  }

  async function deleteTemplate(templateId: number) {
    if (!confirm('Supprimer ce modèle ?')) return;
    await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
    loadTemplates();
  }

  useEffect(() => {
    fetch('/api/new-request/init').then(r => {
      if (!r.ok) { router.push('/'); return null; }
      return r.json();
    }).then(data => {
      if (!data) return;
      if (data.user.role !== 'worker') { router.push('/approvals'); return; }
      setUser(data.user);
      setLang((data.user.language as Lang) || 'fr');
      setJobSites(data.jobSites);
      if (data.preference) setPreference(data.preference);
      setFavorites(data.favorites);
      setFavoriteSKUs(new Set(data.favorites.map((p: Product) => `${p.supplier}:${p.sku}`)));
      setTemplates(data.templates);
    });
  }, [router]);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Close suggestions when clicking outside the search area
  useEffect(() => {
    function handleClickOutsideSearch(e: MouseEvent | TouchEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutsideSearch);
    document.addEventListener('touchstart', handleClickOutsideSearch);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideSearch);
      document.removeEventListener('touchstart', handleClickOutsideSearch);
    };
  }, []);

  async function toggleFavorite(p: Product) {
    const key = `${p.supplier}:${p.sku}`;
    const isFav = favoriteSKUs.has(key);
    try {
      const res = await fetch('/api/favorites', {
        method: isFav ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier: p.supplier, sku: p.sku, name: p.name, image_url: p.image_url, price: p.price, unit: p.unit, category: p.category }),
      });
      if (res.ok) loadFavorites();
    } catch {
      // network error — silently ignore, state stays consistent
    }
  }

  const [searchLimit, setSearchLimit] = useState(24);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const doSearch = useCallback(async (q: string, siteId?: string, appendLimit?: number) => {
    if (q.trim().length < 2) { setResults([]); setHasSearched(false); setHasMore(false); return; }
    const lim = appendLimit || 24;
    if (!appendLimit) setSearching(true);
    else setLoadingMore(true);
    setHasSearched(true);
    try {
      const siteParam = siteId ? `&job_site_id=${siteId}` : '';
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=${lim}${siteParam}`);
      const data = await res.json();
      setResults(data);
      setSearchLimit(lim);
      setHasMore(data.length >= lim);
    } catch {
      setResults([]);
      setHasMore(false);
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  }, []);

  // Pre-fill from reorder URL params
  const reorderApplied = useRef(false);
  useEffect(() => {
    if (reorderApplied.current) return;
    const product = searchParams.get('product');
    if (!product) return;
    // Wait for job sites to load before applying reorder params
    const jobSiteParam = searchParams.get('job_site_id');
    if (jobSiteParam && jobSites.length === 0) return;

    reorderApplied.current = true;
    setQuery(product);
    doSearch(product, jobSiteParam || undefined);

    const quantity = searchParams.get('quantity');
    if (quantity) setPendingQty(quantity);

    const unit = searchParams.get('unit');
    if (unit) setPendingUnit(unit);

    if (jobSiteParam) setJobSiteId(jobSiteParam);
  }, [searchParams, jobSites, doSearch]);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(val, jobSiteId || undefined), 300);

    // Fetch suggestions with debounce
    if (suggestionsTimeout.current) clearTimeout(suggestionsTimeout.current);
    if (val.trim().length >= 2) {
      suggestionsTimeout.current = setTimeout(() => {
        fetch(`/api/products/suggestions?q=${encodeURIComponent(val)}`)
          .then(r => r.ok ? r.json() : [])
          .then(data => { setSuggestions(data); setShowSuggestions(data.length > 0); })
          .catch(() => setSuggestions([]));
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setShowSuggestions(false);
    (document.activeElement as HTMLElement)?.blur();
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
    setShowSuggestions(false);
    setSuggestions([]);
    setPriceHistory([]);
    setPriceHistoryOpen(false);
    fetchNearestBranch(p.supplier, jobSiteId);

    // Fetch price history
    fetch(`/api/products/price-history?supplier=${encodeURIComponent(p.supplier)}&sku=${encodeURIComponent(p.sku)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { price: number; recorded_at: string }[]) => setPriceHistory(data))
      .catch(() => setPriceHistory([]));

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

  function pickSuggestion(s: any) {
    const product: Product = {
      name: s.product,
      sku: s.sku || '',
      image_url: s.image_url || '',
      price: s.price ?? null,
      unit: 'units',
      category: '',
      supplier: s.supplier,
    };
    pickProduct(product);
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

  async function queueOffline(items: CartItem[]) {
    const dbReq = indexedDB.open('logicsupplies-offline', 1);
    dbReq.onupgradeneeded = () => {
      dbReq.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    };
    dbReq.onsuccess = () => {
      const db = dbReq.result;
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      for (const item of items) {
        store.add({
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
      }
      tx.oncomplete = () => {
        setQueuedCount(items.length);
        setCart([]);
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then(reg => (reg as any).sync.register('sync-requests'));
        }
      };
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;

    if (!navigator.onLine) {
      await queueOffline(cart);
      return;
    }

    setLoading(true);
    let count = 0;
    let firstRequestId: number | null = null;
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
        if (res.ok) {
          const data = await res.json();
          count++;
          if (!firstRequestId && data.id) firstRequestId = data.id;
        }
      } catch {}
    }
    // Upload photo to the first request
    if (photoFile && firstRequestId) {
      try {
        const formData = new FormData();
        formData.append('files', photoFile);
        await fetch(`/api/requests/${firstRequestId}/photos`, { method: 'POST', body: formData });
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

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>{t('loading')}</p></div>;

  if (success) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-green-500">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {t('request_submitted')}
        </h2>
        <p className="text-gray-500 mt-2">Le bureau va recevoir une notification.</p>
      </div>
    </div>
  );

  const filteredResults = results.filter(p => selectedSuppliers.includes(p.supplier));
  const activeFilterCount = ALL_SUPPLIERS.length - selectedSuppliers.length;

  const pendingBadge = pendingProduct ? supplierBadge(pendingProduct.supplier) : null;
  const pendingTotal = pendingProduct?.price != null && parseInt(pendingQty) > 0
    ? pendingProduct.price * (parseInt(pendingQty) || 1) : null;
  const cartTotal = cart.length > 0 && cart.every(i => i.product.price != null)
    ? cart.reduce((sum, i) => sum + (i.product.price! * i.quantity), 0) : null;

  return (
    <div className="pb-24">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} marketingEnabled={user.marketingEnabled} hideTopOnMobile />

      {isOffline && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-800 font-medium">
          Mode hors-ligne — les demandes seront envoyées au retour du réseau
        </div>
      )}
      {queuedCount > 0 && (
        <div className="bg-blue-100 border-b border-blue-300 px-4 py-2 text-center text-sm text-blue-800 font-medium">
          {queuedCount} demande{queuedCount > 1 ? 's' : ''} en file d&apos;attente
        </div>
      )}

      {/* Sticky search bar */}
      <div className="bg-slate-800 px-4 pt-3 pb-3 sticky top-0 sm:top-[56px] md:top-0 z-20 shadow-md">
        <div className="max-w-lg mx-auto space-y-2">
          {/* Chantier */}
          {jobSites.length > 0 && (
            <select
              value={jobSiteId}
              onChange={e => handleJobSiteChange(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-base bg-slate-700 text-white border border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="">{t('job_site_select')}</option>
              {jobSites.map(s => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
            </select>
          )}
          <div className="flex gap-2" ref={searchWrapperRef}>
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0 relative">
              <input
                type="search"
                value={query}
                onChange={handleQueryChange}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder={t('search_products')}
                autoComplete="off"
                enterKeyHint="search"
                className="flex-1 rounded-xl pl-4 pr-4 py-2.5 text-base bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                type="submit"
                className="bg-yellow-400 text-slate-900 px-3 py-2.5 rounded-xl font-bold text-sm hover:bg-yellow-300 transition flex-shrink-0 flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <span className="hidden sm:inline">Chercher</span>
              </button>

              {/* Suggestions dropdown - previously ordered products */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-30 max-h-80 overflow-y-auto">
                  <p className="px-3 pt-2.5 pb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Commandés récemment</p>
                  {suggestions.map((s, i) => {
                    const b = supplierBadge(s.supplier);
                    return (
                      <button
                        key={`${s.supplier}:${s.product}:${i}`}
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition flex items-center gap-3 border-t border-gray-100"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
                          {s.image_url ? (
                            <img src={s.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 text-gray-300">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.product}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
                            <span className="text-xs text-gray-400">commandé {s.order_count} fois</span>
                          </div>
                        </div>
                        {s.price != null && (
                          <span className="text-sm font-bold text-gray-700 flex-shrink-0">{Number(s.price).toFixed(2)} $</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
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
                    { key: 'bmr', label: 'BMR', cls: 'text-red-600' },
                    { key: 'westburne', label: 'Westburne', cls: 'text-teal-600' },
                    { key: 'nedco', label: 'Nedco', cls: 'text-cyan-600' },
                    { key: 'futech', label: 'Futech', cls: 'text-amber-600' },
                    { key: 'deschenes', label: 'Deschênes', cls: 'text-indigo-600' },
                    { key: 'jsv', label: 'JSV', cls: 'text-yellow-600' },
                    { key: 'rona', label: 'Rona', cls: 'text-sky-600' },
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
          {/* Onglets Favoris / Rechercher */}
          <div className="flex gap-1 bg-slate-700 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setActiveTab('recherche')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'recherche'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              Rechercher
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('favoris')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'favoris'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill={activeTab === 'favoris' ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
              Favoris {favorites.length > 0 && `(${favorites.length})`}
            </button>
          </div>
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
                  <img src={pendingProduct.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain p-1" />
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
            {/* ─── Historique de prix ─── */}
            {priceHistory.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPriceHistoryOpen(!priceHistoryOpen)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-gray-500 hover:bg-gray-50 transition"
                >
                  <span className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                    </svg>
                    Historique de prix ({priceHistory.length})
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 transition-transform ${priceHistoryOpen ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {priceHistoryOpen && (
                  <div className="px-4 pb-3 space-y-1">
                    {priceHistory.map((h, i) => {
                      const prev = priceHistory[i + 1];
                      const diff = prev ? h.price - prev.price : 0;
                      const date = new Date(h.recorded_at + 'Z');
                      return (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                          <span className="text-gray-500">
                            {date.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-800">{h.price.toFixed(2)} $</span>
                            {diff > 0 && <span className="text-red-500 font-medium text-[10px]">+{diff.toFixed(2)}</span>}
                            {diff < 0 && <span className="text-green-600 font-medium text-[10px]">{diff.toFixed(2)}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('quantity_label')}</label>
                  <input
                    type="number"
                    min="1"
                    value={pendingQty}
                    onChange={e => setPendingQty(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('unit_label')}</label>
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
                        <img src={item.product.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain p-0.5" />
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

        {/* ─── Modèles ─── */}
        {!pendingProduct && (
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={saveTemplate}
                className="flex-1 text-xs text-gray-600 border border-gray-200 rounded-xl py-2 px-3 hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                </svg>
                Sauvegarder comme modèle
              </button>
            )}
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => { setTemplateDropdownOpen(!templateDropdownOpen); if (!templateDropdownOpen) loadTemplates(); }}
                className="w-full text-xs text-gray-600 border border-gray-200 rounded-xl py-2 px-3 hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                Charger un modèle
              </button>
              {templateDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3 text-center">Aucun modèle sauvegardé</p>
                  ) : (
                    templates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        <button
                          type="button"
                          onClick={() => loadTemplate(tmpl.id)}
                          className="flex-1 text-left text-xs text-gray-800 font-medium truncate"
                        >
                          {tmpl.name}
                          <span className="text-gray-400 font-normal ml-1">({tmpl.use_count}x)</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteTemplate(tmpl.id); }}
                          className="text-gray-300 hover:text-red-500 transition ml-2 p-0.5"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Formulaire de commande (visible si panier non vide et pas en mode ajout) ─── */}
        {cart.length > 0 && !pendingProduct && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('job_site_label')}</label>
                <select
                  value={jobSiteId}
                  onChange={e => handleJobSiteChange(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('job_site_select')}</option>
                  {jobSites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('note_label')}</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('note_placeholder')}
                  rows={2}
                />
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Photo (optionnel)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setPhotoFile(f);
                    setPhotoPreview(f ? URL.createObjectURL(f) : '');
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700"
                />
                {photoPreview && (
                  <img src={photoPreview} alt="Preview" className="mt-2 w-full h-40 object-cover rounded-xl" />
                )}
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
                  {t('urgent_label')}
                </span>
              </label>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 text-slate-900 py-4 rounded-2xl font-bold text-lg hover:bg-yellow-300 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? t('submitting') : t('submit_request')}
            </button>
          </form>
        )}

        {/* ─── Onglet Favoris ─── */}
        {!pendingProduct && activeTab === 'favoris' && (
          <>
            {favorites.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-12 h-12 text-gray-300 mx-auto mb-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
                <p className="font-medium text-gray-600">Aucun favori</p>
                <p className="text-sm mt-1">Allez dans Rechercher et cliquez sur l&apos;icône étoile pour ajouter un produit</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {favorites.map((p, i) => {
                  const b = supplierBadge(p.supplier);
                  return (
                    <div key={`${p.supplier}:${p.sku}`} className="relative">
                      <button
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-yellow-300 active:scale-[0.98] transition-all flex flex-col w-full"
                      >
                        <div className="w-full bg-gray-50 flex items-center justify-center p-3" style={{ aspectRatio: '1' }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-10 h-10 text-gray-300">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                          )}
                        </div>
                        <div className="p-2.5 flex flex-col gap-1 flex-1">
                          <p className="text-xs font-medium text-gray-900 leading-snug line-clamp-2">{p.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium self-start ${b.cls}`}>{b.label}</span>
                          {p.price != null ? (
                            <p className="text-sm font-bold text-gray-900 mt-auto">
                              {p.price.toFixed(2)} $
                              {p.unit !== 'units' && <span className="text-xs font-normal text-gray-400 ml-1">/{p.unit}</span>}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 italic mt-auto">Prix sur demande</p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(p)}
                        className="absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 shadow-sm hover:scale-110 transition-transform"
                        title="Retirer des favoris"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-yellow-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── Résultats de recherche ─── */}
        {!pendingProduct && activeTab === 'recherche' && (
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
                <p className="font-medium text-gray-600">{t('no_results')}</p>
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
                    {filteredResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <p className="font-medium text-gray-600">Aucun résultat avec ces filtres</p>
                        <p className="text-sm mt-1">Essayez d&apos;activer d&apos;autres fournisseurs</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {filteredResults.map((p) => {
                            const b = supplierBadge(p.supplier);
                            const isFav = favoriteSKUs.has(`${p.supplier}:${p.sku}`);
                            return (
                              <div key={`${p.supplier}:${p.sku}`} className="relative">
                                <button
                                  type="button"
                                  onClick={() => pickProduct(p)}
                                  className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-yellow-300 active:scale-[0.98] transition-all flex flex-col w-full"
                                >
                                  <div className="w-full bg-gray-50 flex items-center justify-center p-2" style={{ aspectRatio: '4/3' }}>
                                    {p.image_url ? (
                                      <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-contain" />
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
                                <button
                                  type="button"
                                  onClick={() => toggleFavorite(p)}
                                  className="absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 shadow-sm hover:scale-110 transition-transform"
                                  title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 ${isFav ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {hasMore && (
                          <button
                            type="button"
                            disabled={loadingMore}
                            onClick={() => doSearch(query, jobSiteId || undefined, searchLimit + 24)}
                            className="w-full mt-3 py-3 rounded-2xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-50"
                          >
                            {loadingMore ? 'Chargement...' : 'Voir plus de résultats'}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
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
