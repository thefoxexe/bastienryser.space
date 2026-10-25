-- Finances : écritures saisies à la main (factures encaissées, charges), en plus des chiffres Stripe.

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('income', 'expense')),
  -- Toujours positif : le sens vient de `kind` (revenu ou charge).
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'chf' check (currency ~ '^[a-z]{3}$'),
  label text not null check (length(btrim(label)) between 1 and 160),
  category text check (category is null or length(category) <= 60),
  -- Numéro de facture ou de pièce, facultatif.
  reference text check (reference is null or length(reference) <= 60),
  created_at timestamptz not null default now()
);

create index on public.ledger_entries (business_id, day);

alter table public.ledger_entries enable row level security;
create policy ledger_entries_admin_all on public.ledger_entries
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.ledger_entries from anon;
