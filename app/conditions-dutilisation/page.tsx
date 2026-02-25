import Link from 'next/link';

export default function ConditionsDutilisationPage() {
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
              <h1 className="text-xl font-bold text-gray-900">Conditions d&apos;utilisation</h1>
              <p className="text-xs text-gray-400 mt-0.5">logicSupplies — Gestion des demandes de matériel</p>
            </div>
          </div>

          <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="font-semibold text-gray-900 mb-2">1. Acceptation</h2>
              <p>En utilisant la plateforme, l&apos;utilisateur accepte les présentes conditions.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">2. Service offert</h2>
              <p>La plateforme permet la gestion et l&apos;approvisionnement de matériel pour les chantiers (commandes, approbations, suivi, etc.).</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">3. Responsabilité des commandes</h2>
              <p>L&apos;utilisateur est responsable de toutes les commandes effectuées via son compte, incluant les erreurs de quantité, prix ou fournisseur.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">4. Approbation des commandes</h2>
              <p>Toute commande doit être validée par un administrateur désigné avant d&apos;être transmise à un fournisseur.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">5. Limitation de responsabilité</h2>
              <p className="mb-2">La plateforme n&apos;est pas responsable :</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                <li>Des erreurs de fournisseurs</li>
                <li>Des retards de livraison</li>
                <li>Des pertes financières liées aux commandes</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">6. Paiement</h2>
              <p>Le service est facturé sous forme d&apos;abonnement mensuel. Aucun remboursement n&apos;est garanti.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">7. Résiliation</h2>
              <p>L&apos;utilisateur peut annuler en tout temps. L&apos;accès sera maintenu jusqu&apos;à la fin de la période payée.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">8. Propriété intellectuelle</h2>
              <p>Le logiciel, son code et ses fonctionnalités demeurent la propriété exclusive de l&apos;entreprise.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">9. Modification du service</h2>
              <p>Nous nous réservons le droit de modifier les fonctionnalités sans préavis.</p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">10. Droit applicable</h2>
              <p>Ces conditions sont régies par les lois du Québec (Canada).</p>
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
