/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Avatar clicável — o avatar É o botão de trocar a foto
 * ─────────────────────────────────────────────────────────────────────────────
 *  Usado em dois lugares que parecem iguais e NÃO são a mesma entidade:
 *
 *   • cliente do Tracker (`meta_ad_accounts`) — Configurações → Contas
 *   • cliente do cofre  (`access_clients`)    — Acessos
 *
 *  Eles não compartilham foto de propósito: "Santé" e "Carol Garrafa" são dois
 *  clientes distintos no cofre e uma única conta de mídia no Tracker, e há
 *  cliente com acesso guardado que nunca teve acompanhamento. Cada lado tem a
 *  sua imagem; o que se compartilha é este componente, não o dado.
 *
 *  Três garantias, iguais nos dois usos:
 *   1. Nunca fica sem representação: foto > iniciais.
 *   2. Prévia imediata (objectURL) enquanto sobe — num upload lento, sem isso o
 *      clique parece não ter funcionado e a pessoa escolhe o arquivo de novo.
 *   3. Dá para desfazer, quando o chamador oferece remoção.
 *
 *  A permissão real é do servidor; `podeEditar` só evita oferecer uma ação que
 *  voltaria 403.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

/** Iniciais do nome — fallback quando não há foto nenhuma. */
export function iniciaisDe(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "??";
  const partes = limpo.split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : limpo.slice(0, 2);
  return letras.toUpperCase();
}

export function AvatarUpload({
  nome,
  pictureUrl,
  podeEditar,
  endpoint,
  campoId,
  id,
  onAtualizado,
  onRemover,
  removendo = false,
  className = "w-10 h-10 rounded-full",
  textoClasse = "text-xs",
}: {
  nome: string | null | undefined;
  /** URL já resolvida pelo servidor. */
  pictureUrl: string | null | undefined;
  podeEditar: boolean;
  /** Rota multipart que recebe o binário. */
  endpoint: string;
  /** Nome do campo do formulário que carrega o id (accountId, accessClientId…). */
  campoId: string;
  id: number;
  /** Recarrega a fonte da URL depois do upload. */
  onAtualizado: () => Promise<unknown> | unknown;
  /** Só aparece quando existe foto própria para remover. */
  onRemover?: () => void;
  removendo?: boolean;
  className?: string;
  textoClasse?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);

  // objectURL segura o arquivo em memória até ser revogado. Sem esta limpeza,
  // trocar a foto de vários clientes numa sessão vaza um blob por troca.
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  async function enviar(file: File) {
    const url = URL.createObjectURL(file);
    setPrevia(url);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append(campoId, String(id));
      const resp = await fetch(endpoint, { method: "POST", body: fd, credentials: "include" });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha no upload.");
      }
      await onAtualizado();
      toast.success("Foto atualizada.");
    } catch (e: any) {
      setPrevia(null); // prévia que sobrevive a erro mente sobre o estado salvo
      toast.error(e?.message ?? "Falha no upload.");
    } finally {
      setEnviando(false);
    }
  }

  const mostrada = previa ?? pictureUrl ?? null;

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="relative">
        <button
          type="button"
          onClick={() => podeEditar && !enviando && fileRef.current?.click()}
          disabled={!podeEditar || enviando}
          title={podeEditar ? "Clique para trocar a foto" : (nome ?? "")}
          aria-label={podeEditar ? `Trocar a foto de ${nome ?? "cliente"}` : undefined}
          className={`group ${className} bg-muted border border-border overflow-hidden flex items-center justify-center relative ${podeEditar ? "cursor-pointer" : "cursor-default"}`}
        >
          {mostrada
            ? <img src={mostrada} alt={nome ?? ""} className="w-full h-full object-cover" />
            : <span className={`${textoClasse} font-medium text-muted-foreground`}>{iniciaisDe(nome)}</span>}

          {/* Convite ao clique só no hover: o card não vira mural de ícones
              quando ninguém está mexendo em foto. */}
          {podeEditar && !enviando && (
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/55">
              <Camera className="w-4 h-4 text-white" />
            </span>
          )}
          {enviando && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </span>
          )}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = ""; // permite reescolher o MESMO arquivo após um erro
          }}
        />
      </div>

      {podeEditar && onRemover && (
        <button
          type="button"
          onClick={onRemover}
          disabled={removendo || enviando}
          title="Remover a foto — volta para as iniciais"
          className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
