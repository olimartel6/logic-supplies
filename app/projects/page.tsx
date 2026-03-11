'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

interface JobSite {
  id: number;
  name: string;
  address: string;
  status: string;
}

interface Media {
  id: number;
  url: string;
  type: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [sites, setSites] = useState<JobSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<JobSite | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [description, setDescription] = useState('');
  const [generatedPost, setGeneratedPost] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => {
      if (!u) return;
      if (u.role === 'worker') { router.push('/my-requests'); return; }
      setUser(u);
    });
    loadSites();
    fetch('/api/supplier/preference').then(r => r.json()).then(d => {
      setGoogleReviewUrl(d.googleReviewUrl || '');
    });
  }, [router]);

  function loadSites() {
    fetch('/api/job-sites?status=completed').then(r => r.json()).then(setSites);
  }

  function loadMedia(siteId: number) {
    fetch(`/api/job-sites/${siteId}/media`).then(r => r.json()).then(setMedia);
  }

  function selectSite(site: JobSite) {
    setSelectedSite(site);
    setGeneratedPost('');
    setGeneratedImage('');
    setDescription('');
    setShowReview(false);
    setReviewSent(false);
    loadMedia(site.id);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !selectedSite) return;
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    await fetch(`/api/job-sites/${selectedSite.id}/media`, { method: 'POST', body: formData });
    loadMedia(selectedSite.id);
    setUploading(false);
    e.target.value = '';
  }

  async function handleDeleteMedia(mediaId: number) {
    if (!selectedSite) return;
    await fetch(`/api/job-sites/${selectedSite.id}/media/${mediaId}`, { method: 'DELETE' });
    setMedia(media.filter(m => m.id !== mediaId));
  }

  async function handleGeneratePost() {
    if (!selectedSite || !description.trim()) return;
    setGenerating(true);
    const res = await fetch(`/api/job-sites/${selectedSite.id}/marketing/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });
    const data = await res.json();
    setGeneratedPost(data.post || data.error || 'Erreur');
    setGenerating(false);
  }

  async function handleGenerateImage() {
    if (!selectedSite || media.length === 0) return;
    setGeneratingImage(true);
    const images = media.filter(m => m.type === 'image');
    if (images.length === 0) { setGeneratingImage(false); return; }
    const res = await fetch(`/api/job-sites/${selectedSite.id}/marketing/instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrls: images.map(m => m.url), text: description.slice(0, 60) }),
    });
    const data = await res.json();
    setGeneratedImage(data.image || '');
    setGeneratingImage(false);
  }

  async function handleCopyPost() {
    await navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendReview() {
    if (!selectedSite || !clientEmail) return;
    setReviewSending(true);
    setReviewError('');
    const res = await fetch(`/api/job-sites/${selectedSite.id}/marketing/review-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientEmail, clientName }),
    });
    const data = await res.json();
    if (data.ok) {
      setReviewSent(true);
    } else {
      setReviewError(data.error || 'Erreur');
    }
    setReviewSending(false);
  }

  async function handleCopyReviewLink() {
    if (googleReviewUrl) {
      await navigator.clipboard.writeText(googleReviewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>;

  if (!selectedSite) {
    return (
      <div className="pb-20">
        <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} marketingEnabled={user.marketingEnabled} />
        <div className="max-w-lg mx-auto px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Projets terminés</h1>
          {sites.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p>Aucun projet terminé</p>
              <p className="text-sm mt-1">Marquez un chantier comme terminé pour accéder aux outils marketing</p>
            </div>
          )}
          <div className="space-y-3">
            {sites.map(s => (
              <button
                key={s.id}
                onClick={() => selectSite(s)}
                className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-blue-300 transition"
              >
                <p className="font-semibold text-gray-900">{s.name}</p>
                {s.address && <p className="text-sm text-gray-500">{s.address}</p>}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} marketingEnabled={user.marketingEnabled} />
      <div className="max-w-lg mx-auto px-4 py-6">
        <button onClick={() => setSelectedSite(null)} className="text-blue-600 text-sm mb-4 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>

        <h1 className="text-xl font-bold text-gray-900 mb-1">{selectedSite.name}</h1>
        {selectedSite.address && <p className="text-sm text-gray-500 mb-6">{selectedSite.address}</p>}

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Photos du projet</h2>
          <label className="block mb-3">
            <span className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition">
              {uploading ? 'Envoi en cours...' : '+ Ajouter photos / vidéos'}
            </span>
            <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
          {media.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {media.map(m => (
                <div key={m.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {m.type === 'image' ? (
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={m.url} className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => handleDeleteMedia(m.id)}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Créer un post</h2>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Décrivez rapidement le projet (ex: Installation panneau électrique 200A)"
            rows={2}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />
          <button
            onClick={handleGeneratePost}
            disabled={generating || !description.trim()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 mb-3"
          >
            {generating ? 'Génération...' : 'Créer un post pour les réseaux sociaux'}
          </button>
          {generatedPost && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-4 text-sm whitespace-pre-wrap">{generatedPost}</div>
              <div className="flex gap-2">
                <button onClick={handleCopyPost} className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold">
                  {copied ? 'Copié !' : 'Copier le texte'}
                </button>
                <button onClick={handleGeneratePost} className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium">
                  Régénérer
                </button>
              </div>
              {media.length > 0 && (
                <button
                  onClick={handleGenerateImage}
                  disabled={generatingImage}
                  className="w-full border border-blue-600 text-blue-600 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {generatingImage ? 'Création image...' : 'Générer image Instagram (1080x1080)'}
                </button>
              )}
              {generatedImage && (
                <div className="space-y-2">
                  <img src={generatedImage} alt="Instagram post" className="w-full rounded-xl" />
                  <a
                    href={generatedImage}
                    download={`post-${selectedSite.name.replace(/\s+/g, '-')}.png`}
                    className="block text-center bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold"
                  >
                    Télécharger l&apos;image
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Demander un avis client</h2>
          {!showReview ? (
            <div className="space-y-2">
              <button
                onClick={() => setShowReview(true)}
                className="w-full bg-yellow-500 text-white py-2.5 rounded-xl text-sm font-semibold"
              >
                Demander un avis client
              </button>
              {googleReviewUrl && (
                <button
                  onClick={handleCopyReviewLink}
                  className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  {copied ? 'Lien copié !' : "Copier lien d'avis Google"}
                </button>
              )}
            </div>
          ) : reviewSent ? (
            <div className="text-center py-4">
              <p className="text-green-600 font-semibold">Email envoyé avec succès !</p>
              <button
                onClick={() => { setReviewSent(false); setClientName(''); setClientEmail(''); }}
                className="text-blue-600 text-sm mt-2"
              >
                Envoyer à un autre client
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Nom du client (optionnel)"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="Email du client *"
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {reviewError && <p className="text-red-500 text-sm">{reviewError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReview(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSendReview}
                  disabled={reviewSending || !clientEmail}
                  className="flex-1 bg-yellow-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {reviewSending ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
