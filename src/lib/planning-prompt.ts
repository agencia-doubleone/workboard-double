import { formatMonth, type MonthKey } from "@/lib/calendar";

// O prompt padrão que a equipe usa numa IA para converter o planejamento do Word
// no JSON de importação (lido por src/lib/planning-json.ts). Os dois andam juntos:
// mudou o formato aceito, mude o prompt.

export const PLANNING_PROMPT = `Converta o planejamento editorial fornecido para o padrão JSON de importação do Workboard.

**Regras obrigatórias:**

1. Retorne exclusivamente um JSON válido, sem Markdown, comentários ou explicações.
2. A raiz deve conter apenas a propriedade \`posts\`, que é um array.
3. Cada publicação deve conter os seguintes campos: \`data\`, \`tipo\`, \`headline\`, \`textoApoio\`, \`copy\`, \`cta\` e \`hashtags\`.
4. Utilize o formato YYYY-MM-DD para as datas.
5. O campo \`tipo\` aceita exclusivamente \`estatico\`, \`carrossel\` ou \`reels\`.
6. \`copy\` representa a legenda da publicação. Preserve o texto original e os parágrafos utilizando \`\\n\`.
7. \`cta\` representa a chamada para ação da publicação.
8. \`hashtags\` deve ser um array de strings, com cada hashtag incluindo o símbolo #.
9. Para posts estáticos, não inclua \`slides\` nem \`cenas\`.
10. Para carrosséis, inclua \`slides\`, um array de objetos com \`headline\` e \`textoApoio\`, respeitando a ordem original dos cards.
11. Para Reels, inclua \`cenas\`, um array de objetos com \`texto\`, respeitando a ordem do roteiro. Preserve o hook e o fechamento quando existirem, sem descartar conteúdo.
12. Quando uma informação não estiver presente no planejamento, utilize \`null\` para campos de texto ou \`[]\` para arrays. Não invente conteúdo.
13. Preserve integralmente os textos, a linguagem, as informações e as chamadas para ação do planejamento original.
14. Não inclua identificadores, nomes de clientes, status, responsáveis ou dados adicionais.
15. Não confunda o CTA presente na arte com o CTA da legenda. Quando ambos existirem, priorize no campo \`cta\` o CTA da legenda e preserve o CTA da arte no conteúdo visual correspondente.

**Formato esperado:**

\`\`\`json
{
  "posts": [
    {
      "data": "2026-10-02",
      "tipo": "estatico",
      "headline": "Texto principal",
      "textoApoio": "Texto complementar",
      "copy": "Legenda completa",
      "cta": "Chamada para ação",
      "hashtags": ["#exemplo"]
    }
  ]
}
\`\`\`

Converta todas as publicações do planejamento, sem omitir nenhuma.`;

/**
 * O prompt com o mês do planejamento no fim: o Word costuma trazer as datas sem
 * o ano ("02/10"), e a IA precisa saber qual usar.
 */
export function planningPrompt(month?: MonthKey) {
  if (!month) return PLANNING_PROMPT;
  return `${PLANNING_PROMPT}\n\nMês do planejamento: ${formatMonth(month)} (use ${month.slice(0, 4)} nas datas).`;
}
