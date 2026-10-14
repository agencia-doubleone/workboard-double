import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetOnNavigation } from "@/components/reset-on-navigation";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { db } from "@/db";
import { formatDate } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { listGuestbook } from "@/server/guestbook";
import { resolveMediaUrl } from "@/server/media";
import { GuestbookForm } from "./guestbook-form";

export const metadata: Metadata = { title: "Bastidores" };

// Página secreta (fora do menu e da busca): chega-se pela porta escondida da
// página de "não encontrado". Assinar o livro de visitas é a conquista
// "Você Não Deveria Estar Aqui".
export default function BastidoresPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BackstageContent />
    </Suspense>
  );
}

const NOTES = [
  "O primeiro bug do Workboard foi um botão que dizia “Salvar” e não salvava nada. Ele foi aposentado com honras.",
  "Os confetes da comemoração são 180 papéis sorteados um por um. Ninguém conferiu se são mesmo 180.",
  "Existe um comando no chat que não aparece na lista do “/”. Dizem que ele é verde.",
  "Café consumido durante a construção deste sistema: incalculável.",
];

async function BackstageContent() {
  const { user } = await requireSession();
  const entries = await listGuestbook(db);
  const mine = entries.find((entry) => entry.userId === user.id) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">/bastidores</p>
        <h1 className="text-2xl font-semibold tracking-tight">Você não deveria estar aqui.</h1>
        <p className="text-sm text-muted-foreground">
          Mas já que entrou, fique à vontade. Aqui é onde os desenvolvedores guardam o que não cabe no menu: café frio,
          bugs aposentados e um código Konami anotado num post-it.
        </p>
      </header>

      <section aria-labelledby="bastidores-notas" className="flex flex-col gap-3">
        <h2 id="bastidores-notas" className="text-sm font-semibold">
          Coisas que só quem entra aqui sabe
        </h2>
        <ul className="flex flex-col gap-2 rounded-xl border bg-card p-4 font-mono text-[13px] leading-relaxed shadow-raised">
          {NOTES.map((note, index) => (
            <li key={index} className="flex gap-3">
              <span aria-hidden="true" className="text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="bastidores-livro" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="bastidores-livro" className="text-sm font-semibold">
            Livro de visitas
          </h2>
          <p className="text-sm text-muted-foreground">
            Quem achou a porta deixa o nome aqui. {mine ? "Você já assinou; dá para trocar o recado." : "Falta só você."}
          </p>
        </div>
        <ResetOnNavigation>
          <GuestbookForm signed={Boolean(mine)} initialMessage={mine?.message ?? ""} />
        </ResetOnNavigation>
        {entries.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-raised">
            {entries.map((entry) => (
              <li key={entry.userId} className="flex gap-3 p-4">
                <UserAvatar name={entry.name} imageUrl={resolveMediaUrl(entry.image)} className="size-8" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm">
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-muted-foreground"> · {formatDate(entry.signedAt)}</span>
                  </p>
                  {entry.message && <p className="text-sm break-words text-muted-foreground">{entry.message}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
