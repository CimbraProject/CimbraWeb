-- Cimbra — v2: panel de administración
-- Ejecutar una vez en Supabase: Dashboard → SQL Editor → New query → pegar → Run
-- (requiere haber ejecutado antes supabase/schema.sql)

alter table public.profiles
  add column email text,
  add column status text not null default 'pending' check (status in ('pending','verified','rejected')),
  add column is_admin boolean not null default false;

-- El trigger de alta de usuario ahora también guarda el email
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, company_name, cif, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'constructora'),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'cif', ''),
    new.email
  );
  return new;
end;
$$;

-- Función auxiliar para comprobar si el usuario actual es admin, evitando
-- recursión de RLS (se ejecuta con privilegios elevados, solo para este check).
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Los admins pueden ver todos los perfiles
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Los admins pueden actualizar cualquier perfil (aprobar / rechazar)
create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.is_admin());

-- Cualquiera (incluso sin sesión) puede ver las fábricas ya verificadas,
-- para que el comparador público las muestre.
create policy "Public can view verified factories"
  on public.profiles for select
  using (role = 'fabrica' and status = 'verified');

-- Después de registrarte tú mismo desde registro.html con tu email real,
-- ejecuta esto UNA VEZ (cambiando el email) para convertir tu cuenta en admin:
--
-- update public.profiles set is_admin = true where email = 'tu-email@aqui.com';
