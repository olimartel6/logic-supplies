'use client';
import Link from 'next/link';

export default function SignupCancelledPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Paiement annulé</h1>
        <p className="text-gray-500 text-sm mb-8">
          Votre paiement a été annulé. Aucun montant n&apos;a été débité.
        </p>
        <Link
          href="/"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition text-center"
        >
          Réessayer
        </Link>
      </div>
    </div>
  );
}
