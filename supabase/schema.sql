-- Esquema de base de datos para Cortés Ramírez Abogados
-- Ejecutar en el SQL Editor de Supabase (proyecto nuevo, plan gratuito).

create extension if not exists "pgcrypto";

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

create table if not exists usuarios (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists metricas_redes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historial de conversaciones con el asistente de IA (una fila por usuario/hilo).
create table if not exists chats (
  id text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Ajustes de una sola clave: preferencia-tema, perfil-abogado, sesion-usuario-id,
-- ultimo-usuario-login, ultima-revision-firmas, etc.
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create index if not exists clientes_created_at_idx on clientes (created_at desc);
create index if not exists documentos_created_at_idx on documentos (created_at desc);
create index if not exists casos_created_at_idx on casos (created_at desc);
create index if not exists usuarios_created_at_idx on usuarios (created_at asc);
create index if not exists metricas_redes_created_at_idx on metricas_redes (created_at asc);

-- Row Level Security: la app es de uso interno del despacho y accede con la
-- llave "anon" desde el navegador, así que se habilita RLS con una política
-- abierta de lectura/escritura para esa llave. Si en el futuro se agrega
-- autenticación de Supabase Auth, estas políticas se pueden restringir por
-- usuario autenticado.
alter table clientes enable row level security;
alter table documentos enable row level security;
alter table casos enable row level security;
alter table usuarios enable row level security;
alter table metricas_redes enable row level security;
alter table chats enable row level security;
alter table app_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['clientes','documentos','casos','usuarios','metricas_redes','chats','app_settings']
  loop
    execute format('drop policy if exists "allow anon full access" on %I;', t);
    execute format(
      'create policy "allow anon full access" on %I for all using (true) with check (true);',
      t
    );
  end loop;
end $$;
