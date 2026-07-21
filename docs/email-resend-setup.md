# Ligar o envio de e-mail (Resend)

O código já está pronto e no ar. Falta a conta e a chave — três passos, ~15 min.

## Por que Resend e não SMTP

O Railway **bloqueia porta SMTP de saída**. Comprovado dentro do container:
HTTPS conecta, 25/465/587/2525 dão timeout. Detalhes em
[auditoria-digest-email.md](auditoria-digest-email.md).

O código escolhe o transporte sozinho: **havendo `RESEND_API_KEY`, usa Resend
por HTTPS**; sem ela, cai no SMTP (que funciona no ambiente local).

---

## Passo 1 — criar a conta

[resend.com](https://resend.com) → conta gratuita.
O plano grátis dá **3.000 e-mails/mês (100/dia)**. O uso previsto é ~15/dia.

## Passo 2 — verificar o domínio `selva.agency`

Em **Domains → Add Domain**, informe `selva.agency`. O Resend devolve registros
DNS (um `MX` e dois `TXT`, sendo um deles a chave DKIM) para adicionar onde o
domínio está hospedado.

Sem essa verificação o Resend **recusa** enviar como `contato@selva.agency` — e
o erro aparece no diagnóstico com essas palavras (`domain not verified`).

> Vale adicionar também o registro **DMARC** que o Resend sugere. Não é
> obrigatório para funcionar, mas melhora a entrega e reduz a chance de o
> Jornalzinho cair em spam.

## Passo 3 — a chave no Railway

Em **API Keys → Create**, permissão de envio. Depois:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Opcional — o remetente, se quiser diferente do atual:

```
EMAIL_FROM=SELVA Spaces <contato@selva.agency>
```

Sem `EMAIL_FROM` ele usa o `SMTP_FROM` que já existe
(`Selva Agency <contato@selva.agency>`).

---

## Conferir se funcionou

O diagnóstico fica em **Configurações do Spaces → Notificações**, visível para
admin e desenvolvedor. Mostra o transporte em uso, o placar de enviados /
falhados / dry-run do período, **a mensagem real do último erro** e os últimos
envios com destinatário original e final.

O botão **Testar envio** dispara um e-mail de verdade. Ele é restrito no
servidor: se `EMAIL_TEST_RECIPIENT` não estiver definida, **recusa** em vez de
mandar para a lista real.

---

## Variáveis de e-mail

| Variável | Para que serve |
|---|---|
| `RESEND_API_KEY` | Liga o transporte HTTPS. Sem ela, o sistema tenta SMTP |
| `EMAIL_FROM` | Remetente. Precisa ser do domínio verificado |
| `EMAIL_TEST_RECIPIENT` | Lista por vírgula. **Desvia todo e-mail** para esses endereços, põe `[TESTE]` no assunto e uma etiqueta no corpo |
| `EMAIL_DRY_RUN` | `true` = nada sai, tudo é registrado. Fora de produção é o padrão |

### Enquanto durar a validação

```
EMAIL_TEST_RECIPIENT=felberg@selva.agency,dev@selva.agency
```

Está definida agora. **Todo e-mail do sistema — inclusive o automático das
07:30 — vai só para esses dois.** Nenhum colaborador recebe nada enquanto ela
existir.

**Para valer de verdade, é preciso remover essa variável.** Enquanto ela estiver
lá, o Jornalzinho não chega a ninguém — e é assim de propósito: o desvio é o que
permite validar conteúdo e visual sem lotar a caixa de todo mundo.
