/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — Troca de senha (primeiro acesso ou voluntária)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Página cheia (fora da shell). No primeiro acesso, o usuário é obrigado a
 *  criar uma nova senha antes de entrar no Selva Spaces. Enquanto
 *  mustChangePassword = true, o backend bloqueia todo recurso protegido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePassword() {
  const { user, loading, isAuthenticated, refresh } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mustChange = !!(user as { mustChangePassword?: boolean } | null)?.mustChangePassword;

  // Se já está em dia (não precisa trocar), não faz sentido ficar aqui.
  useEffect(() => {
    if (isAuthenticated && !loading && !mustChange) navigate("/", { replace: true });
  }, [isAuthenticated, loading, mustChange, navigate]);

  const mutation = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await refresh();
      navigate("/", { replace: true });
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("A nova senha deve ter pelo menos 8 caracteres.");
    if (next !== confirm) return setError("As senhas não coincidem.");
    mutation.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="w-12 h-12 rounded-xl bg-primary/20 text-accent flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" />
          </span>
          <h1 className="text-xl font-bold">Crie uma nova senha</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Primeiro acesso ao Selva Spaces — defina sua senha para continuar.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Senha temporária (atual)</Label>
            <Input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Nova senha</Label>
            <Input type="password" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Confirme a nova senha</Label>
            <Input type="password" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} required />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar e entrar
          </button>
        </form>
      </div>
    </div>
  );
}
