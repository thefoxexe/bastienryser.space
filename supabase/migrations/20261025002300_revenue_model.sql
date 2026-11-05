-- Modèle de revenus d'un business : abonnements (encaissements synchronisés : Whop, Stripe),
-- devis (paiements relevés à la main, onglet Encaissements) ou les deux.
alter table public.businesses add column if not exists revenue_model text not null default 'quotes'
  check (revenue_model in ('subscriptions', 'quotes', 'mixed'));

-- Client payeur d'un encaissement relevé à la main (facultatif).
alter table public.ledger_entries add column if not exists client text
  check (client is null or length(btrim(client)) between 1 and 120);
