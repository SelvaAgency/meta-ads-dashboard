/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Aba Monitoramento — ligar o robô e ver o que ele viu
 * ─────────────────────────────────────────────────────────────────────────────
 *  Aba dentro de Site, e não página nova: o robô responde a uma pergunta sobre
 *  o site do cliente, e separá-la em outro lugar criaria dois endereços para
 *  "como está o site" — que é como uma tela deixa de ser consultada.
 *
 *  ── Ligar aqui, e não por SQL ──────────────────────────────────────────────
 *  O `ativo` nasce desligado e não existe caminho por onde um cliente entre
 *  sozinho. Ligar é decisão explícita, e o lugar certo para tomá-la é onde a
 *  primeira leitura aparece logo em seguida — senão liga-se no escuro.
 *
 *  ── Quem vê e quem mexe ────────────────────────────────────────────────────
 *  A aba é visível para quem recebe o alerta (admin, dev e coordenador do
 *  cliente): mandar alguém para uma aba que não existe seria pior do que não
 *  mandar. Os CONTROLES só aparecem para quem pode configurar — e o servidor
 *  recusa a escrita de qualquer forma; esconder é só não oferecer o que voltaria
 *  erro.
 *
 *  ── Toda evidência vem de fora ─────────────────────────────────────────────
 *  Domínio de destino, título da página, cadeia de redirects: no cenário que o
 *  robô existe para pegar, isso é escrito por quem sequestrou o site. Entra
 *  como TEXTO, sempre — nunca como HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import {
  ShieldAlert, ShieldCheck, Loader2, RefreshCw, Save, Globe, Radar,
  CircleAlert, CircleDot, Power, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  resumoDeEstado, haQuantoTempo, checagensDoDia, anomaliasDoDia, linhasDaLeitura,
  TOM_EVENTO, type Tom, type Painel,
} from "./monitoramentoView";

const CORES: Record<Tom, { borda: string; texto: string; fundo: string }> = {
  off: { borda: "border-border", texto: "text-muted-foreground", fundo: "bg-muted/30" },
  ok: { borda: "border-emerald-500/30", texto: "text-emerald-600", fundo: "bg-emerald-500/5" },
  atencao: { borda: "border-amber-500/40", texto: "text-amber-600", fundo: "bg-amber-500/5" },
  critico: { borda: "border-red-500/50", texto: "text-red-600", fundo: "bg-red-500/5" },
};

const ICONE: Record<Tom, typeof ShieldCheck> = {
  off: Power, ok: ShieldCheck, atencao: CircleAlert, critico: ShieldAlert,
};

export function AbaMonitoramento({ accountId, podeConfigurar }: {
  accountId: number;
  podeConfigurar: boolean;
}) {
  const utils = trpc.useUtils();
  const q = trpc.monitoramento.painel.useQuery(
    { accountId },
    // O robô roda a cada 5 min; a tela acompanha sem quem estiver olhando
    // precisar recarregar para descobrir que a leitura seguinte já chegou.
    { refetchInterval: 60_000 },
  );

  const [form, setForm] = useState<null | {
    ativo: boolean; dominioEsperado: string;
    checarDns: boolean; checarRedirect: boolean; checarConteudo: boolean;
    blogUrl: string;
  }>(null);

  // O formulário só é semeado quando o servidor responde. Iniciar com valores
  // vazios e sobrescrever depois faria o toggle piscar de desligado para ligado
  // na frente de quem abriu a tela.
  useEffect(() => {
    if (!q.data || form) return;
    setForm({
      ativo: q.data.ativo,
      dominioEsperado: q.data.dominioEsperado ?? "",
      checarDns: q.data.checarDns,
      checarRedirect: q.data.checarRedirect,
      checarConteudo: q.data.checarConteudo,
      blogUrl: q.data.blogUrl ?? "",
    });
  }, [q.data, form]);

  const salvar = trpc.monitoramento.salvarConfig.useMutation({
    onSuccess: async () => {
      await utils.monitoramento.painel.invalidate();
      toast.success("Monitoramento salvo.");
    },
    onError: (e) => toast.error(e.message),
  });

  const rodar = trpc.monitoramento.rodarAgora.useMutation({
    onSuccess: async (r) => {
      await utils.monitoramento.painel.invalidate();
      if (r.pulado) return toast.info("Um ciclo já estava rodando — o resultado aparece em instantes.");
      toast.success(`Verificação concluída em ${r.contas} cliente(s) monitorado(s).`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!q.data) return null;

  const p = q.data as unknown as Painel;
  const agora = Date.now();
  const estado = resumoDeEstado(p, agora);
  const cor = CORES[estado.tom];
  const Ic = ICONE[estado.tom];
  const checagens = checagensDoDia(p);
  const anomalias = anomaliasDoDia(p);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Estado ─────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${cor.borda} ${cor.fundo}`}>
        <Ic className={`w-5 h-5 shrink-0 mt-0.5 ${cor.texto}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${cor.texto}`}>{estado.frase}</p>
          {estado.detalhe && <p className="text-xs text-muted-foreground mt-0.5">{estado.detalhe}</p>}
        </div>
        {podeConfigurar && (
          <button onClick={() => rodar.mutate()} disabled={rodar.isPending || !p.ativo}
            title={p.ativo ? "Roda um ciclo agora" : "Ligue o monitoramento para verificar"}
            className="h-8 px-3 rounded-lg border border-border bg-card text-xs flex items-center gap-1.5 shrink-0 disabled:opacity-50">
            {rodar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Verificar agora
          </button>
        )}
      </div>

      {/* ── Contadores do dia ──────────────────────────────────────────── */}
      {p.ativo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Numero label="Verificações hoje" valor={String(checagens)} />
          <Numero label="Com anomalia hoje" valor={String(anomalias)} tom={anomalias > 0 ? "atencao" : undefined} />
          <Numero label="Última leitura" valor={haQuantoTempo(p.ultimaVerificacaoEm, agora)} />
          <Numero label="Confirmações p/ alertar" valor={String(p.confirmacoesNecessarias)} />
        </div>
      )}

      {/* ── Configuração ───────────────────────────────────────────────── */}
      {podeConfigurar && form && (
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Radar className="w-3.5 h-3.5" /> Configuração
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="accent-accent" />
            <span className="font-medium">Monitorar este cliente</span>
            <span className="text-xs text-muted-foreground">— verifica a cada 5 minutos</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Domínio esperado</span>
            <input value={form.dominioEsperado}
              onChange={(e) => setForm({ ...form, dominioEsperado: e.target.value })}
              placeholder="exemplo.com.br"
              className="h-9 px-3 rounded-lg border border-border bg-background text-sm" />
            <span className="text-[11px] text-muted-foreground">
              Pode colar a URL completa — o esquema, o www e a barra final são removidos ao salvar.
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">O que verificar</span>
            {([
              ["checarDns", "DNS — o domínio ainda existe e aponta para os mesmos servidores"],
              ["checarRedirect", "Destino — o site ainda leva para o domínio esperado"],
              ["checarConteudo", "Conteúdo do blog — publicações estranhas (WordPress)"],
            ] as const).map(([campo, texto]) => (
              <label key={campo} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={form[campo]}
                  onChange={(e) => setForm({ ...form, [campo]: e.target.checked })}
                  className="accent-accent mt-0.5" />
                <span className="text-xs">{texto}</span>
              </label>
            ))}
          </div>

          {form.checarConteudo && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">URL do blog (opcional)</span>
              <input value={form.blogUrl} onChange={(e) => setForm({ ...form, blogUrl: e.target.value })}
                placeholder="deriva do domínio se ficar em branco"
                className="h-9 px-3 rounded-lg border border-border bg-background text-sm" />
            </label>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => salvar.mutate({
                accountId,
                ativo: form.ativo,
                dominioEsperado: form.dominioEsperado.trim() || null,
                checarDns: form.checarDns,
                checarRedirect: form.checarRedirect,
                checarConteudo: form.checarConteudo,
                blogUrl: form.blogUrl.trim() || null,
              })}
              disabled={salvar.isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-60">
              {salvar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
            {p.nsBaseline?.length ? (
              <span className="text-[11px] text-muted-foreground">
                Nameservers conhecidos: {p.nsBaseline.join(", ")}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Última leitura ─────────────────────────────────────────────── */}
      {p.ativo && (p.hoje.dns || p.hoje.redirect) && (
        <div className="grid md:grid-cols-2 gap-3">
          <Leitura titulo="DNS" m={p.hoje.dns} />
          <Leitura titulo="Destino do site" m={p.hoje.redirect} />
        </div>
      )}

      {/* ── Adicionar cliente sem mídia ────────────────────────────────── */}
      {podeConfigurar && <AdicionarClienteSemMidia />}

      {/* ── Histórico ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Histórico</p>
        {p.eventos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {p.ativo
              ? "Nada digno de nota até agora. Leituras normais não viram evento — só o que mudou aparece aqui."
              : "O monitoramento está desligado para este cliente."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {p.eventos.map((e, i) => {
              const t = TOM_EVENTO[e.tipo] ?? "ok";
              return (
                <div key={`${e.em}-${i}`} className="flex items-start gap-2 text-xs">
                  <CircleDot className={`w-3 h-3 mt-0.5 shrink-0 ${CORES[t].texto}`} />
                  <span className="text-muted-foreground tabular-nums shrink-0">{e.dia}</span>
                  <span className="flex-1 break-words">{e.detalhe}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Numero({ label, valor, tom }: { label: string; valor: string; tom?: Tom }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums mt-0.5 ${tom ? CORES[tom].texto : ""}`}>{valor}</p>
    </div>
  );
}

/** Evidência da última leitura. Tudo entra como texto — nunca como HTML. */
function Leitura({ titulo, m }: { titulo: string; m: Painel["hoje"]["dns"] }) {
  const linhas = linhasDaLeitura(m?.ultima);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5" /> {titulo}
      </p>
      {!m ? (
        <p className="text-xs text-muted-foreground py-2">Este coletor está desligado ou ainda não rodou hoje.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {linhas.map((l) => (
              <div key={l.rotulo} className="flex gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 w-32">{l.rotulo}</span>
                <span className="flex-1 break-all font-mono text-[11px]">{l.valor}</span>
              </div>
            ))}
          </div>
          {m.achados?.length ? (
            <div className="mt-2 pt-2 border-t border-border flex flex-col gap-1">
              {m.achados.map((a) => (
                <p key={a.chave} className={`text-[11px] ${a.sev === "CRITICAL" ? "text-red-600" : a.sev === "WARNING" ? "text-amber-600" : "text-muted-foreground"}`}>
                  {a.titulo}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Adiciona um cliente que a Selva atende só no Site.
 *
 * ── Um cliente, não uma entidade técnica ───────────────────────────────────
 * A copy aqui importa mais do que parece. A primeira versão dizia "cliente
 * somente-monitoramento", que descreve a COLUNA do banco, não o cliente. Quem
 * lesse concluiria que existe uma segunda classe de cliente no Spaces — e
 * passaria a tratar a Aiká como um cadastro técnico em vez de uma cliente da
 * agência que hoje só tem site com a gente.
 *
 * O que muda é o ESCOPO: sem mídia conectada, as telas de mídia ficam vazias
 * (ver SemMidia.tsx). Tudo o mais é igual — seletor, foto, Jornalzinho, alerta
 * técnico. O nome técnico continua no banco, onde ele descreve o que faz.
 *
 * Mora aqui, e não numa tela de administração, porque é aqui que a necessidade
 * aparece: quem vem ligar o monitoramento de um cliente é quem descobre que o
 * cliente ainda não existe. Fica recolhido para não competir com a aba.
 */
function AdicionarClienteSemMidia() {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [dominio, setDominio] = useState("");

  const criar = trpc.monitoramento.adicionarClienteSemMidia.useMutation({
    onSuccess: async (r) => {
      // O seletor de clientes lê `accounts.list`; sem invalidar, o cliente
      // recém-criado só apareceria no próximo recarregamento da página — e
      // quem acabou de criar concluiria que não funcionou.
      await Promise.all([
        utils.accounts.list.invalidate(),
        utils.monitoramento.status.invalidate(),
      ]);
      setNome(""); setDominio(""); setAberto(false);
      toast.success(`${r.nome} adicionado. Selecione o cliente na barra lateral para configurar o monitoramento.`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="self-start text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Adicionar cliente sem mídia
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-muted-foreground">Adicionar cliente sem mídia</p>
      <p className="text-[11px] text-muted-foreground">
        Use para clientes que ainda não têm mídia conectada, mas precisam aparecer no Spaces
        para acompanhamento de Site e Monitoramento. Ele entra no seletor como qualquer
        cliente — com foto, Jornalzinho e alertas técnicos. Só não entra nos syncs de mídia,
        então não pede token nem gera alerta de conexão.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente"
          className="h-9 px-3 rounded-lg border border-border bg-background text-sm" />
        <input value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="Domínio do site (ex.: exemplo.com.br)"
          className="h-9 px-3 rounded-lg border border-border bg-background text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => criar.mutate({ nome: nome.trim(), dominio: dominio.trim() })}
          disabled={criar.isPending || nome.trim().length < 2 || dominio.trim().length < 4}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-60">
          {criar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Criar
        </button>
        <button onClick={() => setAberto(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}
