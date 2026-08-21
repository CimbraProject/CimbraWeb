-- Cimbra — v5: copia del recibo de pago de Stripe en cada acuerdo
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar → Run
-- (requiere haber ejecutado antes schema-04-payments.sql)

alter table public.deals add column if not exists receipt_url text;
