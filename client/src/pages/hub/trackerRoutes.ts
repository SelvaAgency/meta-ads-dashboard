/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rotas internas do Tracker — fonte única
 * ─────────────────────────────────────────────────────────────────────────────
 *  Estas rotas renderizam a página CRUA do Tracker (MetaDashboardLayout, sem o
 *  shell do Spaces). Elas existem para serem navegadas DENTRO do iframe.
 *
 *  No topo (janela principal) elas não podem abrir sozinhas: a regra do produto
 *  é que nada interno funciona como app solto. Quem chega numa delas pela barra
 *  de endereço — ou por um deep-link de alerta — é levado para o shell do
 *  Spaces, que então carrega a MESMA rota dentro do iframe.
 *
 *      topo:  /site?account=4&aba=seguranca
 *        ↓    (redireciona, preservando a query)
 *      topo:  /tracker?rota=/site&account=4&aba=seguranca
 *        ↓    (HubApp monta o shell)
 *      iframe: /site?account=4&aba=seguranca   → aqui renderiza cru
 *
 *  Os ~500 alertas em produção apontam para as rotas cruas (/site?account=…).
 *  É por isso que o redirect PRESERVA a query: sem isso, todo deep-link de
 *  alerta viraria "Tracker genérico" e o alerta perderia o destino.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Rotas cruas do Tracker. Ver App.tsx — devem bater com as rotas registradas. */
export const ROTAS_INTERNAS = [
  "/overview",
  "/panorama",
  "/dashboard",
  "/campaigns",
  "/site",
  "/clarity",
  "/suggestions",
  "/admin",
  "/social-networks",
  "/experiments",
  /**
   * A bancada de peças fora de produção.
   *
   * Precisa estar AQUI, e não só registrada em `App.tsx`: uma rota crua que não
   * consta desta lista redireciona para o shell, e o shell a recusa em
   * `rotaInternaSegura` — quem digita /rascunho cai no Tracker genérico, sem
   * erro nenhum na tela. Foi exatamente o que aconteceu.
   *
   * A allowlist não é sobre permissão de usuário: ela impede que `?rota=` vire
   * `src` de iframe apontando para fora do domínio. Tirar a lista para resolver
   * acesso trocaria um caminho quebrado por um buraco de segurança.
   */
  "/rascunho",
  /**
   * O Laboratório do LinkedIn — bancada da Fase 1, ao lado do Rascunho.
   *
   * Precisa estar AQUI pelo mesmo motivo que o Rascunho: ele mora na sidebar do
   * Tracker, dentro da caixa "Oculto para colaboradores", e só navega dentro do
   * iframe se a rota constar desta lista. Fora dela, quem clicasse no item da
   * sidebar cairia no Tracker genérico, sem erro nenhum na tela.
   *
   * Ele NÃO é página do Administrador do Spaces — essa é a distinção com
   * `/consumo-ia`, que saiu desta lista justamente por ser do portal.
   */
  "/linkedin-lab",
  /*
   * ── O que saiu daqui ──────────────────────────────────────────────────────
   * `/consumo-ia`. Ela era interna, e por isso a barra de endereço mostrava
   * `/tracker?rota=%2Fconsumo-ia`: estar nesta lista é justamente o que faz
   * `Interna` redirecionar para o shell em vez de deixar a rota abrir sozinha.
   *
   * Ela virou rota de primeiro nível (ver `App.tsx`) porque não é página do
   * Tracker: não tem conta ativa, não usa o seletor de cliente e fala do gasto
   * do próprio Spaces. Deixá-la aqui manteria o redirect vivo e desfaria a
   * correção em silêncio — a rota existiria em `App.tsx` e nunca seria
   * alcançada no topo.
   */
  // Configurações do Tracker — é onde o hub de Conexões mora. Precisa estar na
  // allowlist porque as rotas aposentadas (/google-ads, /ga4, /lojas) mandam
  // para cá pelo shell: /tracker?rota=/settings&painel=conexoes.
  "/settings",
  // Rotas aposentadas: continuam válidas só para redirecionar para Conexões.
  // Sair da allowlist quebraria os deep-links antigos e o retorno do OAuth do
  // Google, que ainda chega como /tracker?rota=/ga4.
  "/conexoes",
  "/google-ads",
  "/ga4",
  "/lojas",
] as const;

/** /experiments/42 é interna também — é a única rota interna com parâmetro. */
const COM_PARAMETRO = /^\/experiments\/[^/]+$/;

export function ehRotaInterna(pathname: string): boolean {
  return (ROTAS_INTERNAS as readonly string[]).includes(pathname) || COM_PARAMETRO.test(pathname);
}

/** Para onde mandar quem abriu uma rota crua no topo. Preserva a query. */
export function urlDoShellPara(pathname: string, busca: string): string {
  const p = new URLSearchParams(busca);
  p.set("rota", pathname);
  return `/tracker?${p.toString()}`;
}

/**
 * `?rota=` vira `src` de iframe, então é entrada não confiável: um valor como
 * `https://exemplo.com` ou `//exemplo.com` embutiria um site de terceiro dentro
 * do Spaces, com a sessão do usuário na tela. Só caminho da allowlist passa —
 * qualquer outra coisa vira null e cai no Tracker geral.
 */
export function rotaInternaSegura(bruta: string | null | undefined): string | null {
  if (!bruta) return null;
  if (!bruta.startsWith("/") || bruta.startsWith("//")) return null; // absoluta ou protocolo-relativa
  const [caminho] = bruta.split("?"); // ignora query embutida no próprio param
  return ehRotaInterna(caminho) ? caminho : null;
}

/**
 * URL que o iframe carrega: a rota interna + a query original, menos o `rota`
 * (que é instrução para o shell, não para o app de dentro). O resto passa
 * inteiro — é assim que `account`/`aba` dos alertas, e o `client` do flyout,
 * atravessam a fronteira do iframe. Nada mais atravessa: o iframe é outro
 * documento, e o estado do React do Spaces não chega lá.
 */
export function urlEmbutidaPara(rota: string, busca: string): string {
  const p = new URLSearchParams(busca);
  p.delete("rota");
  const qs = p.toString();
  return qs ? `${rota}?${qs}` : rota;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rotas que DEIXARAM de ser internas — e para onde o link antigo deve ir
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sair da allowlist resolve a URL nova e abandona a antiga: `?rota=` deixa de
 *  ser reconhecido, `rotaInternaSegura` devolve `null`, e o shell abre o Tracker
 *  genérico. Sem erro, sem 404 — a página errada com ar de acerto, que é
 *  exatamente o modo de falha que a allowlist já causou uma vez com `/rascunho`.
 *
 *  Um favorito de ontem tem de continuar chegando ao mesmo lugar. Este mapa é
 *  quem garante isso, e some quando ninguém mais tiver o link velho.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const INTERNAS_APOSENTADAS: Record<string, string> = {
  "/consumo-ia": "/consumo-ia",
};

/**
 * Para onde mandar um `/tracker?rota=X` cuja rota virou de primeiro nível.
 *
 * `null` quando não é o caso — que é o normal, e deixa o shell seguir seu curso.
 * A query é descartada: `rota` é instrução do shell, e nenhuma das rotas
 * aposentadas até aqui lê parâmetro nenhum.
 */
export function destinoDeInternaAposentada(bruta: string | null | undefined): string | null {
  if (!bruta) return null;
  const [caminho] = bruta.split("?");
  return INTERNAS_APOSENTADAS[caminho] ?? null;
}

/** Onde o hub de Conexões mora de verdade: um painel de Configurações. */
export const ROTA_CONEXOES = "/settings";

/**
 * Destino de quem caiu numa rota aposentada de conexão (/google-ads, /ga4,
 * /lojas) ou pediu /conexoes direto.
 *
 * Dentro do iframe basta navegar. NO TOPO é obrigatório passar pelo shell: a
 * rota /settings no topo renderiza as configurações do PORTAL, não as do
 * Tracker — mandar para lá direto entregaria a tela errada com ar de acerto.
 *
 * A query original é preservada (o `?account=` de link antigo, o `?conectado=1`
 * do OAuth) e o `rota=` é descartado: ele é instrução do shell, não do app.
 */
export function destinoDeConexoes(busca: string, embutido: boolean): string {
  const p = new URLSearchParams(busca);
  p.delete("rota");
  p.set("painel", "conexoes");
  const qs = `?${p.toString()}`;
  return embutido ? `${ROTA_CONEXOES}${qs}` : urlDoShellPara(ROTA_CONEXOES, qs);
}

/**
 * A outra ponta de `destinoDeConexoes`: a tela de Configurações pergunta aqui
 * se deve abrir o hub já expandido. Mora no MESMO módulo de propósito — quem
 * escreve o parâmetro e quem o lê não podem divergir sem quebrar um teste.
 */
export function pediuConexoes(busca: string): boolean {
  return new URLSearchParams(busca).get("painel") === "conexoes";
}
