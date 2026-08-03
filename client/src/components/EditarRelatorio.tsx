/**
 * Edição manual dos textos do relatório.
 *
 * A IA acerta o formato quase sempre e erra o tom de vez em quando — e o
 * relatório vai para o cliente. Antes disto, a única saída para uma frase
 * torta era regerar o relatório inteiro e torcer para sair melhor.
 *
 * "Remover bloco" não guarda um sinalizador de visibilidade: apaga o conteúdo.
 * A vista pública já omite bloco vazio, então um campo de visibilidade seria um
 * segundo jeito de dizer a mesma coisa — e dois jeitos divergem com o tempo.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, RotateCcw, ChevronUp, ChevronDown, BarChart3 } from "lucide-react";
import { toast } from "sonner";

/** Mesma lista do ReportView — `dados` é o grupo gráfico/criativos/públicos,
 *  que entra aqui só para poder ser movido. */
const ORDEM_PADRAO = ["leitura", "dados", "oQueAconteceu", "proximosPassos", "oQueVamosMedir", "expectativa"] as const;
type BlocoChave = typeof ORDEM_PADRAO[number];

const TITULO_BLOCO: Record<BlocoChave, string> = {
  leitura: "Leitura estratégica",
  dados: "Gráfico, criativos e públicos",
  oQueAconteceu: "O que aconteceu no período",
  proximosPassos: "Próximos passos",
  oQueVamosMedir: "O que vamos medir",
  expectativa: "Expectativa para o próximo período",
};

function ordemDosBlocos(salva: unknown): BlocoChave[] {
  const lista = Array.isArray(salva) ? salva.filter((x): x is BlocoChave => (ORDEM_PADRAO as readonly string[]).includes(x)) : [];
  const vistos = new Set(lista);
  return [...lista, ...ORDEM_PADRAO.filter((k) => !vistos.has(k))];
}

type Destaque = { resumo: string; detalhe: string };
export type NarrativaEditavel = {
  titulo: string;
  resumoExecutivo: string;
  pontoAlto: Destaque;
  pontoFraco: Destaque;
  oportunidade: Destaque;
  oQueAconteceu: string;
  proximosPassos: string[];
  oQueVamosMedir: string[];
  expectativa: string;
  ordem: BlocoChave[];
};

const VAZIA: NarrativaEditavel = {
  titulo: "", resumoExecutivo: "",
  pontoAlto: { resumo: "", detalhe: "" },
  pontoFraco: { resumo: "", detalhe: "" },
  oportunidade: { resumo: "", detalhe: "" },
  oQueAconteceu: "", proximosPassos: [], oQueVamosMedir: [], expectativa: "",
  ordem: [...ORDEM_PADRAO],
};

const destaqueDe = (v: unknown): Destaque => {
  const d = (v ?? {}) as Partial<Destaque>;
  return { resumo: d.resumo ?? "", detalhe: d.detalhe ?? "" };
};
const listaDe = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Setas de ordem — a posição do bloco no relatório final. */
function Setas({ podeSubir, podeDescer, onSubir, onDescer }: {
  podeSubir: boolean; podeDescer: boolean; onSubir: () => void; onDescer: () => void;
}) {
  return (
    <div className="flex flex-col shrink-0">
      <button type="button" onClick={onSubir} disabled={!podeSubir} title="Mover para cima"
        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent transition-colors">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onDescer} disabled={!podeDescer} title="Mover para baixo"
        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent transition-colors">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Cabeçalho de bloco com a ação de remover/restaurar à direita. */
function Bloco({ titulo, ajuda, vazio, onRemover, onRestaurar, setas, children }: {
  titulo: string; ajuda?: string; vazio: boolean;
  onRemover: () => void; onRestaurar: () => void; setas?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${vazio ? "border-dashed border-border bg-muted/20" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          {setas}
          <div className="min-w-0">
            <Label className="mb-0">{titulo}</Label>
            {ajuda && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{ajuda}</p>}
          </div>
        </div>
        {vazio ? (
          <Button type="button" size="sm" variant="ghost" className="shrink-0 text-xs" onClick={onRestaurar}>
            <RotateCcw className="w-3 h-3 mr-1.5" /> Adicionar
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost"
            className="shrink-0 text-xs text-muted-foreground hover:text-destructive" onClick={onRemover}>
            <Trash2 className="w-3 h-3 mr-1.5" /> Remover
          </Button>
        )}
      </div>
      {vazio ? (
        <p className="text-xs text-muted-foreground">Este bloco não vai aparecer no relatório.</p>
      ) : children}
    </div>
  );
}

/** Lista editável (próximos passos, o que vamos medir). */
function ListaEditavel({ itens, onChange, rotuloItem }: {
  itens: string[]; onChange: (v: string[]) => void; rotuloItem: string;
}) {
  return (
    <div className="space-y-2">
      {itens.map((item, i) => (
        <div key={i} className="flex gap-2">
          <span className="mt-2.5 text-[11px] font-bold text-muted-foreground w-4 shrink-0 text-right">{i + 1}.</span>
          <Textarea
            value={item}
            onChange={(e) => onChange(itens.map((x, j) => (j === i ? e.target.value : x)))}
            className="min-h-[52px] text-sm"
          />
          <Button type="button" size="sm" variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(itens.filter((_, j) => j !== i))}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...itens, ""])}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> {rotuloItem}
      </Button>
    </div>
  );
}

export function EditarRelatorio({ accountId, reportId, aberto, onFechar, onSalvo }: {
  accountId: number; reportId: number | null; aberto: boolean;
  onFechar: () => void; onSalvo: () => void;
}) {
  const [n, setN] = useState<NarrativaEditavel>(VAZIA);
  // Blocos que o usuário reabriu mas ainda não preencheu. Fica só na tela: o
  // que decide se o bloco aparece no relatório é o conteúdo, não este estado.
  // Sem ele, "restaurar" precisaria gravar um espaço em branco no campo.
  const [reabertos, setReabertos] = useState<Set<string>>(new Set());
  const reabrir = (k: string) => setReabertos((s) => new Set(s).add(k));
  const fechar = (k: string) => setReabertos((s) => { const p = new Set(s); p.delete(k); return p; });

  const q = trpc.reports.narrativa.useQuery(
    { accountId, id: reportId ?? 0 },
    { enabled: aberto && !!reportId, refetchOnWindowFocus: false }
  );

  // Repopula sempre que o relatório carregar — sem isto, abrir um segundo
  // relatório na mesma sessão mostraria os textos do primeiro.
  useEffect(() => {
    const d = q.data?.narrative as Record<string, unknown> | null | undefined;
    if (!d) return;
    setReabertos(new Set());
    setN({
      titulo: (d.titulo as string) ?? "",
      resumoExecutivo: (d.resumoExecutivo as string) ?? "",
      pontoAlto: destaqueDe(d.pontoAlto),
      pontoFraco: destaqueDe(d.pontoFraco),
      oportunidade: destaqueDe(d.oportunidade),
      oQueAconteceu: (d.oQueAconteceu as string) ?? "",
      proximosPassos: listaDe(d.proximosPassos),
      oQueVamosMedir: listaDe(d.oQueVamosMedir),
      expectativa: (d.expectativa as string) ?? "",
      ordem: ordemDosBlocos(d.ordem),
    });
  }, [q.data]);

  const salvar = trpc.reports.editarNarrativa.useMutation({
    onSuccess: () => {
      toast.success("Textos atualizados. O link público já mostra a nova versão.");
      onSalvo();
      onFechar();
    },
    onError: (e) => toast.error("Não consegui salvar: " + e.message),
  });

  const set = <K extends keyof NarrativaEditavel>(k: K, v: NarrativaEditavel[K]) =>
    setN((atual) => ({ ...atual, [k]: v }));
  const setD = (k: "pontoAlto" | "pontoFraco" | "oportunidade", campo: keyof Destaque, v: string) =>
    setN((atual) => ({ ...atual, [k]: { ...atual[k], [campo]: v } }));

  const caixa = (k: "pontoAlto" | "pontoFraco" | "oportunidade", titulo: string, ajuda: string) => (
    <Bloco
      key={k}
      titulo={titulo}
      ajuda={ajuda}
      vazio={!n[k].resumo && !reabertos.has(k)}
      onRemover={() => { set(k, { resumo: "", detalhe: "" }); fechar(k); }}
      onRestaurar={() => reabrir(k)}
    >
      <div className="space-y-2">
        <Input value={n[k].resumo} onChange={(e) => setD(k, "resumo", e.target.value)}
          placeholder="Manchete curta (até 60 caracteres)" className="text-sm" />
        <Textarea value={n[k].detalhe} onChange={(e) => setD(k, "detalhe", e.target.value)}
          placeholder="1 a 2 frases com o número que sustenta a manchete" className="min-h-[64px] text-sm" />
      </div>
    </Bloco>
  );

  /** Troca um bloco de lugar com o vizinho. */
  const mover = (i: number, passo: -1 | 1) =>
    setN((atual) => {
      const o = [...atual.ordem];
      const j = i + passo;
      if (j < 0 || j >= o.length) return atual;
      [o[i], o[j]] = [o[j], o[i]];
      return { ...atual, ordem: o };
    });

  function renderBloco(chave: BlocoChave, i: number) {
    const setas = (
      <Setas podeSubir={i > 0} podeDescer={i < n.ordem.length - 1}
        onSubir={() => mover(i, -1)} onDescer={() => mover(i, 1)} />
    );

    switch (chave) {
      case "leitura":
        return (
          <div key={chave} className="rounded-xl border border-border p-3.5">
            <div className="flex items-start gap-2 mb-2.5">
              {setas}
              <div>
                <Label className="mb-0">{TITULO_BLOCO.leitura}</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">As três caixas logo abaixo dos números. Movem-se juntas.</p>
              </div>
            </div>
            <div className="space-y-2.5 pl-6">
              {caixa("pontoAlto", "Ponto alto", "O que mais funcionou neste período.")}
              {caixa("pontoFraco", "Ponto fraco", "O que ficou abaixo neste período.")}
              {caixa("oportunidade", "Oportunidade", "Onde dá para ganhar no próximo período — a abertura, não a ação.")}
            </div>
          </div>
        );

      /* Não é texto — está na lista só para poder ser movido. Sem ele, dava
         para reordenar o fecho mas não para pôr a leitura estratégica DEPOIS
         da evidência, que é o rearranjo mais óbvio de todos. */
      case "dados":
        return (
          <div key={chave} className="rounded-xl border border-dashed border-border bg-muted/20 p-3.5">
            <div className="flex items-start gap-2">
              {setas}
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <Label className="mb-0">{TITULO_BLOCO.dados}</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Vem dos dados da conta — só a posição muda aqui.</p>
                </div>
              </div>
            </div>
          </div>
        );

      case "oQueAconteceu":
        return (
          <Bloco key={chave} titulo={TITULO_BLOCO.oQueAconteceu} setas={setas}
            ajuda="A narrativa que costura as três caixas em causa e efeito."
            vazio={!n.oQueAconteceu && !reabertos.has("oQueAconteceu")}
            onRemover={() => { set("oQueAconteceu", ""); fechar("oQueAconteceu"); }} onRestaurar={() => reabrir("oQueAconteceu")}>
            <Textarea value={n.oQueAconteceu} onChange={(e) => set("oQueAconteceu", e.target.value)}
              className="min-h-[110px] text-sm" />
          </Bloco>
        );

      case "proximosPassos":
        return (
          <Bloco key={chave} titulo={TITULO_BLOCO.proximosPassos} setas={setas}
            ajuda="As ações concretas que a agência vai executar."
            vazio={n.proximosPassos.length === 0}
            onRemover={() => set("proximosPassos", [])} onRestaurar={() => set("proximosPassos", [""])}>
            <ListaEditavel itens={n.proximosPassos} rotuloItem="Adicionar passo"
              onChange={(v) => set("proximosPassos", v)} />
          </Bloco>
        );

      case "oQueVamosMedir":
        return (
          <Bloco key={chave} titulo={TITULO_BLOCO.oQueVamosMedir} setas={setas}
            ajuda="Os indicadores que dirão se os passos funcionaram."
            vazio={n.oQueVamosMedir.length === 0}
            onRemover={() => set("oQueVamosMedir", [])} onRestaurar={() => set("oQueVamosMedir", [""])}>
            <ListaEditavel itens={n.oQueVamosMedir} rotuloItem="Adicionar indicador"
              onChange={(v) => set("oQueVamosMedir", v)} />
          </Bloco>
        );

      case "expectativa":
        return (
          <Bloco key={chave} titulo={TITULO_BLOCO.expectativa} setas={setas}
            ajuda="A única promessa do documento — o cliente vai cobrar."
            vazio={!n.expectativa && !reabertos.has("expectativa")}
            onRemover={() => { set("expectativa", ""); fechar("expectativa"); }} onRestaurar={() => reabrir("expectativa")}>
            <Textarea value={n.expectativa} onChange={(e) => set("expectativa", e.target.value)}
              className="min-h-[80px] text-sm" />
          </Bloco>
        );
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar textos do relatório</DialogTitle>
          <DialogDescription>
            Só os textos — os números, o gráfico e os criativos vêm dos dados e não mudam aqui.
            Blocos removidos deixam de aparecer no link do cliente, e as setas mudam a ordem das seções.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando textos…
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive py-6">Não consegui carregar este relatório.</p>
        ) : (
          <div className="space-y-3.5 py-1">
            {/* Título e resumo abrem o relatório antes dos números — não entram
                na reordenação porque não são seções, são o cabeçalho. */}
            <div>
              <Label>Título</Label>
              <Input value={n.titulo} onChange={(e) => set("titulo", e.target.value)}
                placeholder="Manchete do período" className="mt-1" />
            </div>

            <Bloco titulo="Resumo executivo" ajuda="O parágrafo que alguém lê se ler só uma coisa."
              vazio={!n.resumoExecutivo && !reabertos.has("resumoExecutivo")}
              onRemover={() => { set("resumoExecutivo", ""); fechar("resumoExecutivo"); }} onRestaurar={() => reabrir("resumoExecutivo")}>
              <Textarea value={n.resumoExecutivo} onChange={(e) => set("resumoExecutivo", e.target.value)}
                className="min-h-[80px] text-sm" />
            </Bloco>

            {n.ordem.map(renderBloco)}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            disabled={salvar.isPending || q.isLoading || !reportId}
            onClick={() => reportId && salvar.mutate({ accountId, id: reportId, narrativa: n })}
          >
            {salvar.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</> : "Salvar textos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
