import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { canManagePriorities } from "@shared/permissions";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

// Requer usuário autenticado, mas NÃO bloqueia quem precisa trocar senha.
// Use apenas para auth.changePassword (me/logout são publicProcedure).
export const authedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

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
);

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
);

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
);

export const contentProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.user.mustChangePassword) {
      throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED });
    }
    if (ctx.user.role !== "admin" && ctx.user.role !== "developer") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
