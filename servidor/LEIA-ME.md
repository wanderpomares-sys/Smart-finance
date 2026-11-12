# Liberação automática de licença (Supabase + Kiwify)

Fluxo: cliente paga → Kiwify avisa (webhook) → servidor guarda a compra → no app o cliente
toca em **"Já paguei"** e informa o e-mail → servidor assina a licença do aparelho → app libera.

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
5. Fazer uma compra de teste, conferir a linha em **Table Editor → compras**, e então
   mudar `SF_LICENCA_AUTO_ON` para `true` no `index.html`.

O plano é definido pelo nome do produto: se contém "Vital" vira VITALICIO, senão ANUAL.
Cada compra libera até 3 aparelhos. Reembolso bloqueia novos resgates (licenças já instaladas
continuam, porque o app funciona offline).
