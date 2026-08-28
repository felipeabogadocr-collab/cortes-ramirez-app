-- Esquema de base de datos para Cortés Ramírez Abogados
-- Ejecutar en el SQL Editor de Supabase.
--
-- Este script es seguro de volver a correr (idempotente) incluso si ya
-- tenías la versión anterior instalada: agrega autenticación real
-- (Supabase Auth), cierra el acceso anónimo a los datos del despacho, y
-- agrega un registro de auditoría básico.

create extension if not exists "pgcrypto";

-- Tablas de datos del despacho (sin cambios de estructura) -----------------

create table if not exists clientes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documentos (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists casos (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chats (
  id text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Tablas obsoletas: "usuarios" guardaba contraseñas en texto plano y
-- "metricas_redes" ya no se usa. Se eliminan (y con ellas, las contraseñas
-- guardadas en texto plano que pudieran existir).
drop table if exists usuarios cascade;
drop table if exists metricas_redes cascade;

-- Usuarios reales (Supabase Auth + perfiles) --------------------------------
-- El login ahora es de verdad: Supabase Auth guarda las contraseñas
-- hasheadas. Esta tabla solo guarda el nombre, rol y permisos de cada
-- usuario, referenciando al usuario real de auth.users.

create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text,
  rol text not null default 'Asistente',
  permisos jsonb not null default '{}'::jsonb,
  notificaciones jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

-- Función pública (sin exponer ninguna fila) para que la pantalla de login
-- sepa si ya existe un administrador o si debe mostrar "crear la primera
-- cuenta". No requiere sesión iniciada.
create or replace function hay_administrador()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from perfiles where rol = 'Administrador');
$$;

grant execute on function hay_administrador() to anon, authenticated;

-- Registro de auditoría ------------------------------------------------------
-- Quién hizo qué y cuándo. Solo lectura para Administradores.

create table if not exists auditoria (
  id bigserial primary key,
  usuario_id uuid references auth.users (id) on delete set null,
  usuario_nombre text,
  accion text not null,
  entidad text,
  entidad_id text,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists auditoria_creado_en_idx on auditoria (creado_en desc);
create index if not exists clientes_created_at_idx on clientes (created_at desc);
create index if not exists documentos_created_at_idx on documentos (created_at desc);
create index if not exists casos_created_at_idx on casos (created_at desc);

-- Row Level Security ---------------------------------------------------------
-- clientes, casos, perfiles, auditoria, chats y app_settings ahora exigen una
-- sesión autenticada (ya no basta con la llave "anon" pública, que antes
-- dejaba leer/escribir todo el despacho sin iniciar sesión).
--
-- "documentos" es la excepción a propósito: el link de firma que reciben los
-- clientes (#firmar + código) funciona sin que el cliente inicie sesión, así
-- que esa tabla se queda con acceso anónimo por ahora. Es un pendiente
-- conocido para una fase futura (firma con enlaces de un solo uso en vez de
-- una tabla legible completa).

alter table clientes enable row level security;
alter table casos enable row level security;
alter table chats enable row level security;
alter table app_settings enable row level security;
alter table perfiles enable row level security;
alter table auditoria enable row level security;
alter table documentos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'casos', 'chats', 'app_settings']
  loop
    execute format('drop policy if exists "allow anon full access" on %I;', t);
    execute format('drop policy if exists "usuarios autenticados acceso completo" on %I;', t);
    execute format(
      'create policy "usuarios autenticados acceso completo" on %I for all using (auth.uid() is not null) with check (auth.uid() is not null);',
      t
    );
  end loop;
end $$;

drop policy if exists "allow anon full access" on documentos;
drop policy if exists "acceso publico para firma" on documentos;
create policy "acceso publico para firma" on documentos for all using (true) with check (true);

drop policy if exists "usuarios autenticados leen perfiles" on perfiles;
create policy "usuarios autenticados leen perfiles" on perfiles
  for select
  using (auth.uid() is not null);

drop policy if exists "administradores actualizan perfiles" on perfiles;
create policy "administradores actualizan perfiles" on perfiles
  for update
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'Administrador'))
  with check (true);

drop policy if exists "usuarios autenticados insertan auditoria" on auditoria;
create policy "usuarios autenticados insertan auditoria" on auditoria
  for insert
  with check (auth.uid() is not null);

drop policy if exists "administradores leen auditoria" on auditoria;
create policy "administradores leen auditoria" on auditoria
  for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'Administrador'));
