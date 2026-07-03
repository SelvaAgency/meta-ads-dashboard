import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

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
