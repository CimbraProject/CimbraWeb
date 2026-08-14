-- Cimbra — esquema inicial de autenticación / perfiles de empresa
-- Ejecutar una vez en Supabase: Dashboard → SQL Editor → New query → pegar → Run

-- Tabla de perfiles de empresa, vinculada 1:1 con auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('constructora','fabrica')),
  company_name text not null,
  cif text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada usuario solo puede ver y modificar su propio perfil
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Al crear un usuario en auth.users (tras confirmar el signUp), crea
-- automáticamente su fila en profiles con los datos enviados en
-- options.data durante el registro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, company_name, cif)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'constructora'),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'cif', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
