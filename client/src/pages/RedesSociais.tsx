/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Redes Sociais — a página visual, por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sucessora de `SocialNetworks.tsx`. Os blocos visuais vieram de lá quase
 *  intactos — KpiCard, MetricRow, RecentPostCard; o que mudou foi de onde os
 *  dados vêm e como as duas origens convivem.
 *
 *  ── O que matou a página antiga ────────────────────────────────────────────
 *  Ela lia o Instagram com `accounts[0].accessToken` — o token de mídia de uma
 *  conta ARBITRÁRIA servindo de credencial para todos os clientes — e misturava
 *  números de campanha com números de perfil sob o mesmo rótulo. Aqui as duas
 *  coisas chegam em objetos SEPARADOS (`organico` e `pago`), cada um com a
 *  origem declarada: não existe caminho para pintar investimento num card de
 *  alcance orgânico, porque os dois nunca se encontram.
 *
 *  ── Esta página não escreve nada ───────────────────────────────────────────
 *  Token, vínculo, diagnóstico e conexão vivem em Configurações → Conexões.
 *  Aqui só se olha. Quando falta configuração, a página diz qual é e manda para
 *  lá — em vez de parecer quebrada por falta de um passo que tem dono.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Link } from "wouter";
import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { SemAcessoTracker } from "@/components/SemAcessoTracker";
import { useSelectedAccount } from "@/hooks/useSelectedAccount";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { trpc } from "@/lib/trpc";
import { PeriodFilter, usePeriodFilter } from "@/components/PeriodFilter";
import { lerVinculo, ROTULO_TIPO, type StatusInsight, type TipoConta } from "@shared/instagram";
import { ROTULO_FONTE } from "@shared/fontesSociais";
import {
  Instagram, Loader2, Users, Heart, MessageCircle, Eye, Image as ImageIcon,
  Activity, DollarSign, MousePointerClick, TrendingUp, Share2, Settings2, ExternalLink,
} from "lucide-react";

// ─── Formatação ─────────────────────────────────────────────────────────────
// `null` vira "–", e nunca 0: uma métrica que a Meta não devolveu não é uma
// métrica que deu zero, e um zero inventado é pior que um traço honesto.
const fmt = (n: number | null | undefined): string =>
  n == null ? "–" : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoeda = (n: number | null | undefined): string =>
  n == null ? "–" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number | null | undefined): string =>
  n == null ? "–" : `${n.toFixed(2)}%`;

// ─── Blocos visuais (herdados da página antiga) ─────────────────────────────

function KpiCard({ icon: Icon, label, value, sublabel, color, bgColor }: {
  icon: typeof Users; label: string; value: string; sublabel?: string; color: string; bgColor: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgColor }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold text-foreground leading-tight tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, color }: {
  icon: typeof Users; label: string; value: string; color: string;
}) {
  const vazio = value === "–";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: vazio ? "#9CA3AF" : color }} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${vazio ? "text-muted-foreground/50" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

interface Midia {
  id: string; caption: string | null; mediaType: string | null;
  mediaUrl: string | null; thumbnailUrl: string | null; permalink: string | null;
  timestamp: string | null; curtidas: number | null; comentarios: number | null;
}

function PostRecente({ post }: { post: Midia }) {
  const img = post.thumbnailUrl || post.mediaUrl;
  const data = post.timestamp ? new Date(post.timestamp) : null;
  return (
    <a href={post.permalink ?? "#"} target="_blank" rel="noopener noreferrer"
      className="bg-card rounded-lg border border-border overflow-hidden hover:shadow-md transition-all group block">
      <div className="aspect-square bg-muted relative overflow-hidden">
        {img
          ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-muted-foreground/30" /></div>}
        {(post.mediaType === "VIDEO" || post.mediaType === "CAROUSEL_ALBUM") && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
            {post.mediaType === "VIDEO" ? "VÍDEO" : "CARROSSEL"}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-pink-500" />{fmt(post.curtidas)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3 text-blue-500" />{fmt(post.comentarios)}</span>
        </div>
        {data && <p className="text-[10px] text-muted-foreground/60 mt-1.5">
          {data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
        </p>}
      </div>
    </a>
  );
}

/** Estado que pede AÇÃO, com o caminho — e sem cara de erro. */
function PrecisaDeConfiguracao({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col gap-2.5">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-500">{titulo}</p>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap select-all">{detalhe}</p>
      <Link href="/settings?painel=conexoes">
        <span className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted cursor-pointer w-fit">
          <Settings2 className="w-3.5 h-3.5" /> Abrir Conexões → Redes sociais
        </span>
      </Link>
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function RedesSociais() {
  const { user } = useAuth();
  const podeVer = canManageContent(user?.role);
  const { selectedAccountId, accounts } = useSelectedAccount();
  const { period, setPeriod, dateRange } = usePeriodFilter();

  const q = trpc.social.painel.useQuery(
    { accountId: selectedAccountId!, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: podeVer && !!selectedAccountId, staleTime: 5 * 60 * 1000 },
  );

  if (!podeVer) {
    return (
      <SemAcessoTracker
        title="Redes sociais"
        message="A área de Redes sociais está em teste interno e é restrita a administradores e desenvolvedores."
      />
    );
  }

  const cliente = accounts?.find((a: { id: number }) => a.id === selectedAccountId);
  const d = q.data;
  const organico = d?.organico ?? null;
  const pago = d?.pago ?? null;

  const leitura = organico
    ? lerVinculo({
        estado: "VINCULADO",
        tipoConta: organico.perfil.tipoConta as TipoConta,
        statusInsight: organico.insights.statusInsight as StatusInsight,
        username: organico.perfil.username,
        pageName: d?.vinculo?.pageName,
      })
    : null;

  return (
    <MetaDashboardLayout>
      <div className="max-w-6xl mx-auto p-6 max-md:p-0 flex flex-col gap-5">

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Instagram className="w-5 h-5" /> Redes sociais
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cliente?.accountName ?? "Selecione um cliente"}
              {d?.fonte.usada && ` · dados via ${ROTULO_FONTE[d.fonte.usada].toLowerCase()}`}
            </p>
          </div>
          <PeriodFilter period={period} onChange={setPeriod} compact />
        </div>

        {!selectedAccountId && (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Share2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Selecione um cliente</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Escolha um cliente no menu lateral para ver o Instagram dele.
            </p>
          </div>
        )}

        {selectedAccountId && q.isLoading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        )}

        {q.error && (
          <PrecisaDeConfiguracao titulo="Não foi possível carregar" detalhe={q.error.message} />
        )}

        {/* ── ORGÂNICO ─────────────────────────────────────────────────────
            Tudo aqui vem do Instagram. Nenhum número de campanha entra neste
            bloco — eles chegam num objeto separado. */}
        {d && !organico && d.erro && (
          <PrecisaDeConfiguracao
            titulo={d.fonte.usada ? "Instagram ainda não disponível" : d.fonte.titulo}
            detalhe={d.erro}
          />
        )}

        {organico && leitura && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Orgânico · Instagram
              </h2>
              {organico.perfil.username && (
                <a href={`https://instagram.com/${organico.perfil.username}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono underline text-muted-foreground inline-flex items-center gap-1">
                  @{organico.perfil.username} <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                {ROTULO_TIPO[organico.perfil.tipoConta as TipoConta]}
              </span>
            </div>

            {/* Conta pessoal e Business-sem-permissão são estados VÁLIDOS: azul,
                com explicação, nunca vermelho. Ver shared/instagram. */}
            {leitura.nivel !== "ok" && (
              <div className={`rounded-xl border p-4 flex flex-col gap-1.5 ${
                leitura.nivel === "erro" ? "border-destructive/30 bg-destructive/5"
                : leitura.nivel === "limitado" ? "border-sky-500/30 bg-sky-500/5"
                : "border-amber-500/30 bg-amber-500/5"}`}>
                <p className="text-sm font-medium text-foreground">{leitura.titulo}</p>
                <p className="text-xs text-muted-foreground">{leitura.explicacao}</p>
                {organico.insights.recusadas.length > 0 && (
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all select-all mt-1 max-h-40 overflow-y-auto text-muted-foreground">
                    {organico.insights.recusadas.join("\n")}
                  </pre>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={ImageIcon} label="Publicações" value={fmt(organico.perfil.posts)}
                color="#E1306C" bgColor="rgba(225,48,108,0.1)" />
              <KpiCard icon={Activity} label="Métricas do perfil"
                value={organico.insights.ok.length > 0 ? `${organico.insights.ok.length}/4` : "–"}
                sublabel={organico.insights.ok.length > 0 ? organico.insights.ok.join(", ") : "nenhuma respondeu"}
                color="#8B5CF6" bgColor="rgba(139,92,246,0.1)" />
              <KpiCard icon={Heart} label="Curtidas nos posts recentes"
                value={fmt(organico.midias.reduce((t: number, m: Midia) => t + (m.curtidas ?? 0), 0) || null)}
                color="#EC4899" bgColor="rgba(236,72,153,0.1)" />
              <KpiCard icon={MessageCircle} label="Comentários nos posts recentes"
                value={fmt(organico.midias.reduce((t: number, m: Midia) => t + (m.comentarios ?? 0), 0) || null)}
                color="#3B82F6" bgColor="rgba(59,130,246,0.1)" />
            </div>

            {organico.midias.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Publicações recentes
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {organico.midias.map((m: Midia) => <PostRecente key={m.id} post={m} />)}
                </div>
              </div>
            )}
            {organico.midias.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma publicação recente foi retornada para esta conta.
              </p>
            )}
          </>
        )}

        {/* ── PAGO ─────────────────────────────────────────────────────────
            Bloco separado, origem Meta Ads. Todo rótulo diz "pago" ou
            "campanha": ler um número daqui como orgânico é o erro que a página
            antiga cometia. */}
        {selectedAccountId && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5" /> Mídia paga · Meta Ads
              <span className="font-normal normal-case tracking-normal text-[10px] text-muted-foreground/70">
                origem diferente do bloco acima — campanhas, não perfil
              </span>
            </h2>
            {pago ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard icon={DollarSign} label="Investimento em mídia" value={fmtMoeda(pago.investimento)}
                    color="#10B981" bgColor="rgba(16,185,129,0.1)" />
                  <KpiCard icon={Eye} label="Alcance pago" value={fmt(pago.alcance)}
                    color="#F59E0B" bgColor="rgba(245,158,11,0.1)" />
                  <KpiCard icon={MousePointerClick} label="Cliques pagos" value={fmt(pago.cliques)}
                    color="#6366F1" bgColor="rgba(99,102,241,0.1)" />
                  <KpiCard icon={TrendingUp} label="Resultados de campanha" value={fmt(pago.conversoes)}
                    color="#14B8A6" bgColor="rgba(20,184,166,0.1)" />
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <MetricRow icon={Eye} label="Impressões pagas" value={fmt(pago.impressoes)} color="#F59E0B" />
                  <MetricRow icon={MousePointerClick} label="CTR pago" value={fmtPct(pago.ctr)} color="#6366F1" />
                  <MetricRow icon={DollarSign} label="CPC pago" value={fmtMoeda(pago.cpc)} color="#10B981" />
                  <MetricRow icon={TrendingUp} label="Valor de conversão (campanha)" value={fmtMoeda(pago.valorDeConversao)} color="#14B8A6" />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma campanha com dados no período selecionado.
              </p>
            )}
          </div>
        )}

        {selectedAccountId && (
          <p className="text-[10px] text-muted-foreground/70">
            Leitura ao vivo, sem histórico guardado. Conexão, token e vínculo ficam em
            Configurações → Conexões → Redes sociais.
          </p>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
