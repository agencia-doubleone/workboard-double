"use client";

import { CakeIcon, GhostIcon, SparklesIcon, TreePineIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { BirthdayBalloons } from "@/components/birthday-balloons";
import { Hint } from "@/components/hint";
import { HolidayEffect } from "@/components/holiday-effect";
import type { Holiday } from "@/lib/greeting";

/**
 * Saudação especial do dia, calculada no servidor (src/lib/greeting.ts): um
 * aniversário (da pessoa, na equipe; da empresa, no portal) solta balões; uma
 * data especial (Halloween, Natal, Ano Novo) solta a animação dela. O
 * aniversário vem antes.
 */
export type SpecialGreeting =
  | { kind: "birthday"; text: string }
  | { kind: "holiday"; holiday: Holiday; text: string };

const HOLIDAY_LOOKS: Record<Holiday, { icon: LucideIcon; replay: string }> = {
  halloween: { icon: GhostIcon, replay: "Soltar os morcegos de novo" },
  christmas: { icon: TreePineIcon, replay: "Fazer nevar de novo" },
  "new-year": { icon: SparklesIcon, replay: "Soltar os fogos de novo" },
};

const specialGreetingClass =
  "hidden max-w-md items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-primary-ink outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex";

/**
 * A saudação do canto do header ("Bom dia, Ana"), igual na equipe e no portal.
 * No dia especial, vira um botão: a animação sobe sozinha uma vez por dia neste
 * navegador, e cada clique solta de novo.
 */
export function HeaderGreeting({
  firstName,
  greeting,
  special,
}: {
  firstName: string;
  greeting: string;
  special: SpecialGreeting | null;
}) {
  // 0 = soltura automática (uma vez por dia); cada clique na saudação solta de novo.
  const [launches, setLaunches] = useState(0);

  if (!special) {
    return (
      <p className="hidden text-sm text-muted-foreground sm:block">
        {greeting}, <span className="font-medium text-foreground">{firstName}</span>
      </p>
    );
  }

  const look =
    special.kind === "birthday" ? { icon: CakeIcon, replay: "Soltar os balões de novo" } : HOLIDAY_LOOKS[special.holiday];
  return (
    <>
      <Hint label={look.replay} side="bottom">
        <button type="button" onClick={() => setLaunches((count) => count + 1)} className={specialGreetingClass}>
          <look.icon className="size-4 shrink-0" />
          <span className="truncate">{special.text}</span>
        </button>
      </Hint>
      {special.kind === "birthday" ? (
        <BirthdayBalloons key={launches} oncePerDay={launches === 0} />
      ) : (
        <HolidayEffect key={launches} holiday={special.holiday} oncePerDay={launches === 0} />
      )}
    </>
  );
}
