/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — roles & permissões (fonte única, usada no client E no server)
 * ─────────────────────────────────────────────────────────────────────────────
 *  admin        (Administrativo) → tudo
 *  developer    (Desenvolvedor)  → uso geral + gerenciar News/SelvaTV
 *  coordinator  (Coordenador)    → uso geral + gerenciar Prioridades da Semana
 *  user         (Colaborador)    → uso geral
 *
 *  Toda decisão sensível é validada TAMBÉM no backend (adminProcedure etc.).
 *  O frontend usa isto só para esconder/mostrar UI.
 *
 *  ── Por que acrescentar um role aqui foi seguro ────────────────────────────
 *  Porque TODA verificação deste arquivo (e do resto do sistema) é ALLOWLIST:
 *  ela pergunta "é admin?" ou "é admin ou dev?", nunca "não é colaborador?".
 *  Auditado em 14/08/2026 — não existe um só `role !== "user"` na base.
 *
 *  A consequência é a garantia que sustenta o coordenador: um valor novo cai
 *  FORA de toda permissão existente por construção, e não por alguém ter
 *  lembrado de excluí-lo caso a caso. Se algum dia aparecer a primeira negativa
 *  ("todo mundo menos colaborador"), essa garantia acaba — e o próximo role
 *  passa a exigir a revisão que este não exigiu.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type Role = "admin" | "developer" | "coordinator" | "user";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrativo",
  developer: "Desenvolvedor",
  coordinator: "Coordenador",
  user: "Colaborador",
};

/** Na ordem da hierarquia — é a ordem que os seletores da interface mostram. */
export const ROLES: Role[] = ["admin", "developer", "coordinator", "user"];

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "developer"
    || value === "coordinator" || value === "user";
}

function role(r: unknown): Role {
  return isRole(r) ? r : "user";
}

/** Administrativo: Financeiro, Contratos, Propostas, Gerenciar Colaboradores. */
export function canAccessAdmin(r: unknown): boolean {
  return role(r) === "admin";
}

/** Gerenciar conteúdo operacional: News bar e SelvaTV. */
export function canManageContent(r: unknown): boolean {
  const x = role(r);
  return x === "admin" || x === "developer";
}

/**
 * Gerenciar as Prioridades da Semana: criar, editar, excluir, atribuir.
 *
 * A ÚNICA permissão do sistema que o coordenador tem além do uso geral. Ela é
 * uma lista de três valores escritos por extenso, e não `!== "user"`, justamente
 * para o dia em que um quinto role aparecer: a forma negativa o incluiria aqui
 * sem ninguém decidir isso.
 */
export function canManagePriorities(r: unknown): boolean {
  const x = role(r);
  return x === "admin" || x === "developer" || x === "coordinator";
}

/**
 * Configurações do Tracker/BIT: contas, tokens, importação, duplicatas.
 *
 * ── Por que não é `canManageContent` ───────────────────────────────────────
 * Porque `canManageContent` governa OUTRAS áreas — Consumo de IA, Panorama,
 * Rascunho, a barra de News, a SelvaTV — e todas elas seguem admin/dev.
 * Ampliá-la para liberar Configurações abriria as cinco de uma vez, sem
 * ninguém ter decidido isso.
 *
 * Uma permissão nova por área é o preço de conseguir mexer numa sem mexer nas
 * outras. Este arquivo já tinha três predicados por esse mesmo motivo.
 *
 * ── A forma continua sendo allowlist ───────────────────────────────────────
 * Três valores escritos por extenso, e não `!== "user"`. A garantia que
 * sustenta o coordenador é que um role novo cai FORA de toda permissão por
 * construção — a forma negativa o incluiria aqui sem ninguém decidir.
 */
export function canAccessTrackerSettings(r: unknown): boolean {
  const x = role(r);
  return x === "admin" || x === "developer" || x === "coordinator";
}

/**
 * Página Acessos: criar, editar e desativar clientes e credenciais.
 *
 * ── Por que é um predicado próprio, e não `canManageContent` ───────────────
 * Pelo mesmo motivo de `canAccessTrackerSettings`: `canManageContent` governa
 * Consumo de IA, Rascunho, Panorama, News e SelvaTV. Ampliá-la para liberar
 * Acessos abriria as cinco de uma vez, sem ninguém ter decidido isso.
 *
 * Uma permissão por área é o preço de conseguir mexer numa sem mexer nas
 * outras — e é por isso que este arquivo tem uma função por área em vez de
 * dois níveis genéricos.
 *
 * ── Não é permissão administrativa ────────────────────────────────────────
 * O coordenador ganha o que admin e dev já podiam fazer NESTA página, e nada
 * além: `canAccessAdmin` e `canManagePeople` continuam cegos a ele.
 */
export function canManageAccesses(r: unknown): boolean {
  const x = role(r);
  return x === "admin" || x === "developer" || x === "coordinator";
}

/** Gerenciar colaboradores (CRUD, reset de senha). Somente admin. */
export function canManagePeople(r: unknown): boolean {
  return role(r) === "admin";
}
