# Liberação automática de licença (Supabase + Kiwify)

Fluxo (sem o cliente fazer nada): o app abre o checkout com `?src=<código do aparelho>` →
cliente paga → Kiwify avisa o servidor (webhook) com esse código → o app, que consulta o servidor
a cada poucos segundos enquanto espera, recebe a licença assinada e mostra "Acesso liberado — plano X".
Plano B: quem pagou por outro link/aparelho toca em "Informe o e-mail da compra".

## Publicar (pelo painel do Supabase, sem terminal)
1. **SQL Editor** → New query → colar `setup.sql` → Run.
2. **Edge Functions** → Deploy a new function → nome `licenca` → colar `licenca/index.ts` → Deploy.
   Em Settings da função, desligar **Verify JWT** (a Kiwify não envia JWT; a função confere a assinatura).
3. **Edge Functions → Secrets** (Manage secrets), criar:
   - `LICENSE_PRIVATE_JWK` = conteúdo inteiro do arquivo da chave privada (o JSON de `{` a `}`)
   - `KIWIFY_TOKEN` = um texto aleatório longo, o mesmo que será usado na Kiwify
4. **Kiwify** → Apps → Webhooks → Criar:
   - URL: `https://ibfghedgyxvyredykluq.supabase.co/functions/v1/licenca?acao=webhook`
   - Token: o mesmo `KIWIFY_TOKEN`
   - Eventos: compra aprovada, reembolso, chargeback; produtos: Anual e Vitalício
5. Fazer uma compra de teste **a partir do app** (toque em Pagar no app, para o link levar o código do aparelho),
   conferir a linha em **Table Editor → compras** (coluna `device_id` preenchida) e então
   mudar `SF_LICENCA_AUTO_ON` para `true` no `index.html`.

## Cortesia (acesso grátis)
Table Editor → compras → Insert row: `order_id` = cortesia-nome, `nome`, `email` ou `device_id`,
`plano` = CORTESIA, `status` = paid. Com o `device_id` do aparelho, o aviso de acesso liberado aparece sozinho.

O plano é definido pelo nome do produto: se contém "Vital" vira VITALICIO, senão ANUAL.
Cada compra libera até 3 aparelhos. Reembolso bloqueia novos resgates (licenças já instaladas
continuam, porque o app funciona offline).
