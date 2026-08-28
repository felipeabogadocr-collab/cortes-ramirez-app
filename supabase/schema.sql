-- Esquema de base de datos — versión multi-despacho (multi-tenant).
-- Ejecutar en el SQL Editor de Supabase.
--
-- Este script es seguro de volver a correr (idempotente) y seguro de correr
-- sobre una base de datos que ya tiene datos reales: agrega la tabla
-- "despachos" y una columna despacho_id a cada tabla, migra automáticamente
-- los datos existentes a un despacho llamado "Cortés Ramírez Abogados" (si
-- aún no tienen despacho asignado), y deja las políticas de seguridad para
-- que cada despacho SOLO pueda ver y modificar sus propios datos, nunca los
-- de otro despacho — así la misma app y la misma base de datos pueden
-- venderse a varios despachos distintos sin que se mezclen ni se vean entre
-- sí.

create extension if not exists "pgcrypto";

-- Despachos (tenants) -------------------------------------------------------

create table if not exists despachos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creado_en timestamptz not null default now()
);

-- Tablas de datos -------------------------------------------------------

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
  id text not null,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text not null,
  value text,
  updated_at timestamptz not null default now()
);

-- Tablas obsoletas: "usuarios" guardaba contraseñas en texto plano y
-- "metricas_redes" ya no se usa.
drop table if exists usuarios cascade;
drop table if exists metricas_redes cascade;

-- Usuarios reales (Supabase Auth + perfiles) --------------------------------

create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text,
  rol text not null default 'Asistente',
  permisos jsonb not null default '{}'::jsonb,
  notificaciones jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

-- Registro de auditoría ------------------------------------------------------

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

-- Agregar despacho_id a cada tabla ------------------------------------------

alter table clientes add column if not exists despacho_id uuid references despachos (id);
alter table documentos add column if not exists despacho_id uuid references despachos (id);
alter table casos add column if not exists despacho_id uuid references despachos (id);
alter table chats add column if not exists despacho_id uuid references despachos (id);
alter table app_settings add column if not exists despacho_id uuid references despachos (id);
alter table perfiles add column if not exists despacho_id uuid references despachos (id);
alter table auditoria add column if not exists despacho_id uuid references despachos (id);

-- Migrar datos existentes a un despacho "Cortés Ramírez Abogados" -----------
-- Si esta base de datos ya tenía información de antes de que existiera el
-- concepto de despacho, se crea uno y se le asigna todo lo huérfano. Si ya
-- se corrió esta migración antes, no hace nada (idempotente).

do $$
declare
  despacho_migracion_id uuid;
begin
  if exists (select 1 from perfiles where despacho_id is null)
     or exists (select 1 from clientes where despacho_id is null)
  then
    select id into despacho_migracion_id from despachos where nombre = 'Cortés Ramírez Abogados' limit 1;
    if despacho_migracion_id is null then
      insert into despachos (nombre) values ('Cortés Ramírez Abogados') returning id into despacho_migracion_id;
    end if;

    update perfiles set despacho_id = despacho_migracion_id where despacho_id is null;
    update clientes set despacho_id = despacho_migracion_id where despacho_id is null;
    update casos set despacho_id = despacho_migracion_id where despacho_id is null;
    update documentos set despacho_id = despacho_migracion_id where despacho_id is null;
    update chats set despacho_id = despacho_migracion_id where despacho_id is null;
    update app_settings set despacho_id = despacho_migracion_id where despacho_id is null;
    update auditoria set despacho_id = despacho_migracion_id where despacho_id is null;
  end if;
end $$;

-- Llaves primarias compuestas (despacho_id + la llave original) ------------
-- chats y app_settings usaban una sola clave de texto como llave primaria;
-- con varios despachos, dos despachos distintos podrían usar la misma clave
-- (ej. "estrategia-contenido"), así que la llave primaria pasa a ser
-- (despacho_id, clave).

alter table chats drop constraint if exists chats_pkey;
alter table app_settings drop constraint if exists app_settings_pkey;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chats_pkey') then
    alter table chats add primary key (despacho_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_settings_pkey') then
    alter table app_settings add primary key (despacho_id, key);
  end if;
end $$;

create index if not exists auditoria_creado_en_idx on auditoria (creado_en desc);
create index if not exists clientes_created_at_idx on clientes (created_at desc);
create index if not exists documentos_created_at_idx on documentos (created_at desc);
create index if not exists casos_created_at_idx on casos (created_at desc);
create index if not exists clientes_despacho_idx on clientes (despacho_id);
create index if not exists documentos_despacho_idx on documentos (despacho_id);
create index if not exists casos_despacho_idx on casos (despacho_id);
create index if not exists perfiles_despacho_idx on perfiles (despacho_id);

-- Funciones auxiliares para las políticas de seguridad -----------------------
-- security definer: se ejecutan saltándose RLS por dentro, para poder leer
-- el propio perfil del usuario sin caer en una referencia circular de
-- políticas (para saber tu despacho_id necesitarías ya tener acceso a
-- perfiles, y viceversa).

create or replace function mi_despacho_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select despacho_id from perfiles where id = auth.uid();
$$;

create or replace function soy_administrador()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'Administrador');
$$;

grant execute on function mi_despacho_id() to authenticated;
grant execute on function soy_administrador() to authenticated;

-- Ya no se usa (el registro de un despacho nuevo ahora es siempre posible
-- desde la pantalla de login, no depende de si existe o no un administrador
-- en todo el sistema).
drop function if exists hay_administrador();

-- Row Level Security ---------------------------------------------------------
-- Cada despacho solo puede ver y modificar sus propios datos. "documentos"
-- sigue siendo la excepción a propósito: el link de firma que reciben los
-- clientes (#firmar + código) funciona sin que el cliente inicie sesión, así
-- que esa tabla se queda con acceso anónimo. Es un pendiente conocido para
-- una fase futura (firma con enlaces de un solo uso en vez de una tabla
-- legible completa).

alter table clientes enable row level security;
alter table casos enable row level security;
alter table chats enable row level security;
alter table app_settings enable row level security;
alter table perfiles enable row level security;
alter table auditoria enable row level security;
alter table documentos enable row level security;
alter table despachos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'casos', 'chats', 'app_settings']
  loop
    execute format('drop policy if exists "allow anon full access" on %I;', t);
    execute format('drop policy if exists "usuarios autenticados acceso completo" on %I;', t);
    execute format('drop policy if exists "mismo despacho" on %I;', t);
    execute format(
      'create policy "mismo despacho" on %I for all using (despacho_id = mi_despacho_id()) with check (despacho_id = mi_despacho_id());',
      t
    );
  end loop;
end $$;

drop policy if exists "allow anon full access" on documentos;
drop policy if exists "acceso publico para firma" on documentos;
create policy "acceso publico para firma" on documentos for all using (true) with check (true);

drop policy if exists "usuarios autenticados leen perfiles" on perfiles;
create policy "mismo despacho leen perfiles" on perfiles
  for select
  using (despacho_id = mi_despacho_id());

drop policy if exists "administradores actualizan perfiles" on perfiles;
create policy "administradores actualizan perfiles del mismo despacho" on perfiles
  for update
  using (soy_administrador() and despacho_id = mi_despacho_id())
  with check (despacho_id = mi_despacho_id());

drop policy if exists "usuarios autenticados insertan auditoria" on auditoria;
create policy "mismo despacho insertan auditoria" on auditoria
  for insert
  with check (despacho_id = mi_despacho_id());

drop policy if exists "administradores leen auditoria" on auditoria;
create policy "administradores leen auditoria del mismo despacho" on auditoria
  for select
  using (soy_administrador() and despacho_id = mi_despacho_id());

drop policy if exists "usuarios autenticados leen su despacho" on despachos;
create policy "usuarios autenticados leen su despacho" on despachos
  for select
  using (id = mi_despacho_id());
