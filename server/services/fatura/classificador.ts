/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Classificador de gastos da fatura — SELVA (Plataforma e Anúncios) × Pessoal
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Determinístico e EXPLICÁVEL — cada linha carrega o "por quê". O dicionário
 *  abaixo é a SEMENTE, tirada da aba "Reembolsos Gui · Plataforma e Anúncios".
 *  Na feature real ele cresce a cada mês conforme o Guilherme confirma; aqui é a
 *  base fixa que já reconcilia a fatura de julho à planilha.
 *
 *  Nunca chuta: o que não casa SELVA nem Pessoal vira REVISAR (decisão humana).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { type LinhaFatura } from "./parseNubank";

export type Categoria = "SELVA" | "PESSOAL" | "REVISAR";
export type Confianca = "alta" | "media" | "baixa";

/** Uma regra do dicionário. `valorCents` (opcional) casa só num valor exato —
 *  para estabelecimentos ambíguos por valor (Apple.Com/Bill). */
export type Regra = { padrao: RegExp; canonical: string; categoria: "SELVA" | "PESSOAL"; valorCents?: number };

/** Semente SELVA — Plataforma e Anúncios (padrões dos descritores da fatura). */
export const SEED_SELVA: Regra[] = [
  { padrao: /facebk|facebook|meta ?plat/i, canonical: "Ads SELVA", categoria: "SELVA" },
  { padrao: /anthropic|claude/i, canonical: "Claude AI", categoria: "SELVA" },
  { padrao: /openai|chatgpt|open ?ia/i, canonical: "Open IA", categoria: "SELVA" },
  { padrao: /trello|atlassian/i, canonical: "Trello", categoria: "SELVA" },
  { padrao: /figma/i, canonical: "Figma", categoria: "SELVA" },
  { padrao: /envato/i, canonical: "Envato", categoria: "SELVA" },
  { padrao: /canva/i, canonical: "Canva", categoria: "SELVA" },
  { padrao: /capcut/i, canonical: "Capcut", categoria: "SELVA" },
  { padrao: /adobe/i, canonical: "Adobe Creative Cloud", categoria: "SELVA" },
  { padrao: /microsoft/i, canonical: "Microsoft", categoria: "SELVA" },
  { padrao: /mailchimp/i, canonical: "Mailchimp SELVA", categoria: "SELVA" },
  { padrao: /mlabs/i, canonical: "Mlabs", categoria: "SELVA" },
  { padrao: /render\.com/i, canonical: "Render", categoria: "SELVA" },
  { padrao: /railway/i, canonical: "Railway", categoria: "SELVA" },
  { padrao: /magnific|freepik|mgf\*/i, canonical: "Freepik / Magnific", categoria: "SELVA" },
  { padrao: /manus/i, canonical: "Manus AI", categoria: "SELVA" },
  { padrao: /kling/i, canonical: "Kling AI", categoria: "SELVA" },
  { padrao: /abacus/i, canonical: "Abacus AI", categoria: "SELVA" },
  { padrao: /midjourney/i, canonical: "Midjourney", categoria: "SELVA" },
  { padrao: /click ?up/i, canonical: "Click Up", categoria: "SELVA" },
  { padrao: /gather/i, canonical: "Gather Premium", categoria: "SELVA" },
  { padrao: /taqtic/i, canonical: "Taqtic", categoria: "SELVA" },
  { padrao: /visual ?eletric/i, canonical: "Visual Eletric", categoria: "SELVA" },
  { padrao: /wix/i, canonical: "Wix", categoria: "SELVA" },
  { padrao: /google one|google google/i, canonical: "Google One", categoria: "SELVA" },
  // Ambíguo por VALOR: só a assinatura de R$120,90 é a verificação do Instagram.
  { padrao: /apple\.com\/bill/i, canonical: "Apple (Verificado Instagram)", categoria: "SELVA", valorCents: 12090 },
];

/** Semente PESSOAL — para tirar ruído (o resto vira REVISAR). */
export const SEED_PESSOAL: Regra[] = [
  { padrao: /ifd\*|ifood|rappi|dlrappi/i, canonical: "Delivery", categoria: "PESSOAL" },
  { padrao: /99 ?ride|99app|uber/i, canonical: "Transporte", categoria: "PESSOAL" },
  { padrao: /spotify|globoplay|disney|amazonprime|netflix|globo ?premiere|hbo|max\b/i, canonical: "Streaming", categoria: "PESSOAL" },
  { padrao: /seguro|allianz/i, canonical: "Seguro", categoria: "PESSOAL" },
  { padrao: /decolar|latam|airbnb|booking|azul|gol\b/i, canonical: "Viagem", categoria: "PESSOAL" },
  { padrao: /mercadolivre|amazon marketplace/i, canonical: "Marketplace", categoria: "PESSOAL" },
  { padrao: /playstation|sonyplaystatn|xbox|nintendo/i, canonical: "Games", categoria: "PESSOAL" },
  { padrao: /posto|autoposto|auto posto/i, canonical: "Combustível", categoria: "PESSOAL" },
  { padrao: /drogasil|drogaria|raia|farmacia|pague menos/i, canonical: "Farmácia", categoria: "PESSOAL" },
  { padrao: /apple\.com\/bill/i, canonical: "Apple (pessoal)", categoria: "PESSOAL" }, // fallback após a regra de valor
];

export const DICIONARIO_SEED: Regra[] = [...SEED_SELVA, ...SEED_PESSOAL];

export type LinhaClassificada = LinhaFatura & {
  categoria: Categoria;
  canonical: string | null;
  confianca: Confianca;
  porque: string;
};

/** Classifica UMA linha. Regra com `valorCents` casa só no valor exato. */
export function classificarLinha(l: LinhaFatura, dicionario: Regra[] = DICIONARIO_SEED): LinhaClassificada {
  if (l.tipo === "EXCLUIDO") {
    return { ...l, categoria: "REVISAR", canonical: null, confianca: "baixa", porque: l.motivo ?? "linha ignorada" };
  }
  for (const r of dicionario) {
    if (r.valorCents != null && Math.abs(l.valorCents) !== r.valorCents) continue;
    if (r.padrao.test(l.descritor)) {
      const confianca: Confianca = r.valorCents != null ? "media" : "alta";
      return { ...l, categoria: r.categoria, canonical: r.canonical, confianca, porque: `casou "${r.padrao.source}" → ${r.canonical}${r.valorCents != null ? " (por valor)" : ""}` };
    }
  }
  return { ...l, categoria: "REVISAR", canonical: null, confianca: "baixa", porque: "estabelecimento novo — fora do dicionário" };
}

// ─── Conciliação por mês (competência = data da transação) ───────────────────

export type ItemConciliado = { canonical: string; valorCents: number; linhas: LinhaClassificada[] };
export type Conciliacao = {
  mes: string;
  selva: ItemConciliado[];       // agregado por estabelecimento (COMPRA + IOF)
  totalSelvaCents: number;
  pessoal: LinhaClassificada[];
  revisar: LinhaClassificada[];
  ignorados: LinhaClassificada[]; // exclusões (pagamento, estorno, ajuste, IOF de volta)
  foraDoMes: LinhaClassificada[]; // caem em outro mês (entram no próximo upload)
};

/**
 * Concilia a fatura para UM mês de competência. Só entram linhas cuja `data`
 * cai no mês; o resto vai para `foraDoMes`. SELVA é agregado por estabelecimento
 * somando COMPRA + IOF (o IOF de volta já saiu como EXCLUIDO no parser).
 */
export function conciliarFatura(linhas: LinhaFatura[], mes: string, dicionario: Regra[] = DICIONARIO_SEED): Conciliacao {
  const classificadas = linhas.map((l) => classificarLinha(l, dicionario));
  const doMes = classificadas.filter((l) => l.data.slice(0, 7) === mes);
  const foraDoMes = classificadas.filter((l) => l.data.slice(0, 7) !== mes && l.tipo !== "EXCLUIDO");

  const ignorados = doMes.filter((l) => l.tipo === "EXCLUIDO");
  const validas = doMes.filter((l) => l.tipo !== "EXCLUIDO");
  const pessoal = validas.filter((l) => l.categoria === "PESSOAL");
  const revisar = validas.filter((l) => l.categoria === "REVISAR");

  const mapa = new Map<string, ItemConciliado>();
  for (const l of validas.filter((x) => x.categoria === "SELVA")) {
    const chave = l.canonical!;
    const item = mapa.get(chave) ?? { canonical: chave, valorCents: 0, linhas: [] };
    item.valorCents += l.valorCents;
    item.linhas.push(l);
    mapa.set(chave, item);
  }
  const selva = Array.from(mapa.values()).sort((a, b) => b.valorCents - a.valorCents);
  const totalSelvaCents = selva.reduce((a, s) => a + s.valorCents, 0);

  return { mes, selva, totalSelvaCents, pessoal, revisar, ignorados, foraDoMes };
}
