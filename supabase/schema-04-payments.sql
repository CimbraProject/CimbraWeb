-- Cimbra — v4: comisiones de éxito (acuerdos cerrados + cobro por Stripe)
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar → Run
-- (requiere haber ejecutado antes schema.sql, schema-02-admin.sql y schema-03-search.sql)

-- Marca si una constructora forma parte de las primeras 50 (comisión reducida al 1%
-- de por vida en vez del 2% estándar). Se calcula una sola vez, al registrarse.
alter table public.profiles add column if not exists is_early_bird boolean not null default false;

-- Backfill: si ya hay constructoras registradas, marca como early bird a las
-- primeras 50 por orden de alta.
with ranked as (
  select id, row_number() over (order by created_at asc) as rn
  from public.profiles
  where role = 'constructora'
)
update public.profiles p
set is_early_bird = true
from ranked r
where p.id = r.id and r.rn <= 50;

-- El trigger de alta de usuario ahora también calcula is_early_bird
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  early boolean := false;
begin
  if coalesce(new.raw_user_meta_data->>'role', 'constructora') = 'constructora' then
    select count(*) < 50 into early from public.profiles where role = 'constructora';
  end if;

  insert into public.profiles (id, role, company_name, cif, email, material, region, is_early_bird)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'constructora'),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'cif', ''),
    new.email,
    new.raw_user_meta_data->>'material',
    new.raw_user_meta_data->>'region',
    early
  );
  return new;
end;
$$;

-- Acuerdos cerrados y su comisión asociada.
-- deal_number = nº de orden del acuerdo para esa constructora (1, 2, 3...).
-- is_free = true cuando deal_number es múltiplo de 6 (tarjeta de fidelidad:
-- cada 5 acuerdos de pago, el 6º sale gratis).
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  constructora_id uuid not null references public.profiles(id),
  fabrica_id uuid not null references public.profiles(id),
  material text,
  order_value numeric(12,2) not null,
  deal_number int not null,
  commission_rate numeric(4,3) not null,
  commission_amount numeric(12,2) not null,
  is_free boolean not null default false,
  status text not null default 'pending' check (status in ('pending','invoiced','paid')),
  checkout_url text,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

alter table public.deals enable row level security;

-- Los admins pueden ver y gestionar todos los acuerdos (las escrituras reales
-- las hace la función de servidor con la service_role key, que no pasa por RLS;
-- esta política es para que el panel de admin pueda listarlos desde el navegador).
create policy "Admins can manage all deals"
  on public.deals for all
  using (public.is_admin())
  with check (public.is_admin());

-- Cada empresa puede ver los acuerdos en los que participa
create policy "Companies can view their own deals"
  on public.deals for select
  using (auth.uid() = constructora_id or auth.uid() = fabrica_id);

-- Igual que con profiles: sin este GRANT, RLS deniega el acceso aunque las
-- policies sean correctas (las tablas creadas por SQL no heredan los grants
-- automáticos que sí da el Table Editor de Supabase).
grant select on public.deals to authenticated;
