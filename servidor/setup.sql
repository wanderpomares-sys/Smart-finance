-- Smart Finance Family — liberação automática de licença
-- Rode UMA vez no Supabase: SQL Editor > New query > colar > Run.

create table if not exists public.compras (
  order_id   text primary key,            -- id do pedido na Kiwify
  email      text not null,               -- e-mail do comprador (minúsculo)
  nome       text,
  plano      text not null,               -- ANUAL | VITALICIO
  status     text not null,               -- paid | refunded
  produto    text,
  pago_em    timestamptz not null default now(),
  bruto      jsonb,                       -- corpo original do webhook (para conferência)
  criado_em  timestamptz not null default now()
);
create index if not exists compras_email_idx on public.compras (email);

create table if not exists public.resgates (
  id         uuid primary key default gen_random_uuid(),
  order_id   text not null references public.compras(order_id) on delete cascade,
  device_id  text not null,
  criado_em  timestamptz not null default now(),
  unique (order_id, device_id)
);

-- RLS ligado e SEM nenhuma policy: a chave pública (anon) não lê nem grava nada.
-- Só a função do servidor (service_role) acessa essas tabelas.
alter table public.compras  enable row level security;
alter table public.resgates enable row level security;
