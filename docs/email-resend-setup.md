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

## Situação atual (21/07) — modo sandbox, DNS intocado

**O transporte está validado.** Decisão do dia: não mexer em DNS nem nos MX do
Google Workspace só para testar. Enquanto isso:

```
RESEND_API_KEY=re_…                          (definida)
EMAIL_FROM=SELVA Spaces <onboarding@resend.dev>   remetente sandbox do Resend
EMAIL_TEST_RECIPIENT=contato@selva.agency         dono da conta Resend
```

Provas colhidas:

| Teste | Resultado |
|---|---|
| Resend por HTTPS de dentro do container Railway | **HTTP 200** ✅ |
| Caminho completo do app (`sendEmail`) | **ok, status `sent`, transporte `resend`** ✅ |
| Desvio de destinatário | destino era `felberg@`, entregou em `contato@` ✅ |

Antes de trocar o remetente, o Resend recusava com a mensagem exata:

```
Resend 403: The selva.agency domain is not verified.
```

Que é o comportamento correto — e agora aparece no diagnóstico em vez de sumir.

**Limite do sandbox:** com `onboarding@resend.dev` o Resend só entrega para o
dono da conta (`contato@selva.agency`). Enviar para `felberg@` ou `dev@` neste
modo é recusado. Por isso o desvio aponta para uma caixa só.

---

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
EMAIL_TEST_RECIPIENT=contato@selva.agency
```

**Todo e-mail do sistema — inclusive o automático das 07:30 — vai só para esse
endereço.** Nenhum colaborador recebe nada enquanto ela existir. Quando o
domínio for verificado, passa a aceitar lista:
`felberg@selva.agency,dev@selva.agency`.

**Para valer de verdade, é preciso remover essa variável.** Enquanto ela estiver
lá, o Jornalzinho não chega a ninguém — e é assim de propósito: o desvio é o que
permite validar conteúdo e visual sem lotar a caixa de todo mundo.
