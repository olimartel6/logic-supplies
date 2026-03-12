import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LogicSupplies — Simplifiez vos commandes de matériaux',
  description: 'La plateforme qui simplifie l\'approvisionnement pour les entreprises de construction du Québec.',
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
