// Edge Function "licenca" — Smart Finance Family
//   POST ?acao=webhook   <- Kiwify avisa que o pedido foi pago/reembolsado
//   POST ?acao=consultar <- o app pergunta { deviceId }: se houver compra paga ligada ao aparelho, recebe a licença (automático)
//   POST ?acao=resgatar  <- plano B: o app envia { email, deviceId } (quem pagou por outro link/aparelho)
// Segredos (supabase secrets set): LICENSE_PRIVATE_JWK, KIWIFY_TOKEN
// Automáticos no Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Publicar com: supabase functions deploy licenca --no-verify-jwt

const MAX_APARELHOS = 3;          // aparelhos por compra (troca de celular, reinstalação)
const ANUAL_DIAS = 365;           // igual ao SF_ANUAL_DIAS do app
const ORIGENS = ['https://smartfinancefamily.com.br', 'https://www.smartfinancefamily.com.br', 'https://wanderpomares-sys.github.io'];
const ALFABETO = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

const env = (k) => Deno.env.get(k) || '';
const enc = new TextEncoder();

function cors(req) {
  const o = req.headers.get('origin') || '';
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin' };
  if (ORIGENS.includes(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Headers'] = 'content-type, apikey, authorization';
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return h;
}
const resp = (req, status, obj) => new Response(JSON.stringify(obj), { status, headers: cors(req) });

/* ---------- PostgREST (sem biblioteca) ---------- */
async function db(path, opts = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + path, {
    ...opts,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('db ' + r.status + ': ' + txt.slice(0, 300));
  return txt ? JSON.parse(txt) : null;
}

/* ---------- base64url / assinatura ---------- */
function toB64url(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let _chave = null;
async function chavePrivada() {
  if (_chave) return _chave;
  const j = JSON.parse(env('LICENSE_PRIVATE_JWK'));
  _chave = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return _chave;
}
// Mesmo formato do gerador manual e do app: assina JSON.stringify(payload) com ECDSA P-256 / SHA-256
async function assinar(payload) {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await chavePrivada(), enc.encode(JSON.stringify(payload)));
  return { payload, assinatura: toB64url(sig) };
}

/* ---------- webhook da Kiwify ---------- */
async function hmacSha1Hex(texto, segredo) {
  const k = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
  return [...s].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function statusDoPedido(c) {
  const s = String(c.order_status || '').toLowerCase();
  const ev = String(c.webhook_event_type || '').toLowerCase();
  if (['paid', 'approved'].includes(s) || ev === 'order_approved') return 'paid';
  if (['refunded', 'chargedback', 'chargeback'].includes(s) || ['order_refunded', 'chargeback'].includes(ev)) return 'refunded';
  return null; // aguardando pagamento, recusado etc.: ignora
}
// O app abre o checkout com ?src=<código do aparelho>; a Kiwify devolve isso em TrackingParameters
function deviceDoPedido(c) {
  const t = c.TrackingParameters || c.tracking_parameters || {};
  for (const k of ['src', 'sck', 'utm_content', 'utm_term', 'utm_campaign', 'utm_medium', 'utm_source']) {
    const v = String(t[k] || '').trim().toUpperCase();
    if (ALFABETO.test(v)) return v;
  }
  return null;
}
function planoDoProduto(nome) {
  return /vital/i.test(String(nome || '')) ? 'VITALICIO' : 'ANUAL';
}
async function webhook(req) {
  const corpo = await req.text();
  const assin = new URL(req.url).searchParams.get('signature') || '';
  const token = env('KIWIFY_TOKEN');
  if (!token || !assin || !igual(await hmacSha1Hex(corpo, token), assin.toLowerCase())) return resp(req, 401, { erro: 'assinatura inválida' });
  const c = JSON.parse(corpo);
  const status = statusDoPedido(c);
  const orderId = String(c.order_id || c.order_ref || '');
  const email = String((c.Customer && c.Customer.email) || '').trim().toLowerCase();
  if (!status || !orderId || !email) return resp(req, 200, { ignorado: true });
  const produto = (c.Product && c.Product.product_name) || '';
  await db('compras?on_conflict=order_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      order_id: orderId, email, nome: (c.Customer && (c.Customer.full_name || c.Customer.first_name)) || null,
      plano: planoDoProduto(produto), status, produto, bruto: c,
      ...(status === 'paid' ? { pago_em: new Date().toISOString() } : {}),
      ...(deviceDoPedido(c) ? { device_id: deviceDoPedido(c) } : {}),
    }),
  });
  return resp(req, 200, { ok: true });
}

/* ---------- emissão (comum ao automático e ao resgate por e-mail) ---------- */
const PESO = { VITALICIO: 3, CORTESIA: 2, ANUAL: 1 };
function melhorCompra(compras) {
  // vitalício > cortesia > anual; dentro do mesmo plano, a mais recente (a lista já vem ordenada)
  return compras.slice().sort((a, b) => (PESO[b.plano] || 0) - (PESO[a.plano] || 0))[0];
}
function anualVencido(c) {
  return c.plano === 'ANUAL' && Date.now() > new Date(c.pago_em).getTime() + ANUAL_DIAS * 86400000;
}
async function emitir(req, compra, deviceId, nomeFallback) {
  const usados = await db('resgates?order_id=eq.' + encodeURIComponent(compra.order_id) + '&select=device_id');
  if (!usados.some((u) => u.device_id === deviceId)) {
    if (usados.length >= MAX_APARELHOS) return resp(req, 403, { erro: 'Essa compra já foi usada no limite de aparelhos. Fale com o suporte: suporte@smartfinancefamily.com.br' });
    await db('resgates', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ order_id: compra.order_id, device_id: deviceId }) });
  }
  const payload = { nome: compra.nome || nomeFallback || 'Cliente', plano: compra.plano, data: new Date(compra.pago_em).toISOString(), deviceId, observacao: 'auto ' + String(compra.order_id).slice(0, 8) };
  return resp(req, 200, await assinar(payload));
}
const COLS = '&status=eq.paid&order=pago_em.desc&select=order_id,nome,plano,pago_em';

/* ---------- automático: o app pergunta pelo próprio código de aparelho ---------- */
async function consultar(req) {
  let b; try { b = await req.json(); } catch (_) { return resp(req, 400, { erro: 'Pedido inválido.' }); }
  const deviceId = String(b.deviceId || '').trim().toUpperCase();
  if (!ALFABETO.test(deviceId)) return resp(req, 400, { erro: 'Código do aparelho inválido.' });
  const compras = (await db('compras?device_id=eq.' + encodeURIComponent(deviceId) + COLS)).filter((c) => !anualVencido(c));
  if (!compras.length) return resp(req, 200, { pendente: true });   // ainda não há pagamento: o app tenta de novo
  return emitir(req, melhorCompra(compras), deviceId);
}

/* ---------- plano B: resgate pelo e-mail da compra ---------- */
async function resgatar(req) {
  let b; try { b = await req.json(); } catch (_) { return resp(req, 400, { erro: 'Pedido inválido.' }); }
  const email = String(b.email || '').trim().toLowerCase();
  const deviceId = String(b.deviceId || '').trim().toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resp(req, 400, { erro: 'Informe o e-mail usado na compra.' });
  if (!ALFABETO.test(deviceId)) return resp(req, 400, { erro: 'Código do aparelho inválido.' });
  const todas = await db('compras?email=eq.' + encodeURIComponent(email) + COLS);
  if (!todas.length) {
    return resp(req, 404, { erro: 'Ainda não encontramos um pagamento aprovado para este e-mail. Se você acabou de pagar, aguarde 1 ou 2 minutos e tente de novo. Confira também se é o mesmo e-mail da compra.' });
  }
  const compras = todas.filter((c) => !anualVencido(c));
  if (!compras.length) return resp(req, 402, { erro: 'O plano Anual desta compra já venceu. Faça uma nova compra para renovar.' });
  return emitir(req, melhorCompra(compras), deviceId, email);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return resp(req, 405, { erro: 'método não permitido' });
  try {
    const acao = new URL(req.url).searchParams.get('acao');
    if (acao === 'webhook') return await webhook(req);
    if (acao === 'consultar') return await consultar(req);
    if (acao === 'resgatar') return await resgatar(req);
    return resp(req, 404, { erro: 'ação desconhecida' });
  } catch (e) {
    console.error(e);
    return resp(req, 500, { erro: 'Erro no servidor. Tente de novo em instantes ou fale com o suporte.' });
  }
});
