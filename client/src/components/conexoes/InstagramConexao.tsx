/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Redes Sociais — credencial própria e vínculo por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas FONTES, e a separação é o produto:
 *
 *   AGÊNCIA     um System User token, guardado uma vez, cifrado. Chega ao
 *               Instagram pelo Portfólio e pela Página.
 *   LOGIN       o dono da conta autoriza por OAuth. Sem Página, sem Portfólio,
 *               sem ativo atribuído no Business Manager.
 *
 *  Qual usar é decisão de `shared/fontesSociais`, e ela NUNCA troca em silêncio:
 *  um login expirado não vira "conectado via agência" sem avisar, porque isso
 *  faria o cliente quebrado parecer igual ao que nunca conectou.
 *
 *  O token é separado do de Meta Ads por decisão de produto: campanhas caindo
 *  não podem derrubar o orgânico, e vice-versa. Antes disto o Instagram usava
 *  `accounts[0].accessToken` — o token de mídia de uma conta arbitrária.
 *
 *  ── Conta pessoal não é erro ───────────────────────────────────────────────
 *  Quem decide como cada estado aparece é `shared/instagram`, e a regra que ele
 *  protege é esta: perfil pessoal é estado VÁLIDO com limitação conhecida.
 *  Aparece como "limitado", nunca vermelho — tratá-lo como falha faria alguém
 *  tentar consertar uma conta que está como o cliente quer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Instagram, Loader2, Key, Link2, Stethoscope, LogIn, Unplug, Link2Off, Microscope, DatabaseZap, Search, Clock, PlayCircle, CalendarClock } from "lucide-react";
import { lerVinculo, ROTULO_TIPO, selecaoPendente, type FonteNome, type StatusInsight, type TipoConta } from "@shared/instagram";
import { escolherFonte, ROTULO_FONTE } from "@shared/fontesSociais";
import { ROTULO_VIA, viaDoVinculo, type OpcaoDeVinculo } from "@shared/vinculoInstagram";

/** O que `paginasDisponiveis` devolve — a forma que a tela consome. */
interface PaginasDoPortfolio {
  /** As duas vias na mesma lista — ver `opcoesDeVinculo` em shared. */
  opcoes: OpcaoDeVinculo[];
  avisos: string[];
  /** Quantas só existem sem Página. É o caso Musa, e vale dizer na tela. */
  semPagina: number;
}

/**
 * O que o callback do OAuth devolve na URL.
 *
 * O redirect volta com `?instagram=<código>` e, sem ninguém ler, o usuário
 * chegaria numa tela idêntica à que deixou — sem saber se conectou, se cancelou
 * ou se falhou. Códigos curtos, e não a mensagem da Meta: querystring vira log
 * de proxy e histórico de navegador.
 */
const RETORNO_OAUTH: Record<string, { tom: "ok" | "erro" | "aviso"; texto: string }> = {
  conectado: { tom: "ok", texto: "Instagram conectado pelo login da conta. Rode Testar para ver as métricas." },
  cancelado: { tom: "aviso", texto: "Autorização cancelada na tela do Instagram. Nada foi alterado." },
  negado: { tom: "aviso", texto: "O Instagram negou a autorização. Confira se a conta é profissional e se foi convidada como testadora do app." },
  retorno_incompleto: { tom: "erro", texto: "O Instagram voltou sem o código de autorização. Tente conectar de novo." },
  state_invalido: { tom: "erro", texto: "O retorno não confere com quem iniciou a conexão. Comece de novo pelo botão Conectar." },
  erro_na_troca: { tom: "erro", texto: "A troca do código por token falhou. O detalhe está no log do servidor; rode Testar para o diagnóstico." },
  sem_permissao: { tom: "erro", texto: "Seu usuário não pode gerenciar conexões." },
  nao_configurado: { tom: "erro", texto: "Faltam INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET no ambiente." },
  cliente_invalido: { tom: "erro", texto: "Cliente inválido no início da conexão." },
};

const COR_NIVEL: Record<string, string> = {
  ok: "text-emerald-600 border-emerald-500/30 bg-emerald-500/5",
  limitado: "text-sky-600 border-sky-500/30 bg-sky-500/5",
  pendente: "text-amber-600 border-amber-500/30 bg-amber-500/5",
  erro: "text-destructive border-destructive/30 bg-destructive/5",
};

/**
 * Busca a lista de clientes por conta própria — o hub de Conexões monta várias
 * seções e não deve saber o que cada uma precisa. Só admin/dev veem a área,
 * pela mesma regra do resto do hub.
 */
export function InstagramConexao() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent((user as { role?: string } | null)?.role);
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  if (!podeGerenciar) return null;
  return <PainelInstagram clientes={clientesQ.data ?? []} />;
}

function PainelInstagram({ clientes }: { clientes: { id: number; accountName: string | null }[] }) {
  const utils = trpc.useUtils();
  const [token, setToken] = useState("");
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<null | PaginasDoPortfolio>(null);
  const [escolha, setEscolha] = useState<Record<number, string>>({});

  const credQ = trpc.social.credencial.useQuery();
  const vinculosQ = trpc.social.vinculos.useQuery();
  const fontesQ = trpc.social.fontes.useQuery();

  const salvar = trpc.social.salvarCredencial.useMutation({
    onSuccess: (r) => {
      setToken(""); setDiagnostico(r.diagnostico);
      utils.social.credencial.invalidate();
      toast.success(`Credencial salva (impressão ${r.impressao}).`);
    },
    onError: (e) => { setDiagnostico(e.message); toast.error("O token não passou — veja o diagnóstico."); },
  });

  const diag = trpc.social.diagnosticar.useMutation({
    onSuccess: (d) => {
      setDiagnostico(d.texto);
      utils.social.vinculos.invalidate();
      d.ok ? toast.success("Diagnóstico concluído.") : toast.error("Diagnóstico encontrou problema — veja abaixo.");
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  /**
   * Sondagem do caso Musa. Fica junto do diagnóstico da CREDENCIAL, e não no
   * cartão de um cliente: a pergunta é sobre o portfólio inteiro, e a Musa nem
   * tem vínculo ainda — não haveria cartão onde clicar.
   */
  const sondarDireto = trpc.social.sondarInstagramDireto.useMutation({
    onSuccess: (r) => {
      setDiagnostico(r.texto);
      r.somenteDiretos.length > 0
        ? toast.success(`${r.somenteDiretos.length} Instagram só alcançável sem Página.`)
        : toast.info("Nenhum Instagram exclusivo da via direta — todos já vêm por Página.");
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  const listar = trpc.social.paginasDisponiveis.useMutation({
    onSuccess: (r) => {
      setPaginas(r);
      toast.success(
        `${r.opcoes.length} conta(s) no portfólio` +
        (r.semPagina > 0 ? ` · ${r.semPagina} sem Página` : ""));
      if (r.avisos.length) toast.info(`Avisos: ${r.avisos.join(" · ")}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const vincular = trpc.social.vincular.useMutation({
    onSuccess: (r) => {
      utils.social.vinculos.invalidate();
      // Limpa a escolha local: ela existe só para marcar "ainda não salvo", e
      // mantida depois de salvar deixaria o aviso de pendência aceso à toa.
      setEscolha((e) => { const { [r.accountId]: _, ...resto } = e; return resto; });
      toast.success("Página vinculada. Rode Testar para atualizar métricas e status.");
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * A chave da opção que corresponde ao vínculo salvo.
   *
   * O seletor mistura duas vias, então o valor não é mais o pageId: uma conta
   * direta não tem Página, e comparar por pageId a deixaria sempre marcada como
   * "nada escolhido".
   */
  const chaveSalva = (v?: { pageId?: string | null; instagramUserId?: string | null }): string | null =>
    v?.pageId ? `pagina:${v.pageId}` : v?.instagramUserId ? `direto:${v.instagramUserId}` : null;

  const cred = credQ.data;
  const vinculos = vinculosQ.data ?? [];
  const vinculoDe = (accountId: number) => vinculos.find((v) => v.accountId === accountId);

  const fontes = fontesQ.data;
  const oauthDe = (accountId: number) => fontes?.clientes.find((c) => c.accountId === accountId);

  /**
   * A MESMA decisão que o servidor toma, rodando aqui.
   *
   * É por isso que ela é pura e mora em shared: duas cópias da regra fariam a
   * tela dizer "conectado via agência" para um cliente que o servidor recusa.
   */
  const fonteDe = (accountId: number) => {
    const o = oauthDe(accountId);
    const expirado = typeof o?.diasParaExpirar === "number" && o.diasParaExpirar <= 0;
    return escolherFonte([
      {
        fonte: "oauth_conta",
        configurada: !!o,
        utilizavel: !!o && !expirado,
        diasParaExpirar: o?.diasParaExpirar ?? null,
        problema: !o ? null
          : expirado ? "O login desta conta expirou. Token expirado não se renova — é preciso reconectar a conta."
          : o.refreshFalhaDetalhe ? `A última renovação automática falhou: ${o.refreshFalhaDetalhe}`
          : null,
      },
      {
        fonte: "agencia_system_user",
        configurada: !!fontes?.agencia.existe,
        utilizavel: !!fontes?.agencia.existe && fontes.agencia.ultimoTeste !== "erro",
        problema: fontes?.agencia.ultimoTeste === "erro"
          ? "O token da agência falhou no último teste. Rode o diagnóstico geral para o detalhe."
          : null,
      },
    ]);
  };

  /**
   * Lê o retorno do OAuth uma vez e LIMPA o parâmetro da URL — senão um F5
   * repetiria "conectado" para sempre, e o aviso viraria ruído que se aprende a
   * ignorar justo onde ele precisa ser notado.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const codigo = url.searchParams.get("instagram");
    if (!codigo) return;
    const r = RETORNO_OAUTH[codigo] ?? { tom: "erro" as const, texto: `Retorno não reconhecido: ${codigo}` };
    if (r.tom === "ok") { toast.success(r.texto); utils.social.fontes.invalidate(); utils.social.vinculos.invalidate(); }
    else if (r.tom === "aviso") toast.info(r.texto);
    else toast.error(r.texto);
    url.searchParams.delete("instagram");
    window.history.replaceState({}, "", url.toString());
  }, [utils]);

  /**
   * Fase 0. Cai no MESMO painel de diagnóstico: é ali que se olha quando algo
   * não responde, e um segundo lugar para ler resultado de medição faria os dois
   * competirem pela atenção.
   */
  const sondar = trpc.social.sondar.useMutation({
    onSuccess: (r) => {
      setDiagnostico(r.texto);
      toast.success(`Sondagem concluída: ${r.disponiveis} de ${r.disponiveis + r.indisponiveis} itens disponíveis.`);
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  /**
   * Roda a coleta de um cliente agora, para conferir a linha gravada antes de o
   * cron ligar. Gravar sozinho às 06:20 numa tabela que ninguém olhou é
   * descobrir o erro depois de uma semana de linhas ruins.
   */
  const coletar = trpc.social.coletarAgora.useMutation({
    onSuccess: (r) => {
      setDiagnostico(`coleta manual · status ${r.status}\n${r.nota}`);
      r.status === "erro" || r.status === "pulado"
        ? toast.error(`Coleta ${r.status}: ${r.nota}`)
        : toast.success(`Coleta ${r.status} — ${r.nota}`);
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  const horarios = trpc.social.sondarHorarios.useMutation({
    onSuccess: (r) => {
      setDiagnostico(r.texto);
      r.formaUtil ? toast.success(`Horários: forma "${r.formaUtil}" respondeu.`)
                  : toast.error("Nenhuma forma devolveu mapa de horários para esta conta.");
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  /**
   * Ferramenta de diagnóstico: roda a fila inteira como o cron roda.
   *
   * Fica na área da credencial, e não no cartão de um cliente — ela não é sobre
   * um cliente, é sobre a rodada.
   */
  const rodada = trpc.social.rodarColetaAgora.useMutation({
    onSuccess: (r) => {
      toast.success(`Rodada iniciada para ${r.contas} conta(s). Acompanhe em Redes sociais → última coleta manual.`);
      setDiagnostico(
        `rodada manual iniciada · ${r.contas} conta(s)\n\n` +
        "Ela roda em segundo plano e leva alguns minutos. O resultado — status por\n" +
        "conta, tempo e número de chamadas — aparece na linha de status da página\n" +
        "Redes sociais quando terminar.",
      );
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  const janela = trpc.social.sondarJanela.useMutation({
    onSuccess: (r) => {
      setDiagnostico(r.texto);
      r.fusoDoDia ? toast.success(`Dia vira em ${r.fusoDoDia.split(" ")[0]}.`)
                  : toast.info("Não deu para deduzir o fuso — veja o detalhe.");
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  const desvincular = trpc.social.desvincular.useMutation({
    onSuccess: (r) => {
      utils.social.vinculos.invalidate();
      utils.social.fontes.invalidate();
      toast.success(r.desvinculado
        ? "Vínculo desfeito. O cliente continua aqui; escolha outra Página quando quiser."
        : "Este cliente não tinha vínculo para desfazer.");
    },
    onError: (e) => toast.error(e.message),
  });

  const desconectar = trpc.social.desconectarConta.useMutation({
    onSuccess: () => { utils.social.fontes.invalidate(); toast.success("Login da conta desconectado."); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2"><Instagram className="w-4 h-4" /> Redes Sociais · Instagram</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Credencial <strong>própria</strong>, separada de Meta Ads — se campanhas caírem, o orgânico continua.
        </p>
      </div>

      {/* ── Credencial ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5" /> Credencial da agência
        </p>
        {cred?.existe ? (
          <p className="text-xs text-muted-foreground">
            Cadastrada · impressão <span className="font-mono">{cred.impressao}</span>
            {cred.lastTestAt && ` · último teste ${new Date(cred.lastTestAt).toLocaleString("pt-BR")}`}
            {cred.lastTestStatus && ` (${cred.lastTestStatus})`}
          </p>
        ) : (
          <p className="text-xs text-amber-600">
            Nenhuma credencial cadastrada. Cole um System User token do Portfólio com
            <strong> pages_show_list</strong>, <strong>pages_read_engagement</strong>,
            <strong> instagram_basic</strong> e <strong>instagram_manage_insights</strong>.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <input type="password" autoComplete="off" placeholder={cred?.existe ? "cole um token novo para substituir" : "System User token"}
            value={token} onChange={(e) => setToken(e.target.value)}
            className="flex-1 min-w-[200px] text-xs font-mono border border-border rounded-lg px-3 py-2 bg-background" />
          <button onClick={() => salvar.mutate({ token })} disabled={!token || salvar.isPending}
            className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-60">
            {salvar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Salvar credencial
          </button>
          <button onClick={() => diag.mutate({})} disabled={!cred?.existe || diag.isPending}
            className="text-xs px-3 py-2 rounded-lg border border-border flex items-center gap-1.5 disabled:opacity-60">
            {diag.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
            Diagnóstico
          </button>
          <button onClick={() => { if (confirm("Rodar a coleta de TODAS as contas agora?\n\nÉ o mesmo fluxo do cron das 06:20 e leva alguns minutos.")) rodada.mutate({}); }}
            disabled={!cred?.existe || rodada.isPending}
            title="Dispara a rodada completa, igual ao cron — para medir o comportamento real"
            className="text-xs px-3 py-2 rounded-lg border border-border flex items-center gap-1.5 disabled:opacity-60 text-muted-foreground">
            {rodada.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Rodar coleta completa
          </button>
          <button onClick={() => sondarDireto.mutate()} disabled={!cred?.existe || sondarDireto.isPending}
            title="Procura Instagram alcançável pelo Portfólio sem passar por Página — o caso Musa"
            className="text-xs px-3 py-2 rounded-lg border border-border flex items-center gap-1.5 disabled:opacity-60 text-muted-foreground">
            {sondarDireto.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Instagram sem Página
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          O token é testado ANTES de ser gravado — um token que não alcança o portfólio só apareceria como
          problema no primeiro uso, longe daqui. Ele é cifrado e nunca volta para a tela.
        </p>
      </div>

      {/* ── Diagnóstico, copiável ──────────────────────────────────────── */}
      {diagnostico && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[11px] font-semibold text-muted-foreground">Diagnóstico</p>
            <button onClick={() => setDiagnostico(null)} className="text-[11px] text-muted-foreground hover:text-foreground">fechar</button>
          </div>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all select-all max-h-72 overflow-y-auto">{diagnostico}</pre>
          <p className="text-[10px] text-muted-foreground mt-1">Sanitizado — nenhum token aparece aqui.</p>
        </div>
      )}

      {/* ── Vínculo por cliente ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Página e Instagram por cliente
          </p>
          <button onClick={() => listar.mutate()} disabled={!cred?.existe || listar.isPending}
            className="text-[11px] px-2.5 py-1 rounded border border-border disabled:opacity-60 flex items-center gap-1.5">
            {listar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Buscar contas do portfólio
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {clientes.map((c) => {
            const v = vinculoDe(c.id);
            const fonteEscolhida = fonteDe(c.id);
            const oauth = oauthDe(c.id);
            const leitura = lerVinculo({
              estado: !v?.pageId ? "SEM_PAGINA" : !v?.instagramUserId ? "PAGINA_SEM_INSTAGRAM" : "VINCULADO",
              tipoConta: (v?.tipoConta as TipoConta) ?? "DESCONHECIDO",
              statusInsight: (v?.statusInsight as StatusInsight) ?? "NAO_TESTADO",
              username: v?.instagramUsername, pageName: v?.pageName,
            });
            return (
              <div key={c.id} className={`rounded-lg border p-2.5 flex flex-col gap-1.5 ${COR_NIVEL[leitura.nivel]}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{c.accountName ?? `#${c.id}`}</span>
                  {v?.instagramUsername && (
                    <a href={`https://instagram.com/${v.instagramUsername}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] font-mono underline">@{v.instagramUsername}</a>
                  )}
                  {v && <span className="text-[10px]">{ROTULO_TIPO[(v.tipoConta as TipoConta) ?? "DESCONHECIDO"]}</span>}
                </div>
                <p className="text-[11px] font-medium">{leitura.titulo}</p>
                <p className="text-[10px] text-muted-foreground">{leitura.explicacao}</p>

                {/* De ONDE vêm os dados, e por que a outra fonte não entrou.
                    Sem esta linha, um login expirado e um cliente que nunca
                    conectou por login ficam idênticos na tela. */}
                <p className={`text-[10px] ${fonteEscolhida.nivel === "pendente" ? "font-medium text-amber-600" : "text-muted-foreground"}`}>
                  {fonteEscolhida.usada
                    ? `Fonte: ${ROTULO_FONTE[fonteEscolhida.usada as FonteNome]}`
                    : `Fonte: nenhuma — ${fonteEscolhida.titulo}`}
                  {" · "}{fonteEscolhida.detalhe}
                </p>

                {/* O que está NO BANCO, e não o que o seletor mostra. É a única
                    forma de responder "vinculou mesmo?" olhando a tela — sem
                    isto, a dúvida só se resolve consultando o banco. */}
                {oauth && (
                  <p className="text-[10px] font-mono text-muted-foreground break-all">
                    login: impressão {oauth.impressao}
                    {oauth.instagramUsername ? ` · @${oauth.instagramUsername}` : ""}
                    {typeof oauth.diasParaExpirar === "number"
                      ? oauth.diasParaExpirar > 0
                        ? ` · expira em ${oauth.diasParaExpirar} dia(s)`
                        : " · EXPIRADO"
                      : " · sem prazo informado"}
                    {oauth.refreshFalhaDetalhe ? ` · última renovação falhou` : ""}
                  </p>
                )}

                {(v?.pageId || v?.instagramUserId) && (
                  <p className="text-[10px] font-mono text-muted-foreground break-all">
                    salvo: {ROTULO_VIA[viaDoVinculo(v)].toLowerCase()}
                    {v.pageId ? ` · página ${v.pageId}` : ""}
                    {v.instagramUserId ? ` · instagram ${v.instagramUserId}` : " · sem instagram"}
                    {v.lastTestAt
                      ? ` · testado ${new Date(v.lastTestAt).toLocaleString("pt-BR")} (${v.lastTestStatus})`
                      : " · nunca testado"}
                  </p>
                )}

                {/* Selecionado ≠ salvo. Aviso explícito enquanto diferirem. */}
                {selecaoPendente({ escolhido: escolha[c.id], salvo: chaveSalva(v) }) && (
                  <p className="text-[10px] font-medium text-amber-600">
                    Página selecionada, ainda não vinculada — clique em Vincular para salvar.
                  </p>
                )}

                <div className="flex gap-1.5 flex-wrap items-center mt-1">
                  {paginas ? (
                    <>
                      <select value={escolha[c.id] ?? chaveSalva(v) ?? ""}
                        onChange={(e) => setEscolha({ ...escolha, [c.id]: e.target.value })}
                        className="text-[11px] border border-border rounded px-2 py-1 bg-background max-w-[280px]">
                        <option value="">— escolher conta —</option>
                        <optgroup label="Por Página do Facebook">
                          {paginas.opcoes.filter((o) => o.via === "pagina").map((o) => (
                            <option key={o.chave} value={o.chave}>{o.rotulo}</option>
                          ))}
                        </optgroup>
                        {paginas.opcoes.some((o) => o.via === "instagram_direto") && (
                          <optgroup label="Instagram direto (sem Página)">
                            {paginas.opcoes.filter((o) => o.via === "instagram_direto").map((o) => (
                              <option key={o.chave} value={o.chave}>{o.rotulo}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button
                        onClick={() => {
                          const chave = escolha[c.id] ?? chaveSalva(v);
                          const p = paginas.opcoes.find((x) => x.chave === chave);
                          if (!p) return toast.error("Escolha uma conta.");
                          // Trocar a Página de um cliente JÁ vinculado é a ação
                          // que erra caro: o número de um cliente passa a
                          // aparecer no outro, e nada no resultado denuncia isso.
                          // Vincular pela primeira vez não pergunta nada.
                          if (v?.instagramUserId && v.instagramUserId !== p.instagramUserId) {
                            const de = v.instagramUsername ? `@${v.instagramUsername}` : v.pageName ?? v.instagramUserId;
                            if (!confirm(
                              `Você está trocando a conta vinculada de ${c.accountName ?? `#${c.id}`}.\n\n` +
                              `De:   ${de}\nPara: ${p.rotulo}\n\n` +
                              "O resultado do último teste será descartado, porque ele era sobre a conta anterior. Confirmar?",
                            )) return;
                          }
                          vincular.mutate({
                            accountId: c.id, pageId: p.pageId, pageName: p.pageName,
                            instagramUserId: p.instagramUserId,
                            instagramUsername: p.instagramUsername,
                            tipoConta: p.tipoConta,
                          });
                        }}
                        disabled={vincular.isPending}
                        className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-60">
                        Vincular
                      </button>
                    </>
                  ) : null}
                  {/* FORA do `paginas &&`: testar depende do vínculo salvo, não
                      do portfólio carregado. Preso ali dentro, recarregar a tela
                      obrigava a buscar as Páginas de novo só para poder testar —
                      e sobrava só o diagnóstico geral, que não fala de cliente. */}
                  {/* Conectar é por REDIRECT, não por mutation: o OAuth sai do
                      app e volta. Um <a> deixa isso explícito — e o accountId
                      viaja assinado dentro do state, não solto na query. */}
                  {fontes?.oauthConfigurado && (
                    <a href={`/api/social/instagram/start?accountId=${c.id}`}
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 hover:bg-muted">
                      <LogIn className="w-3 h-3" />
                      {oauth ? "Reconectar Instagram" : "Conectar Instagram da conta"}
                    </a>
                  )}
                  {/* Desvincular ≠ Desconectar: aquele desfaz QUAL conta é de
                      quem; este remove a CREDENCIAL. Corrigir uma Página errada
                      não pode custar a conexão inteira. */}
                  {(v?.pageId || v?.instagramUserId) && (
                    <button
                      onClick={() => {
                        if (confirm(
                          `Desfazer o vínculo de Instagram de ${c.accountName ?? `#${c.id}`}?\n\n` +
                          "A Página e o Instagram deixam de estar associados a este cliente. " +
                          "O cliente, o token da agência e o login da conta NÃO são afetados.",
                        )) desvincular.mutate({ accountId: c.id });
                      }}
                      disabled={desvincular.isPending}
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 text-muted-foreground">
                      <Link2Off className="w-3 h-3" /> Desvincular
                    </button>
                  )}
                  {oauth && (
                    <button onClick={() => { if (confirm(`Desconectar o login do Instagram de ${c.accountName ?? `#${c.id}`}?`)) desconectar.mutate({ accountId: c.id }); }}
                      disabled={desconectar.isPending}
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 text-muted-foreground">
                      <Unplug className="w-3 h-3" /> Desconectar
                    </button>
                  )}
                  {/* Basta haver INSTAGRAM — e não Página. A condição antiga
                      pedia pageId, então o vínculo direto ficava sem Testar: a
                      Musa aparecia como "nunca testado" sem ter como sair
                      disso, enquanto Sondar e Coletar funcionavam ao lado. */}
                  {(v?.instagramUserId || oauth) && (
                    <button onClick={() => diag.mutate({ accountId: c.id })} disabled={diag.isPending}
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1">
                      {diag.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Testar
                    </button>
                  )}
                  {/* Sondar é mais caro que Testar (~37 chamadas) e roda uma vez
                      por conta, para decidir o modelo de dados. Fica ao lado,
                      mas com nome que não convida ao clique repetido. */}
                  {(v?.instagramUserId || oauth) && (
                    <button onClick={() => coletar.mutate({ accountId: c.id })} disabled={coletar.isPending}
                      title="Grava agora o snapshot de hoje deste cliente"
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 text-muted-foreground">
                      {coletar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <DatabaseZap className="w-3 h-3" />}
                      Coletar agora
                    </button>
                  )}
                  {v?.instagramUserId && (
                    <button onClick={() => janela.mutate({ accountId: c.id })} disabled={janela.isPending}
                      title="Que janela profile_views cobre, e em que fuso o dia vira"
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 text-muted-foreground">
                      {janela.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                      Sondar janela
                    </button>
                  )}
                  {v?.instagramUserId && (
                    <button onClick={() => horarios.mutate({ accountId: c.id })} disabled={horarios.isPending}
                      title="Mede o que online_followers entrega para esta conta"
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 text-muted-foreground">
                      {horarios.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                      Sondar horários
                    </button>
                  )}
                  {(v?.instagramUserId || oauth) && (
                    <button onClick={() => sondar.mutate({ accountId: c.id })} disabled={sondar.isPending}
                      title="Pergunta à Meta, campo a campo, o que ela entrega para esta conta"
                      className="text-[11px] px-2 py-1 rounded border border-border flex items-center gap-1 text-muted-foreground">
                      {sondar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Microscope className="w-3 h-3" />}
                      Sondar dados
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {fontes && !fontes.oauthConfigurado && (
          <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
            O login por conta ainda não está configurado: faltam <strong>INSTAGRAM_APP_ID</strong> e
            <strong> INSTAGRAM_APP_SECRET</strong> no ambiente. Sem eles só existe a fonte da agência.
          </p>
        )}

        {!paginas && (
          <p className="text-[10px] text-muted-foreground">
            Use <strong>Buscar contas do portfólio</strong> para escolher a conta de cada cliente.
            A lista traz as Páginas e também os Instagram que o Portfólio expõe sem Página.
          </p>
        )}
      </div>
    </div>
  );
}
