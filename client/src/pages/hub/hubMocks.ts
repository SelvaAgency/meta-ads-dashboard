/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  /hub — MOCKS & ADAPTERS  (experimental portal · descartável)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Camada isolada de dados falsos. Cada função abaixo é um "adapter" simples:
 *  hoje devolve mock local, amanhã basta trocar o corpo por uma chamada real
 *  (tRPC / Google Calendar / Trello / storage) mantendo a mesma assinatura.
 *
 *  NADA aqui toca em APIs reais, auth, banco ou permissões globais.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface AgendaEvent {
  time: string;
  title: string;
  free?: boolean;
}

export interface TrelloCard {
  id: string;
  title: string;
  done?: boolean;
}

export interface SelvaTVImage {
  id: string;
  src: string;
  alt: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export interface NewsItem {
  id: string;
  text: string;
}

// ─── Google Calendar (mock) ──────────────────────────────────────────────────
// TROCAR DEPOIS: substituir por integração real do Google Calendar.
// Manter o retorno como AgendaEvent[] para não impactar a UI.
export function getAgendaEvents(): AgendaEvent[] {
  return [
    { time: "10:00", title: "Reunião LACLIMA" },
    { time: "14:30", title: "Alinhamento interno" },
    { time: "16:30", title: "Livre", free: true },
  ];
}

// ─── Trello (mock) ───────────────────────────────────────────────────────────
// TROCAR DEPOIS: substituir por integração real do Trello (cards do usuário).
export function getTrelloCards(): TrelloCard[] {
  return [
    { id: "c1", title: "Ajustar CEP no form de compra" },
    { id: "c2", title: "Revisar carrossel de depoimentos" },
    { id: "c3", title: "Corrigir tag na Elementor" },
  ];
}

// ─── SelvaTV (mock) ──────────────────────────────────────────────────────────
// Começa VAZIO de propósito → a seção sai da tela sem deixar espaço morto.
// Para testar banner estático: deixe 1 item. Para testar carrossel: 2+ itens.
// TROCAR DEPOIS: buscar de admin / banco / storage (ex.: S3) mantendo o tipo.
export function getSelvaTVImages(): SelvaTVImage[] {
  return [
    // ── Exemplos comentados (descomente para testar) ──────────────────────────
    // {
    //   id: "tv1",
    //   src: "https://placehold.co/1200x400/0A0A0A/F5ADCC?text=SelvaTV+1",
    //   alt: "Entrega em destaque 1",
    //   eyebrow: "SelvaTV",
    //   title: "Entregas em destaque da semana",
    //   subtitle: "Case LACLIMA no ar",
    // },
    // {
    //   id: "tv2",
    //   src: "https://placehold.co/1200x400/E87AB0/0A0A0A?text=SelvaTV+2",
    //   alt: "Entrega em destaque 2",
    //   eyebrow: "SelvaTV",
    //   title: "Novo case publicado",
    //   subtitle: "Spin Gaming",
    // },
  ];
}

// ─── Barra de notícias (mock) ────────────────────────────────────────────────
// TROCAR DEPOIS: conteúdo inserido por admin ou via RSS.
export function getNews(): NewsItem[] {
  return [
    { id: "n1", text: "Copa América: confira a tabela de jogos da semana" },
    { id: "n2", text: "Novo case publicado: LACLIMA" },
  ];
}

// ─── Roles / permissões (stub) ───────────────────────────────────────────────
// Preparado de forma DISCRETA para o futuro: apenas roles autorizadas poderão
// importar imagens do SelvaTV. Por enquanto não implementa upload nenhum —
// só expõe o ponto de decisão para quando a feature real existir.
const SELVATV_ROLES = new Set(["admin", "manager"]);

export function canImportSelvaTV(user: { role?: string | null } | null | undefined): boolean {
  return !!user?.role && SELVATV_ROLES.has(user.role);
}

// ─── Utils de saudação ───────────────────────────────────────────────────────

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function firstName(name: string | null | undefined): string {
  if (!name) return "Selva";
  return name.trim().split(/\s+/)[0];
}
