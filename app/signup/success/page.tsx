'use client';
import Link from 'next/link';
import { Suspense } from 'react';

function SuccessContent() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Compte activé !</h1>
        <p className="text-gray-500 text-sm mb-8">
          Votre paiement a été reçu. Votre compte logicSupplies est prêt.
        </p>
        <Link
          href="/"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition text-center"
        >
          Se connecter
        </Link>
      </div>
    </div>
  );
}

export default function SignupSuccessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>}>
      <SuccessContent />
    </Suspense>
  );
}
