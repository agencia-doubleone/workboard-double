import { Suspense } from "react";

import { HomeContent, HomeSkeleton } from "./_home/home-content";

// Início ("Meu dia"): saudação, resumo, agenda de entregas, o que espera
// resposta, atividade e aniversários; admins veem também a agência.
// Partes em _home/ (pasta privada: não vira rota).
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
