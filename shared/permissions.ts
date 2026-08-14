/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — roles & permissões (fonte única, usada no client E no server)
 * ─────────────────────────────────────────────────────────────────────────────
 *  admin      (Administrativo) → tudo
 *  developer  (Desenvolvedor)  → uso geral + gerenciar News/SelvaTV
 *  user       (Colaborador)    → uso geral
 *
 *  Toda decisão sensível é validada TAMBÉM no backend (adminProcedure etc.).
 *  O frontend usa isto só para esconder/mostrar UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type Role = "admin" | "developer" | "user";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrativo",
  developer: "Desenvolvedor",
  user: "Colaborador",
};

export const ROLES: Role[] = ["admin", "developer", "user"];

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "developer" || value === "user";
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
 * Editar as Prioridades da Semana na Home.
 *
 * ── Por que isto lê `operationalRole`, e é o único que lê ──────────────────
 * "Coordenador" já existia no sistema, mas como RESPONSABILIDADE (por quais
 * clientes a pessoa responde), não como permissão — o enum `role` tem três
 * valores e é consultado por quase tudo. Acrescentar um quarto valor obrigaria
 * a revisar cada verificação existente para decidir de que lado o coordenador
 * cai, e o custo de errar uma delas é um vazamento de acesso silencioso.
 *
 * Conceder por `operationalRole` mantém `role` intacto e dá exatamente a
 * autorização pedida: o coordenador escreve no quadro da semana e em nada mais.
 * Ele NÃO vira admin — nenhuma outra função deste arquivo o consulta.
 */
export function canManagePriorities(r: unknown, operational?: unknown): boolean {
  const x = role(r);
  return x === "admin" || x === "developer" || operational === "coordinator";
}

/** Gerenciar colaboradores (CRUD, reset de senha). Somente admin. */
export function canManagePeople(r: unknown): boolean {
  return role(r) === "admin";
}
