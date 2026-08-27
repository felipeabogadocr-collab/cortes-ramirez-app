-- Esquema de Folio (analítica de registros y uso). Ejecutar en el SQL Editor
-- del MISMO proyecto de Supabase que ya usa la app interna del despacho.
--
-- Diseño de seguridad: la app de Folio es pública y sin backend, así que la
-- llave "anon" que usa viaja dentro del código del navegador y cualquiera
-- podría copiarla. Por eso:
--   - folio_leads y folio_eventos: la llave anon solo puede INSERTAR, nunca
--     leer. Los nombres y celulares de quienes se registran NUNCA quedan
--     expuestos al público, solo tú los puedes ver en el Table Editor de
--     Supabase (con tu login).
--   - folio_stats_resumen y folio_stats_por_herramienta: son vistas que
--     solo devuelven CONTEOS (números), nunca datos personales, así que sí
--     es seguro dejarlas de lectura pública — es lo que alimenta el panel
--     de Folio.

create extension if not exists "pgcrypto";

create table if not exists folio_leads (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  created_at timestamptz not null default now()
);

create table if not exists folio_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  herramienta text,
  created_at timestamptz not null default now()
);

alter table folio_leads enable row level security;
alter table folio_eventos enable row level security;

drop policy if exists "folio_leads insert anon" on folio_leads;
create policy "folio_leads insert anon" on folio_leads for insert to anon with check (true);

drop policy if exists "folio_eventos insert anon" on folio_eventos;
create policy "folio_eventos insert anon" on folio_eventos for insert to anon with check (true);

-- Vistas de solo conteos (sin datos personales) para el panel de Folio.
create or replace view folio_stats_resumen as
select
  (select count(*) from folio_leads) as total_registros,
  (select count(*) from folio_eventos) as total_documentos;

create or replace view folio_stats_por_herramienta as
select herramienta, count(*) as total
from folio_eventos
group by herramienta
order by total desc;

grant select on folio_stats_resumen to anon;
grant select on folio_stats_por_herramienta to anon;
