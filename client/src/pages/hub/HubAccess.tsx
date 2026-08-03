/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — Acessos (cofre de credenciais por cliente)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Todos os usuários logados acessam. Senhas ficam cifradas no backend, nunca
 *  vêm em listagens e só são reveladas via endpoint auditado. Nada de senha em
 *  localStorage, log ou URL. A busca cobre nome/plataforma/login/URL/notas/tags
 *  — NUNCA o valor da senha.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from "react";
import { KeyRound, Search, Plus, Building2, Star, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HubShell } from "./HubShell";
import { AccessClientModal } from "./AccessClientModal";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";

function fmtDate(d: string | Date): string {
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

type ClientCard = {
  id: number; name: string; slug: string; isInternal: boolean;
  itemCount: number; platforms: string[]; lastUpdated: string | Date; searchBlob: string;
};

/**
 * ─── A foto do cliente vem do Tracker, não de um upload próprio ──────────────
 * O cofre tem a sua PRÓPRIA tabela de clientes (`access_clients`), criada
 * digitando um nome. Não há vínculo com `meta_ad_accounts`, e os slugs não
 * batem: "Ultra Malhas" vira `ultra-malhas` aqui e é `ultramalhas` lá;
 * "Scaffold Play" vira `scaffold-play` e é `play`.
 *
 * Por isso o casamento é por NOME normalizado (sem acento, caixa ou separador).
 * É exato depois da normalização — não é busca aproximada, então não corre o
 * risco de trocar um cliente por outro de nome parecido.
 *
 * A alternativa seria dar upload próprio ao cofre. Seria sempre "certo", e
 * exatamente por isso é pior: a mesma logo passaria a existir em dois lugares,
 * e na primeira troca de marca alguém atualizaria só um. Aqui existe UMA foto
 * por cliente, trocada nas Configurações do Tracker.
 *
 * Quem não casa não fica feio: cai nas iniciais, que já é melhor do que o ícone
 * genérico que todos os cards tinham antes.
 */
function chaveDeNome(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : nome.trim().slice(0, 2);
  return (letras || "?").toUpperCase();
}

function ClientCardView({ c, foto, onOpen, highlight = false }: {
  c: ClientCard; foto?: string | null; onOpen: () => void; highlight?: boolean;
}) {
  return (
    <button
      onClick={onOpen}
      className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm hover:border-accent/40 ${
        highlight ? "border-accent/40 bg-primary/[0.06]" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold ${highlight ? "bg-primary/25 text-accent" : "bg-muted text-muted-foreground"}`}>
          {foto
            ? <img src={foto} alt="" className="w-full h-full object-cover" />
            : highlight ? <Star className="w-4 h-4" />
            : c.name ? iniciaisDe(c.name)
            : <Building2 className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{c.name}</p>
          <p className="text-[11px] text-muted-foreground">{c.itemCount} acesso{c.itemCount === 1 ? "" : "s"} · atualizado {fmtDate(c.lastUpdated)}</p>
        </div>
      </div>
      {c.platforms.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {c.platforms.map((p) => (
            <Badge key={p} variant="secondary" className="text-[10px] font-normal">{p}</Badge>
          ))}
        </div>
      )}
    </button>
  );
}

export default function HubAccess() {
  const { user } = useAuth();
  // Só admin/developer criam/editam/excluem. Colaborador (user) só visualiza.
  const canEdit = canManageContent((user as { role?: string } | null)?.role);
  const utils = trpc.useUtils();
  const status = trpc.access.status.useQuery(undefined, { retry: false });
  const clientsQ = trpc.access.clientsList.useQuery(undefined, { retry: false });

  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState<{ id: number; name: string; isInternal: boolean } | null>(null);

  const createClient = trpc.access.createClient.useMutation({
    onSuccess: () => { utils.access.clientsList.invalidate(); setAdding(false); setNewName(""); },
  });

  /**
   * Mapa nome-normalizado → foto, montado do mesmo lugar que a sidebar do
   * Tracker usa. `clientAccounts` já resolve a precedência (foto enviada à mão
   * > foto da Meta), então aqui não há segunda regra para divergir da primeira.
   */
  const { clientAccounts } = useActiveAccount();
  const fotoPorNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const { client, accounts } of clientAccounts) {
      const foto = client.pictureUrl ?? accounts[0]?.pictureUrl ?? null;
      if (!foto) continue;
      m.set(chaveDeNome(client.name), foto);
      // O nome da conta da Meta às vezes difere do nome de exibição
      // ("BAESH" vs "BAESH - Trafego"); indexar os dois aumenta o acerto sem
      // afrouxar a comparação, que continua exata depois de normalizada.
      for (const a of accounts) if (a.accountName) m.set(chaveDeNome(a.accountName), foto);
    }
    return m;
  }, [clientAccounts]);
  const fotoDe = (nome: string) => fotoPorNome.get(chaveDeNome(nome)) ?? null;

  const clients = (clientsQ.data ?? []) as ClientCard[];
  const q = search.trim().toLowerCase();
  const filtered = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.searchBlob.includes(q)) : clients;
  const internal = filtered.filter((c) => c.isInternal);
  const others = filtered.filter((c) => !c.isInternal);

  const encReady = status.data?.encryptionReady ?? true;

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Acessos</h1>
              <p className="text-sm text-muted-foreground">Credenciais dos clientes — organizadas e seguras.</p>
            </div>
          </header>

          {status.data && !encReady && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
              Cofre em modo limitado: defina <code>ACCESS_SECRETS_ENCRYPTION_KEY</code> no servidor para adicionar/revelar senhas.
            </div>
          )}

          {/* Busca + adicionar cliente */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, plataforma, login, URL, tag…" className="pl-9" />
            </div>
            {canEdit && (adding ? (
              <div className="flex items-center gap-2">
                <Input autoFocus value={newName} placeholder="Nome do cliente" onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createClient.mutate({ name: newName.trim() }); }} className="w-48" />
                <button onClick={() => newName.trim() && createClient.mutate({ name: newName.trim() })} disabled={createClient.isPending || !newName.trim()}
                  className="rounded-lg bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:opacity-90 disabled:opacity-60">Salvar</button>
                <button onClick={() => { setAdding(false); setNewName(""); }} className="text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 flex-shrink-0">
                <Plus className="w-4 h-4" /> Adicionar cliente
              </button>
            ))}
          </div>

          {clientsQ.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
          )}

          {/* Destaque: SELVA Agency (cliente interno) */}
          {internal.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {internal.map((c) => (
                <ClientCardView key={c.id} c={c} foto={fotoDe(c.name)} highlight onOpen={() => setOpen({ id: c.id, name: c.name, isInternal: c.isInternal })} />
              ))}
            </div>
          )}

          {/* Demais clientes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {others.map((c) => (
              <ClientCardView key={c.id} c={c} foto={fotoDe(c.name)} onOpen={() => setOpen({ id: c.id, name: c.name, isInternal: c.isInternal })} />
            ))}
          </div>
          {!clientsQ.isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </div>
      </main>

      {open && (
        <AccessClientModal
          clientId={open.id}
          clientName={open.name}
          isInternal={open.isInternal}
          encryptionReady={encReady}
          canEdit={canEdit}
          foto={fotoDe(open.name)}
          onClose={() => setOpen(null)}
        />
      )}
    </HubShell>
  );
}
