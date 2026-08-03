/**
 * Foto do cliente do TRACKER (`meta_ad_accounts`) — Configurações → Contas.
 *
 * A mecânica (clique no avatar, prévia, iniciais) mora em [[AvatarUpload]];
 * aqui ficam só as amarras deste lado: a rota de upload, a mutation de remoção
 * e qual query recarregar.
 *
 * A foto vai para `pictureKey`, coluna PRÓPRIA — a `pictureUrl` vem da Meta e é
 * reescrita a cada import de contas, então uma foto escolhida pelo time não
 * pode morar lá. Ver server/uploadsRoutes.ts.
 *
 * Não confundir com a foto do cliente do COFRE (`access_clients`): são
 * entidades diferentes e cada uma tem a sua imagem. Ver AccessClientModal.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AvatarUpload } from "./AvatarUpload";

export { iniciaisDe } from "./AvatarUpload";

export function FotoDoCliente({
  accountId,
  nome,
  pictureUrl,
  temFotoPropria,
  podeEditar,
}: {
  accountId: number;
  nome: string | null | undefined;
  /** URL já resolvida pelo servidor (foto enviada à mão OU a da Meta). */
  pictureUrl: string | null | undefined;
  /** Existe foto enviada à mão? Só ela pode ser removida. */
  temFotoPropria: boolean;
  podeEditar: boolean;
}) {
  const utils = trpc.useUtils();

  const remover = trpc.accounts.removerFoto.useMutation({
    onSuccess: async () => {
      await utils.accounts.list.invalidate();
      toast.success("Foto removida.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AvatarUpload
      nome={nome}
      pictureUrl={pictureUrl}
      podeEditar={podeEditar}
      endpoint="/api/uploads/account-picture"
      campoId="accountId"
      id={accountId}
      // A lista é a fonte da URL em toda a aplicação (sidebar, seletor,
      // cabeçalho). Invalidar aqui faz a foto nova aparecer nos três de uma vez.
      onAtualizado={() => utils.accounts.list.invalidate()}
      onRemover={temFotoPropria ? () => remover.mutate({ accountId }) : undefined}
      removendo={remover.isPending}
    />
  );
}
