/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Plataformas de e-commerce — catálogo único
 * ─────────────────────────────────────────────────────────────────────────────
 *  Antes disto, "quais plataformas existem" estava escrito em quatro lugares: o
 *  `<select>` da tela, o dispatch do sync, o `Set` do cron e o schema Zod da
 *  procedure. Acrescentar uma quinta exigia lembrar dos quatro, e esquecer um
 *  produzia o pior tipo de falha — a loja aparece cadastrada, ninguém sincroniza
 *  e nada reclama.
 *
 *  Agora existe um lugar. Quem quiser saber o que o sistema suporta pergunta aqui.
 *
 *  ── `integrada` é o que separa promessa de entrega ─────────────────────────
 *  Wix e Shopify entram no catálogo porque o modelo precisa saber que a Aiká é
 *  Wix hoje e provavelmente Shopify amanhã. Mas `integrada: false` significa
 *  literalmente: NÃO existe adaptador de leitura. A plataforma pode ser
 *  registrada, e a loja fica `pendente` — nunca "ativa", nunca contada como
 *  fonte de dados, nunca sincronizada.
 *
 *  Essa distinção é a diferença entre preparar o terreno e fingir integração.
 *  Uma loja Wix marcada como conectada, sem nada por trás, faria o Panorama
 *  dizer "sem vendas hoje" para uma loja que vende — e ninguém desconfiaria.
 *
 *  ── Dois campos genéricos, significados diferentes ─────────────────────────
 *  O modelo guarda `consumerKey` e `consumerSecret`. Cada plataforma usa esses
 *  dois slots do seu jeito (na VNDA, `key` é o X-Shop-Host e `secret` é o
 *  token). Os rótulos moram aqui para a tela pedir o nome certo em vez de
 *  "Consumer Key" para todo mundo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PlataformaLoja = "woocommerce" | "vnda" | "wix" | "shopify";

export interface DefinicaoPlataforma {
  id: PlataformaLoja;
  label: string;
  /**
   * Existe adaptador de leitura HOJE? `false` = a plataforma pode ser
   * registrada, mas nada é buscado e nada é exibido como dado.
   */
  integrada: boolean;
  /** Rótulos dos dois slots de credencial, no vocabulário da plataforma. */
  campos: { chave: string; segredo: string };
  /** O que a pessoa precisa saber para preencher — ou por que não dá ainda. */
  ajuda: string;
}

export const PLATAFORMAS_LOJA: DefinicaoPlataforma[] = [
  {
    id: "woocommerce",
    label: "WooCommerce",
    integrada: true,
    campos: { chave: "Consumer Key (ck_)", segredo: "Consumer Secret (cs_)" },
    ajuda: "Gere as chaves em WooCommerce → Configurações → Avançado → REST API.",
  },
  {
    id: "vnda",
    label: "VNDA / Olist",
    integrada: true,
    campos: { chave: "X-Shop-Host", segredo: "Token de API" },
    ajuda: "O token vai em Bearer; o X-Shop-Host identifica a loja e não é segredo.",
  },
  {
    id: "wix",
    label: "Wix",
    integrada: true,
    campos: { chave: "Site ID", segredo: "API Key" },
    ajuda: "Gere a chave em Settings → API Keys, com permissão de leitura de Wix Stores / eCommerce (Orders).",
  },
  {
    id: "shopify",
    label: "Shopify",
    integrada: false,
    campos: { chave: "Domínio da loja (.myshopify.com)", segredo: "Admin API access token" },
    ajuda: "Ainda sem integração de leitura. Registre a plataforma agora; a coleta entra depois.",
  },
];

export const plataformaPorId = (id: string | null | undefined): DefinicaoPlataforma | undefined =>
  PLATAFORMAS_LOJA.find((p) => p.id === id);

export const ehPlataformaValida = (v: unknown): v is PlataformaLoja =>
  typeof v === "string" && PLATAFORMAS_LOJA.some((p) => p.id === v);

/**
 * Plataformas com adaptador. É desta lista que o sync e o cron saem — não de um
 * `Set` escrito à mão que vai divergir do catálogo na primeira adição.
 */
export const PLATAFORMAS_INTEGRADAS: PlataformaLoja[] =
  PLATAFORMAS_LOJA.filter((p) => p.integrada).map((p) => p.id);

export const temIntegracao = (id: string | null | undefined): boolean =>
  !!plataformaPorId(id)?.integrada;

/**
 * Estado de uma loja cadastrada, do ponto de vista de quem olha a tela.
 *
 * `pendente` não é erro nem "quase lá": é o estado correto e definitivo de uma
 * loja cujo adaptador não existe. Chamar isso de "erro" faria alguém tentar
 * consertar o que não está quebrado.
 */
export type EstadoLoja = "ativa" | "pendente" | "erro";

export function estadoDaLoja(a: {
  platform: string;
  status?: string | null;
  lastTestStatus?: string | null;
}): { estado: EstadoLoja; texto: string } {
  if (!temIntegracao(a.platform)) {
    return {
      estado: "pendente",
      texto: `${plataformaPorId(a.platform)?.label ?? a.platform} registrada — integração de leitura ainda não disponível.`,
    };
  }
  if (a.status === "pausada") return { estado: "pendente", texto: "Conexão pausada." };
  if (a.lastTestStatus === "erro") return { estado: "erro", texto: "A última verificação de credencial falhou." };
  return { estado: "ativa", texto: "Conectada." };
}
