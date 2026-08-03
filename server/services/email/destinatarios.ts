/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Destinatários de e-mail automático — fase restrita admin/dev
 * ─────────────────────────────────────────────────────────────────────────────
 *  O incidente original não foi de conteúdo: foi de DESTINATÁRIO. O sistema
 *  mandou e-mail para gente que não devia receber, e a lista tinha sido decidida
 *  em outro lugar (uma constante no código, um desvio de env) que ninguém
 *  revisava. Religar a automação sem resolver isso repetiria o mesmo erro, só
 *  que por outro transporte.
 *
 *  A regra desta fase: **só admin e developer recebem e-mail automático.**
 *
 *  ── Por que VALIDAR em vez de FILTRAR ──────────────────────────────────────
 *  A tentação é filtrar a lista e mandar para o que sobrou. Não fazemos isso:
 *  filtrar em silêncio transforma um erro de configuração num envio parcial que
 *  parece ter dado certo — ninguém investiga o que não reclama. Um destinatário
 *  fora da lista bloqueia o envio INTEIRO e vira registro `blocked`, com nome e
 *  motivo. É barulhento de propósito.
 *
 *  ── `role` ≠ `operationalRole` ─────────────────────────────────────────────
 *  Um coordenador de cliente é `role=user` + `operationalRole=coordinator`. Os
 *  dois eixos são independentes, e só o `role` concede permissão. Coordenador
 *  NÃO recebe nesta fase, mesmo sendo o destinatário natural de alerta de site.
 *  Quem decide é `canManageContent`, a mesma fonte que o resto do sistema usa —
 *  uma segunda definição de "quem é admin" acabaria divergindo da primeira.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { canManageContent } from "@shared/permissions";
import { usuariosAtivosComEmail } from "../../db";

/** Único modo aceito nesta fase. `all` e `clients` são recusados de propósito. */
export const MODO_ADMIN_DEV = "admin_dev";
export type ModoDestinatarios = typeof MODO_ADMIN_DEV;

export interface PessoaPermitida {
  id: number;
  nome: string | null;
  email: string;
  role: string | null;
}

/**
 * Normalização única para comparar endereços. Sem isto,
 * "Felberg@Selva.agency " e "felberg@selva.agency" seriam pessoas diferentes, e
 * a validação bloquearia um destinatário legítimo — ou, pior, deixaria passar
 * um que só *parece* estar na lista.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Modo em vigor. Qualquer valor que não seja `admin_dev` — inclusive ausência,
 * `all` e `clients` — devolve null, e null NÃO envia.
 *
 * Recusar `all` explicitamente (em vez de só não implementar) é o que impede
 * alguém de "destravar" a fase escrevendo o valor óbvio no Railway.
 */
export function modoDestinatarios(): ModoDestinatarios | null {
  const v = (process.env.EMAIL_RECIPIENT_MODE || "").trim().toLowerCase();
  return v === MODO_ADMIN_DEV ? MODO_ADMIN_DEV : null;
}

/** Frase única explicando por que o modo não vale — a UI mostra isto. */
export function porqueModoInvalido(): string | null {
  const bruto = (process.env.EMAIL_RECIPIENT_MODE || "").trim();
  if (!bruto) return "EMAIL_RECIPIENT_MODE não definida. Nesta fase o único valor aceito é admin_dev.";
  if (modoDestinatarios()) return null;
  return `EMAIL_RECIPIENT_MODE="${bruto}" não é aceita nesta fase. Use admin_dev.`;
}

/**
 * Quem PODE receber e-mail automático agora: usuários ativos, não excluídos,
 * com e-mail, cujo `role` é admin ou developer.
 *
 * Reaproveita `usuariosAtivosComEmail()` (já filtra active + deletedAt + e-mail
 * não nulo) em vez de escrever outra consulta — duas definições de "usuário
 * ativo" divergiriam na primeira mudança de regra.
 */
export async function resolverDestinatariosAdminDev(): Promise<PessoaPermitida[]> {
  const ativos = await usuariosAtivosComEmail();
  const vistos = new Set<string>();
  const permitidos: PessoaPermitida[] = [];

  for (const u of ativos) {
    if (!canManageContent(u.role)) continue;      // corta user/colaborador e coordenador
    const email = normalizarEmail(u.email ?? "");
    if (!email) continue;                          // sem e-mail não é destinatário
    if (vistos.has(email)) continue;               // dedup por endereço, não por id
    vistos.add(email);
    permitidos.push({ id: u.id, nome: u.name, email, role: u.role });
  }
  return permitidos;
}

export interface ResultadoValidacao {
  ok: boolean;
  /** Endereços pedidos que NÃO estão na lista permitida. */
  invalidos: string[];
  /** Endereços pedidos que passaram (normalizados). */
  validos: string[];
}

/**
 * Confere TODOS os destinatários pedidos contra a lista permitida. Puro de
 * propósito: a regra mais sensível do sistema tem que ser testável sem banco,
 * sem rede e sem env.
 *
 * Um único inválido derruba o lote inteiro (`ok: false`) — ver o cabeçalho.
 */
export function validarDestinatarios(pedidos: string[], permitidos: string[]): ResultadoValidacao {
  const lista = new Set(permitidos.map(normalizarEmail));
  const validos: string[] = [];
  const invalidos: string[] = [];

  for (const p of pedidos) {
    const e = normalizarEmail(p);
    if (!e) continue;
    (lista.has(e) ? validos : invalidos).push(e);
  }
  return { ok: invalidos.length === 0, invalidos, validos };
}

/**
 * ─── Simulação, sem enviar nada ─────────────────────────────────────────────
 * Responde "se a automação fosse ligada AGORA, quem receberia e quem seria
 * bloqueado?" — lendo o estado real (banco + envs), mas sem tocar em transporte
 * nenhum.
 *
 * Existe para a decisão de religar ser tomada olhando nomes, não a promessa de
 * que a regra funciona. Quem só vê "trava implementada" não descobre que um
 * coordenador continuava na lista.
 */
export interface SimulacaoDestinatarios {
  modo: ModoDestinatarios | null;
  modoBruto: string | null;
  porqueModoInvalido: string | null;
  /** Quem receberia e-mail automático hoje. */
  receberiam: PessoaPermitida[];
  /** Ativos com e-mail que NÃO passam — com o motivo em linguagem de gente. */
  bloqueados: { id: number; nome: string | null; email: string; role: string | null; motivo: string }[];
  totalAtivosComEmail: number;
}

export async function simularDestinatarios(): Promise<SimulacaoDestinatarios> {
  const ativos = await usuariosAtivosComEmail();
  const receberiam = await resolverDestinatariosAdminDev();
  const permitidos = new Set(receberiam.map((p) => p.email));

  const bloqueados = ativos
    .filter((u) => !permitidos.has(normalizarEmail(u.email ?? "")))
    .map((u) => ({
      id: u.id,
      nome: u.name,
      email: normalizarEmail(u.email ?? ""),
      role: u.role,
      // O caso do coordenador merece nome próprio: ele é o destinatário natural
      // de alerta de site, e ver "role user" sem contexto parece engano.
      motivo: canManageContent(u.role)
        ? "sem e-mail utilizável"
        : `role "${u.role ?? "user"}" — só admin e developer recebem nesta fase`,
    }));

  return {
    modo: modoDestinatarios(),
    modoBruto: process.env.EMAIL_RECIPIENT_MODE || null,
    porqueModoInvalido: porqueModoInvalido(),
    receberiam,
    bloqueados,
    totalAtivosComEmail: ativos.length,
  };
}
