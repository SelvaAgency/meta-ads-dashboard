import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { comGatilho } from "./contextoDeGatilho";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { canAccessTrackerSettings, canManageAccesses, canAccessLaboratorio, canManageContent, canManagePriorities } from "@shared/permissions";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

// Requer usuário autenticado, mas NÃO bloqueia quem precisa trocar senha.
// Use apenas para auth.changePassword (me/logout são publicProcedure).
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Toda chamada autenticada declara um gatilho MANUAL, com quem a fez
 * ─────────────────────────────────────────────────────────────────────────────
 *  O `path` do tRPC já é o nome exato da ação — `accounts.refreshStatus`,
 *  `accounts.refreshAllStatus`. Usá-lo como `triggerSource` dá a rotina de
 *  graça, e sem uma tabela paralela que alguém precisaria manter.
 *
 *  Declarar aqui e não em cada procedure é o ponto inteiro: a auditoria achou
 *  nove `invokeLLM` que nem `origem` declaravam. Um lugar só significa que uma
 *  procedure nova nasce rastreada sem ninguém lembrar de nada.
 *
 *  Isso NÃO grava nada por si: `ai_geracoes` só ganha linha quando há chamada ao
 *  modelo. Uma consulta de tela declara o gatilho e não deixa rastro nenhum.
 *
 *  Uma rotina interna que se declare mais fundo — o ciclo de sync, por exemplo —
 *  sobrescreve este gatilho, e deve mesmo: ela sabe o próprio nome, e o clique
 *  que a iniciou continua no ator.
 */
const comAtorDaSessao = t.middleware(async ({ ctx, next, path }) => {
  const u = ctx.user;
  if (!u) return next();
  return comGatilho(
    {
      tipo: "manual",
      origem: path,
      ator: { tipo: "user", id: u.id, nome: u.name, papel: u.role },
    },
    () => next(),
  );
});

export const authedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

// Autenticado E com senha em dia. Enquanto mustChangePassword = true, o usuário
// fica travado no fluxo de troca de senha e não acessa nada protegido.
export const protectedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

export const adminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

// Gestão de conteúdo operacional (News bar, SelvaTV): admin OU developer.
/**
 * Gerenciar as Prioridades da Semana — admin, dev ou coordenador.
 *
 * A regra vive em `shared/canManagePriorities`, para a tela esconder o botão
 * pelo MESMO critério que o servidor usa para recusar: dois critérios escritos
 * separados divergem, e a divergência aparece como um botão que existe e não
 * funciona.
 *
 * Coordenador não vira admin: `adminProcedure` e `contentProcedure` continuam
 * perguntando por valores explícitos, e nenhum deles é `coordinator`.
 */
export const prioridadesProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (!canManagePriorities(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Só Administrativo, Desenvolvedor ou Coordenador podem editar as prioridades da semana.",
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

/**
 * Página Acessos: admin, developer OU coordinator.
 *
 * Procedure própria em vez de ampliar `contentProcedure`, que também guarda
 * Consumo de IA, Rascunho, News e SelvaTV — ampliá-la abriria as quatro de uma
 * vez.
 *
 * A regra vem de `canManageAccesses`, a MESMA função que a tela usa para
 * mostrar os botões. Dois critérios escritos separados divergem, e a
 * divergência aparece como um botão que existe e não funciona.
 */
export const accessProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (!canManageAccesses(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

/**
 * Laboratório do LinkedIn: admin + developer.
 *
 * A guarda de UI (`LaboratorioOnly`) evita renderizar; quem PROTEGE é esta.
 * Toda procedure do laboratório nasce aqui — nenhuma nasce em
 * `authedProcedure` "só por enquanto", porque o "por enquanto" de uma área
 * experimental é justamente o que fica.
 */
export const laboratorioProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (!canAccessLaboratorio(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

/**
 * Configurações do Tracker/BIT: admin, developer OU coordinator.
 *
 * Uma procedure própria em vez de ampliar `contentProcedure`, e o motivo é
 * concreto: `contentProcedure` também guarda Consumo de IA, Rascunho, a barra
 * de News e a SelvaTV. Ampliá-la para liberar Configurações abriria as quatro
 * de uma vez, sem ninguém ter decidido isso.
 *
 * A regra vem de `canAccessTrackerSettings` — a MESMA função que a tela usa
 * para mostrar o menu e liberar a página. Dois critérios escritos separados
 * divergem, e a divergência aparece como um botão que existe e não funciona.
 */
export const trackerSettingsProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (!canAccessTrackerSettings(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);

/**
 * Conteúdo operacional e ferramentas internas: admin OU developer.
 *
 * A regra vem de `canManageContent`, e não escrita à mão aqui — pelo mesmo
 * motivo de `prioridadesProcedure` logo acima: a tela esconde o botão pelo
 * MESMO critério que o servidor usa para recusar. Dois critérios escritos
 * separados divergem, e a divergência aparece como um botão que existe e não
 * funciona.
 *
 * Estava duplicado (`role !== "admin" && role !== "developer"`). O comportamento
 * era idêntico — o risco é o dia em que um dos dois mudar sozinho.
 */
export const contentProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (!canManageContent(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(comAtorDaSessao);
