/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social — a identidade e o cabeçalho de 3 colunas
 * ─────────────────────────────────────────────────────────────────────────────
 *  Reproduz o cabeçalho do protótipo aprovado, e as proporções são a parte que
 *  não pode escorregar: 0.92fr / 1fr / 1.55fr. O gráfico é a coluna larga porque
 *  é a única que ganha com espaço — resumo e resultados têm tamanho natural, e
 *  esticá-los só afastaria as palavras umas das outras.
 *
 *  ── Uma caixa, divisórias internas ─────────────────────────────────────────
 *  As três regiões são separadas por um traço de 1px, não por cartões. Cartão
 *  separado faria delas blocos independentes, e o cabeçalho volta a parecer uma
 *  coleção de componentes em vez de UMA visão da conta.
 *
 *  ── Ontem × hoje respeita a natureza da métrica ────────────────────────────
 *  Seguidores é ESTOQUE: "hoje 9.464" é o total da conta, não o ganho do dia. Na
 *  mesma coluna de fluxo, os quatro se leem do mesmo jeito — e aí 9.464 vira
 *  "9.464 seguidores hoje", que é o erro mais caro que esta tela pode induzir.
 *  Por isso o estoque leva o rótulo "total" e mostra a variação separada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, ExternalLink,
  Minus, TrendingDown, TrendingUp,
} from "lucide-react";
import { resumoExecutivo, type Achado, type Direcao, type LeituraSocial } from "@shared/leituraSocial";
import { COR } from "@shared/coresSociais";

export interface ValorDoDia {
  rotulo: string;
  valor: number | null;
  natureza: "fluxo" | "estoque";
  variacao?: number | null;
  formato?: "numero" | "percentual";
  /**
   * A cor da FAMÍLIA da métrica — a mesma do gráfico e dos cartões de baixo.
   *
   * Ela pinta o ponto ao lado do rótulo, e não o número: o número já usa verde
   * ou vermelho para dizer direção, e dois significados na mesma tinta fariam
   * "roxo" competir com "caiu".
   */
  cor?: string;
}

/**
 * As quatro métricas do resumo, e o matiz de cada uma.
 *
 * A chave é o nome que `leituraSocial` usa; o rótulo é o nome que o resto da
 * página usa. "interações" virou "Engajamento" na tela porque é assim que o
 * cartão da faixa de dados gerais se chama — dois nomes para a mesma coisa em
 * duas alturas da mesma página fariam parecer duas medições.
 */
const FAMILIA: Record<string, { rotulo: string; cor: string }> = {
  seguidores: { rotulo: "Seguidores", cor: COR.seguidores },
  ativações: { rotulo: "Ativações", cor: COR.ativacoes },
  interações: { rotulo: "Engajamento", cor: COR.engajamento },
  "visitas ao perfil": { rotulo: "Visitas", cor: COR.visitas },
};

/** Verde sobe, vermelho cai, cinza fica — e a seta repete o que a cor diz. */
const TOM_DIRECAO: Record<Direcao, string> = {
  subiu: "text-emerald-600",
  caiu: "text-destructive",
  estavel: "text-muted-foreground",
};
const SETA_DIRECAO: Record<Direcao, typeof ArrowUpRight> = {
  subiu: ArrowUpRight,
  caiu: ArrowDownRight,
  estavel: ArrowRight,
};

const inteiro = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const valorDe = (v?: ValorDoDia) => {
  if (!v || v.valor == null) return "–";
  return v.formato === "percentual" ? `${v.valor.toFixed(1)}%` : inteiro(v.valor);
};

/** As iniciais do cliente — o quadrado preto do protótipo. */
const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export function IdentidadeDaConta({ nome, username, rede, saude, foto }: {
  nome: string; username: string | null; rede: string;
  saude?: { rotulo: string; nivel: "ok" | "atencao" | "erro" } | null;
  /** A foto real do cliente. `null` cai nas iniciais — nada é fabricado. */
  foto?: string | null;
}) {
  /**
   * A URL da foto é ASSINADA e tem validade. Quando ela vence, o navegador
   * desenha o ícone de imagem quebrada — que é pior do que nunca ter havido
   * foto. O erro devolve a identidade às iniciais; o `useEffect` rearma a
   * tentativa ao trocar de cliente, senão o primeiro erro condenaria todos os
   * seguintes a aparecerem sem foto.
   */
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [foto]);

  const tomSaude = saude?.nivel === "erro"
    ? "bg-destructive/12 text-destructive"
    : saude?.nivel === "atencao"
      ? "bg-amber-500/14 text-amber-700 dark:text-amber-500"
      : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-500";

  return (
    <div className="flex items-center gap-3.5 flex-wrap">
      {/* A foto ocupa EXATAMENTE o espaço das iniciais: 46px e o mesmo raio.
          Trocar o tamanho quando há imagem faria o cabeçalho pular de altura ao
          navegar entre clientes com e sem foto. */}
      <span className="w-[46px] h-[46px] rounded-[14px] flex-shrink-0 overflow-hidden
                       grid place-items-center bg-foreground text-background
                       font-bold text-[15px] tracking-tight">
        {foto && !falhou
          ? <img src={foto} alt="" className="w-full h-full object-cover"
              onError={() => setFalhou(true)} />
          : iniciais(nome)}
      </span>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.02em] leading-none">{nome}</h1>
        <span className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5 mt-1">
          {username ? (
            <a href={`https://instagram.com/${username}`} target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              @{username} <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}
          {username && <span className="opacity-40">·</span>}
          {rede}
        </span>
      </div>
      {saude && (
        <span className={`text-[10px] font-bold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full ${tomSaude}`}>
          ● {saude.rotulo}
        </span>
      )}
    </div>
  );
}

/**
 * O resumo dos 7 dias — veredito, frase curta, indicadores.
 *
 * ── Por que a enumeração saiu do texto ─────────────────────────────────────
 * A frase antiga listava as quatro métricas por extenso: "ativações, interações
 * e visitas caíram; seguidores ficaram estáveis". Isso é a tabela escrita — e a
 * tabela está na coluna ao lado. Quatro linhas de prosa para dizer o que quatro
 * setas dizem de relance.
 *
 * Agora o veredito vem em uma linha e a enumeração vira indicador: ponto no
 * matiz da métrica, seta na cor da direção. As duas semânticas convivem porque
 * ocupam lugares diferentes — cor de família no ponto, cor de direção na seta.
 * Se as duas disputassem o mesmo pixel, "roxo" competiria com "caiu".
 *
 * ── A nota de procedência fica ─────────────────────────────────────────────
 * A frase parece texto de IA e não é. Cada número sai de aritmética sobre os
 * snapshots, e dizer isso protege a confiança nos dois sentidos.
 */
export function ResumoCurto({ leitura }: { leitura: LeituraSocial }) {
  const r = resumoExecutivo(leitura);

  const Icone = r.tom === "positivo" ? TrendingUp
    : r.tom === "negativo" ? TrendingDown
    : r.tom === "misto" ? ArrowUpRight
    : Minus;
  const tomDoIcone = r.tom === "positivo" ? "bg-emerald-500/12 text-emerald-600"
    : r.tom === "negativo" ? "bg-destructive/12 text-destructive"
    : r.tom === "misto" ? "bg-amber-500/14 text-amber-700"
    : "bg-muted text-muted-foreground";

  return (
    <div className="min-w-0 flex flex-col gap-2.5">
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
        Resumo · 7 dias
      </span>

      <div className="flex items-start gap-2.5">
        <span className={`w-7 h-7 rounded-[9px] grid place-items-center flex-shrink-0 ${tomDoIcone}`}>
          <Icone className="w-3.5 h-3.5" strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <p className={`text-[14px] font-bold leading-tight tracking-[-0.01em] ${
            r.tom === "sem_dado" ? "text-muted-foreground font-semibold text-[12.5px]" : ""}`}>
            {r.titulo}
          </p>
          {r.detalhe && (
            <p className="text-[11px] text-muted-foreground leading-snug mt-1">{r.detalhe}</p>
          )}
        </div>
      </div>

      {/* Os indicadores: um por achado, na ordem em que o módulo os produziu.
          Ordená-los por magnitude faria a mesma conta trocar de leitura entre
          dois dias, e a comparação visual entre clientes se perderia. */}
      {leitura.achados.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {leitura.achados.map((a) => <Indicativo key={a.metrica} a={a} />)}
        </div>
      )}

      {!leitura.dadosInsuficientes && (
        <p className="text-[10px] text-muted-foreground/50 mt-auto">
          Calculado dos snapshots — não é texto gerado.
        </p>
      )}
    </div>
  );
}

/**
 * Um indicador de direção.
 *
 * O percentual entra no `title` e não na tela: com quatro indicadores numa
 * linha, quatro percentuais viram ruído — e a direção é a pergunta desta caixa.
 * Quem quer o número tem a coluna ONTEM × HOJE ao lado.
 */
function Indicativo({ a }: { a: Achado }) {
  const f = FAMILIA[a.metrica] ?? { rotulo: a.metrica, cor: COR.seguidores };
  const Seta = SETA_DIRECAO[a.direcao];
  const detalhe = a.percentual != null
    ? `${a.percentual > 0 ? "+" : ""}${a.percentual.toFixed(1)}% no período`
    : `variação de ${a.delta > 0 ? "+" : ""}${inteiro(a.delta)}`;

  return (
    <span title={detalhe}
      className="inline-flex items-center gap-1.5 text-[11px] cursor-default
                 rounded-md px-1 -mx-1 transition-colors duration-150 hover:bg-foreground/[0.04]">
      <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: f.cor }} />
      <span className="text-muted-foreground">{f.rotulo}</span>
      <Seta className={`w-3 h-3 flex-shrink-0 ${TOM_DIRECAO[a.direcao]}`} strokeWidth={2.8} />
    </span>
  );
}

/**
 * Resultados: ontem × hoje, como painel comparativo — não como tabela.
 *
 * ── O que muda em relação à tabela ─────────────────────────────────────────
 * O número de HOJE ganha a cor da direção e uma seta; o de ontem fica cinza,
 * porque é referência e não resultado. A linha inteira acende no hover. É a
 * mesma gramática dos cartões de baixo: valor grande, selo de variação, matiz
 * da família — só que em seis linhas em vez de seis cartões, porque a altura do
 * cabeçalho é fixa.
 *
 * ── A cor diz DIREÇÃO, e o ponto diz MÉTRICA ───────────────────────────────
 * Duas semânticas, dois lugares. O ponto à esquerda do rótulo é o matiz da
 * família (roxo seguidores, azul visitas, rosa ativações, âmbar engajamento); o
 * número e a seta usam verde e vermelho. Misturar as duas na mesma tinta faria
 * o leitor perguntar se roxo é bom.
 *
 * ── Estoque continua sendo tratado como estoque ────────────────────────────
 * Seguidores é o total da conta, não o ganho do dia. O rótulo "total" e a
 * variação numa linha própria seguem intactos — era o erro mais caro que esta
 * tela podia induzir, e a mudança visual não o reabre.
 */
export function Resultados({ ontem, hoje, aviso }: {
  ontem: ValorDoDia[]; hoje: ValorDoDia[]; aviso?: string | null;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-[18px] items-baseline">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 pb-2">
          Resultados
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/40 text-right pb-2">
          Ontem
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground text-right pb-2">
          Hoje
        </span>

        {hoje.map((h, i) => (
          <Linha key={h.rotulo} ontem={ontem[i]} hoje={h}
            ativo={ativo === h.rotulo} aoEntrar={setAtivo} />
        ))}
      </div>
      {aviso && <p className="text-[10px] text-muted-foreground/50 mt-2.5 leading-snug">{aviso}</p>}
    </div>
  );
}

/**
 * A variação entre os dois dias, quando ela é calculável.
 *
 * `null` quando falta qualquer um dos lados: uma seta sobre um dia não medido
 * afirmaria movimento onde houve ausência. E `0` é estabilidade MEDIDA, que é
 * diferente de não saber — por isso o zero devolve "estavel", e não `null`.
 */
function direcaoEntre(ontem?: ValorDoDia, hoje?: ValorDoDia): Direcao | null {
  if (!hoje || hoje.valor == null || !ontem || ontem.valor == null) return null;
  const delta = hoje.valor - ontem.valor;
  if (delta === 0) return "estavel";
  return delta > 0 ? "subiu" : "caiu";
}

function Linha({ ontem, hoje, ativo, aoEntrar }: {
  ontem?: ValorDoDia; hoje: ValorDoDia;
  ativo: boolean; aoEntrar: (r: string | null) => void;
}) {
  /**
   * A seta do FLUXO compara os dois dias. No estoque ela não aparece na mesma
   * linha: lá a variação já tem lugar próprio embaixo do total, e duas
   * indicações do mesmo movimento na mesma linha se anulariam na leitura.
   */
  const direcao = hoje.natureza === "fluxo" ? direcaoEntre(ontem, hoje) : null;
  const Seta = direcao ? SETA_DIRECAO[direcao] : null;
  const fundo = ativo ? "bg-foreground/[0.035]" : "";
  const eventos = {
    onMouseEnter: () => aoEntrar(hoje.rotulo),
    onMouseLeave: () => aoEntrar(null),
  };
  const delta = direcao && ontem?.valor != null && hoje.valor != null
    ? hoje.valor - ontem.valor
    : null;

  return (
    <>
      <span {...eventos}
        className={`text-[12.5px] text-muted-foreground py-[5px] pl-1.5 -ml-1.5 rounded-l-md
                    flex items-center gap-1.5 transition-colors duration-150 ${fundo}`}>
        {/* O ponto da família: mesma cor da linha dela no gráfico ao lado. */}
        <i className="w-[5px] h-[5px] rounded-full flex-shrink-0"
          style={{ background: hoje.cor ?? "currentColor", opacity: hoje.cor ? 1 : 0.35 }} />
        {hoje.rotulo}
        {hoje.natureza === "estoque" && (
          <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground/45">total</span>
        )}
      </span>
      <span {...eventos}
        className={`text-[13px] text-right tabular-nums text-muted-foreground/40 py-[5px]
                    transition-colors duration-150 ${fundo}`}>
        {valorDe(ontem)}
      </span>
      <span {...eventos}
        title={delta != null
          ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${valorBruto(Math.abs(delta), hoje)} em relação a ontem`
          : undefined}
        className={`text-[13px] text-right tabular-nums font-bold py-[5px] pr-1.5 -mr-1.5 rounded-r-md
                    transition-colors duration-150 ${fundo} ${
          direcao ? TOM_DIRECAO[direcao] : ""}`}>
        <span className="inline-flex items-center gap-0.5 justify-end">
          {valorDe(hoje)}
          {Seta && <Seta className="w-3 h-3 flex-shrink-0" strokeWidth={2.8} />}
        </span>
        {/* A variação do estoque ABAIXO do total: elas respondem perguntas
            diferentes e empatariam se dividissem a linha. */}
        {hoje.natureza === "estoque" && hoje.variacao != null && hoje.variacao !== 0 && (
          <span className={`block text-[10px] font-semibold ${
            hoje.variacao > 0 ? "text-emerald-600" : "text-destructive"}`}>
            {hoje.variacao > 0 ? "+" : "−"}{inteiro(Math.abs(hoje.variacao))}
          </span>
        )}
      </span>
    </>
  );
}

/** O número cru na unidade da métrica — para o tooltip da variação. */
const valorBruto = (n: number, molde: ValorDoDia) =>
  molde.formato === "percentual" ? `${n.toFixed(1)} p.p.` : inteiro(n);
