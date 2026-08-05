/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cliente sem mídia — o que as telas de mídia mostram
 * ─────────────────────────────────────────────────────────────────────────────
 *  Existe um tipo de cliente que a Selva atende só no Site: sem Meta, sem
 *  Google, sem campanha. Ele é um cliente normal — aparece no seletor, tem foto,
 *  entra no Jornalzinho, recebe alerta técnico. O que ele não tem é mídia.
 *
 *  Sem esta tela, o Dashboard dele abre com tudo zerado — e "R$ 0,00 de
 *  investimento, 0 conversões" é indistinguível de uma campanha que parou de
 *  rodar. A pessoa vai investigar um problema que não existe.
 *
 *  E o convite a "Conectar conta" seria pior ainda: sugere que falta uma
 *  configuração obrigatória. Não falta nada — o escopo deste cliente é outro.
 *
 *  Por isso o texto afirma o escopo em vez de apontar ausência, e leva para
 *  onde há o que ver.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Globe, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/** Este cliente é atendido só no Site? */
export const clienteSemMidia = (
  conta: { somenteMonitoramento?: boolean | null } | null | undefined,
): boolean => !!conta?.somenteMonitoramento;

export function SemMidia({ nome, accountId, area }: {
  nome?: string | null;
  accountId?: number | null;
  /** Nome da tela, para a frase dizer do que se trata. */
  area: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
        <Globe className="w-6 h-6 text-accent" />
      </div>
      <h2 className="text-lg font-semibold mb-2">
        {nome ?? "Este cliente"} é atendido no Site
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-5">
        Não há mídia conectada para este cliente, então {area} fica sem conteúdo.
        Não falta configuração — o acompanhamento acontece na área de Site.
      </p>
      <Link
        href={accountId ? `/site?account=${accountId}` : "/site"}
        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5"
      >
        Abrir Site <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
