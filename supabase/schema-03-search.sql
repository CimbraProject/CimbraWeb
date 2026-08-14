-- Cimbra — v3: material y región para poder buscar/filtrar fábricas
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar → Run
-- (requiere haber ejecutado antes schema.sql y schema-02-admin.sql)

alter table public.profiles
  add column material text,
  add column region text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, company_name, cif, email, material, region)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'constructora'),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'cif', ''),
    new.email,
    new.raw_user_meta_data->>'material',
    new.raw_user_meta_data->>'region'
  );
  return new;
end;
$$;
