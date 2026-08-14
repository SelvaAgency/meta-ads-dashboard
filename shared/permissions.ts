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

/** Gerenciar colaboradores (CRUD, reset de senha). Somente admin. */
export function canManagePeople(r: unknown): boolean {
  return role(r) === "admin";
}
