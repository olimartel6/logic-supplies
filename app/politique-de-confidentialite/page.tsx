import Link from 'next/link';

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Retour à la connexion</Link>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.818a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .845-.143Z" clipRule="evenodd" />
            </svg>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Politique de confidentialité</h1>
              <p className="text-xs text-gray-400 mt-0.5">logicSupplies — Gestion des demandes de matériel</p>
            </div>
          </div>

          <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="font-semibold text-gray-900 mb-2">1. Données collectées</h2>
              <p className="mb-2">Nous collectons :</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                <li>Nom</li>
                <li>Email</li>
                <li>Informations d&apos;entreprise</li>
                <li>Données de commandes</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">2. Utilisation des données</h2>
              <p className="mb-2">Les données sont utilisées pour :</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                <li>Fonctionnement de la plateforme</li>
                <li>Amélioration du service</li>
                <li>Communication avec l&apos;utilisateur</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">3. Partage des données</h2>
              <p className="mb-2">Les données peuvent être partagées avec :</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                <li>Fournisseurs (pour traiter les commandes)</li>
                <li>Services de paiement</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">4. Sécurité</h2>
              <p>Nous mettons en place des mesures raisonnables pour protéger les données.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">5. Conservation</h2>
              <p>Les données sont conservées tant que le compte est actif.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">6. Droits de l&apos;utilisateur</h2>
              <p className="mb-2">L&apos;utilisateur peut demander :</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                <li>Accès à ses données</li>
                <li>Modification ou suppression</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">7. Cookies</h2>
              <p>La plateforme peut utiliser des cookies pour améliorer l&apos;expérience.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">8. Modification</h2>
              <p>Cette politique peut être modifiée à tout moment.</p>
            </section>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-100">
            <Link
              href="/"
              className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
            >
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
