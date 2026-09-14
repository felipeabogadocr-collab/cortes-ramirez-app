-- Esquema de Folio (analítica de registros y uso). Ejecutar en el SQL Editor
-- del MISMO proyecto de Supabase que ya usa la app interna del despacho.
--
-- Diseño de seguridad: la llave "anon" que usa el navegador de Folio viaja
-- dentro del código público, así que:
--   - folio_leads y folio_eventos: la llave anon solo puede INSERTAR, nunca
--     leer. Los nombres y celulares NUNCA se pueden leer con esa llave.
--   - La lista completa de personas registradas SÍ se muestra en
--     /panel (protegida con contraseña), pero se lee desde una función
--     serverless (folio-pdf/api/panel-leads.js) que usa la llave
--     "service role" de Supabase — esa llave nunca viaja al navegador, solo
--     vive como variable de entorno en el servidor de Vercel.
--   - folio_stats_resumen y folio_stats_por_herramienta quedan de lectura
--     pública (solo conteos, sin datos personales) por si se necesitan en
--     el futuro, aunque el panel actual ya no depende de ellas.

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
