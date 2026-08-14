/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os quatro atalhos do Spaces — um destino, dois nomes
 * ─────────────────────────────────────────────────────────────────────────────
 *  Eles aparecem em dois lugares com aparências diferentes: os cartões da Home
 *  (ícones lucide, nome por extenso) e as bolas do slide DVD (marcas SELVA,
 *  nome curto). O que NÃO pode divergir é o destino — e duas listas separadas
 *  divergem: alguém troca a rota num lugar, o outro continua apontando para a
 *  antiga, e o bug só aparece quando alguém clica no lugar menos usado.
 *
 *  ── Por que dois nomes e não um truncado ───────────────────────────────────
 *  "Brand Intelligent Tracker (BIT)" cabe num cartão de um quarto de largura em
 *  duas linhas, e não cabe numa bola de 56px. Cortar com reticências produziria
 *  "Brand Intellig…", que não é nome de nada. São dois nomes porque são dois
 *  espaços, e cada um recebe o que cabe nele.
 *
 *  Os ÍCONES continuam em cada arquivo: a Home usa lucide e o DVD usa as marcas
 *  geométricas da SELVA. São linguagens visuais diferentes de propósito, e
 *  unificá-las aqui obrigaria um dos dois a abrir mão da sua.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Atalho {
  key: "tracker" | "reports" | "access" | "settings";
  href: string;
  /** O nome por extenso — cartões da Home. */
  nome: string;
  /** O nome curto — bolas do slide DVD, onde não cabe mais que uma palavra. */
  nomeCurto: string;
  /** Uma frase, para o `title` do cartão. */
  descricao: string;
}

export const ATALHOS: readonly Atalho[] = [
  {
    key: "tracker",
    href: "/tracker",
    nome: "Brand Intelligent Tracker (BIT)",
    nomeCurto: "BIT",
    descricao: "O robô de performance da SELVA.",
  },
  {
    key: "reports",
    href: "/reports",
    nome: "Gerador de Relatórios",
    nomeCurto: "Relatórios",
    descricao: "Gere relatórios prontos para o cliente.",
  },
  {
    key: "access",
    href: "/access",
    nome: "Acessos",
    nomeCurto: "Acessos",
    descricao: "Credenciais dos clientes — organizadas e seguras.",
  },
  {
    key: "settings",
    href: "/settings",
    nome: "Configurações",
    nomeCurto: "Configurações",
    descricao: "Personalize seu SELVA Spaces.",
  },
] as const;
