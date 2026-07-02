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

/** Gerenciar colaboradores (CRUD, reset de senha). Somente admin. */
export function canManagePeople(r: unknown): boolean {
  return role(r) === "admin";
}
