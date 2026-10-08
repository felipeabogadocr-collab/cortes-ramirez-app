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

-- Límite de tasa (anti-spam en endpoints públicos) --------------------------

create table if not exists limite_solicitudes (
  id bigserial primary key,
  ip text not null,
  ruta text not null,
  creado_en timestamptz not null default now()
);

create index if not exists limite_solicitudes_ip_ruta_idx on limite_solicitudes (ruta, ip, creado_en desc);

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

-- Papelera: en vez de borrar de una, se marca con fecha y se puede
-- restaurar o borrar para siempre desde "Usuarios y permisos".
alter table clientes add column if not exists eliminado_en timestamptz;
alter table documentos add column if not exists eliminado_en timestamptz;
alter table casos add column if not exists eliminado_en timestamptz;
alter table chats add column if not exists despacho_id uuid references despachos (id);
alter table app_settings add column if not exists despacho_id uuid references despachos (id);
alter table perfiles add column if not exists despacho_id uuid references despachos (id);
alter table auditoria add column if not exists despacho_id uuid references despachos (id);

-- Activación de cuenta (pago) y superadministrador ---------------------------
-- "activo" en true por defecto para no afectar despachos que ya existían
-- antes de esta migración; los despachos NUEVOS se crean con activo=false
-- desde api/despachos/crear.js, y quedan pendientes de que el superadmin
-- los active tras coordinar el pago (ver PantallaPendienteActivacion).
alter table despachos add column if not exists activo boolean not null default true;
alter table perfiles add column if not exists es_superadmin boolean not null default false;

update perfiles set es_superadmin = true where email = 'felipeabogadocr@gmail.com';

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
create index if not exists clientes_eliminado_idx on clientes (despacho_id, eliminado_en);
create index if not exists documentos_eliminado_idx on documentos (despacho_id, eliminado_en);
create index if not exists casos_eliminado_idx on casos (despacho_id, eliminado_en);

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
-- Cada despacho solo puede ver y modificar sus propios datos. "documentos" ya
-- NO se deja con acceso público abierto (antes cualquiera con la llave anon
-- podía leer los documentos de TODOS los despachos, no solo el que tuviera el
-- código). El flujo de firma sin sesión (#firmar + código) ahora pasa por dos
-- funciones "security definer" (más abajo) que solo permiten leer o firmar UN
-- documento puntual si ya se conoce su código exacto — nunca listar ni ver
-- los demás.

alter table clientes enable row level security;
alter table casos enable row level security;
alter table chats enable row level security;
alter table app_settings enable row level security;
alter table perfiles enable row level security;
alter table auditoria enable row level security;
alter table documentos enable row level security;
alter table despachos enable row level security;
alter table limite_solicitudes enable row level security;
-- Sin políticas a propósito: solo la llamamos desde el servidor con la
-- llave service_role (que se salta RLS), nunca desde el navegador.

do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'casos', 'chats', 'app_settings', 'documentos']
  loop
    execute format('drop policy if exists "allow anon full access" on %I;', t);
    execute format('drop policy if exists "usuarios autenticados acceso completo" on %I;', t);
    execute format('drop policy if exists "acceso publico para firma" on %I;', t);
    execute format('drop policy if exists "mismo despacho" on %I;', t);
    execute format(
      'create policy "mismo despacho" on %I for all using (despacho_id = mi_despacho_id()) with check (despacho_id = mi_despacho_id());',
      t
    );
  end loop;
end $$;

-- Acceso público para firma electrónica (sin sesión) -------------------------
-- Solo estas dos funciones pueden tocar documentos sin autenticación, y solo
-- de a un documento a la vez, por su código exacto (nunca un listado).

create or replace function obtener_documento_publico(p_id text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select data from documentos where id = p_id and eliminado_en is null;
$$;

create or replace function guardar_firma_documento(p_id text, p_data jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update documentos set data = p_data, updated_at = now() where id = p_id and eliminado_en is null;
$$;

grant execute on function obtener_documento_publico(text) to anon, authenticated;
grant execute on function guardar_firma_documento(text, jsonb) to anon, authenticated;

-- Portal del cliente (sin sesión) --------------------------------------------
-- El cliente entra a #portal y escribe el código que le compartió su
-- abogado (el id del cliente, igual de impredecible que el código de
-- firma). Esta función arma a propósito solo un subconjunto seguro de la
-- información: nombre, proceso, estado de cuenta y documentos — nunca las
-- notas internas del abogado ni los datos de otros clientes.

create or replace function obtener_portal_cliente(p_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  cliente_data jsonb;
  cliente_despacho uuid;
  cliente_id text;
  cliente_creado timestamptz;
  cliente_actualizado timestamptz;
  docs jsonb;
  eventos jsonb;
  despacho_info jsonb;
begin
  -- Acepta el código corto del portal (data.codigoPortal, 8 caracteres) o,
  -- para los enlaces viejos, el id completo del cliente.
  select id, data, despacho_id, created_at, updated_at
  into cliente_id, cliente_data, cliente_despacho, cliente_creado, cliente_actualizado
  from clientes
  where eliminado_en is null
    and (id = p_id or upper(data->>'codigoPortal') = upper(replace(trim(p_id), '-', '')))
  limit 1;
  if cliente_data is null then
    return null;
  end if;

  -- Solo documentos del mismo despacho del cliente (antes se cruzaba solo por
  -- nombre y un homónimo de otro despacho podía aparecer aquí).
  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'titulo', data->>'titulo', 'fecha', created_at, 'firmado', jsonb_array_length(coalesce(data->'firmantes', '[]'::jsonb)) > 0) order by created_at desc),
    '[]'::jsonb
  )
  into docs
  from documentos
  where eliminado_en is null
    and despacho_id is not distinct from cliente_despacho
    and lower(data->>'cliente') = lower(cliente_data->>'nombre');

  -- Próximas citas del cliente en la agenda (sin notas internas).
  begin
    select coalesce(jsonb_agg(e order by e->>'fecha', e->>'hora'), '[]'::jsonb)
    into eventos
    from (
      select jsonb_build_object('titulo', v->>'titulo', 'fecha', v->>'fecha', 'hora', v->>'hora', 'meet', v->>'googleMeetLink') e, v
      from (select value::jsonb v from app_settings
            where key like 'evento:%' and despacho_id is not distinct from cliente_despacho) x
      where v->>'clienteId' = cliente_id
        and coalesce((v->>'completado')::boolean, false) = false
        and v->>'fecha' >= to_char(current_date, 'YYYY-MM-DD')
      order by v->>'fecha', v->>'hora'
      limit 5
    ) y;
  exception when others then
    eventos := '[]'::jsonb;
  end;

  select jsonb_build_object('nombre', nombre, 'celular', celular, 'tieneLogo', logo_ruta is not null) into despacho_info
  from despachos where id = cliente_despacho;

  return jsonb_build_object(
    'nombre', cliente_data->'nombre',
    'tipoProceso', cliente_data->'tipoProceso',
    'areaProceso', cliente_data->'areaProceso',
    'radicado', cliente_data->'radicado',
    'radicados', coalesce(cliente_data->'radicados', '[]'::jsonb),
    'procesoPausado', coalesce((cliente_data->>'procesoPausado')::boolean, false),
    'clienteDesde', cliente_creado,
    'actualizadoEn', cliente_actualizado,
    'juzgadoActual', cliente_data->'juzgadoActual',
    'abogadoAsignado', cliente_data->'abogadoAsignado',
    'valorTotal', cliente_data->'valorTotal',
    'proximoPago', cliente_data->'proximoPago',
    'cuotas', coalesce(cliente_data->'planPago'->'cuotas', '[]'::jsonb),
    'actuaciones', (
      select coalesce(jsonb_agg(jsonb_build_object('fecha', t->>'fecha', 'nota', t->>'nota') order by t->>'fecha' desc), '[]'::jsonb)
      from (select t from jsonb_array_elements(coalesce(cliente_data->'timeline', '[]'::jsonb)) t
            order by t->>'fecha' desc limit 20) z
    ),
    'citas', coalesce(eventos, '[]'::jsonb),
    'despacho', despacho_info,
    'pagos', (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', p->'id', 'fecha', p->'fecha', 'valor', p->'valor', 'concepto', p->'concepto', 'tieneRecibo', (p->>'reciboImagen') is not null)),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(cliente_data->'pagos', '[]'::jsonb)) p
    ),
    'documentos', docs
  );
end;
$$;

create index if not exists clientes_codigo_portal_idx on clientes ((upper(data->>'codigoPortal')));

grant execute on function obtener_portal_cliente(text) to anon, authenticated;

drop policy if exists "usuarios autenticados leen perfiles" on perfiles;
drop policy if exists "mismo despacho leen perfiles" on perfiles;
create policy "mismo despacho leen perfiles" on perfiles
  for select
  using (despacho_id = mi_despacho_id());

drop policy if exists "administradores actualizan perfiles" on perfiles;
drop policy if exists "administradores actualizan perfiles del mismo despacho" on perfiles;
create policy "administradores actualizan perfiles del mismo despacho" on perfiles
  for update
  using (soy_administrador() and despacho_id = mi_despacho_id())
  with check (despacho_id = mi_despacho_id());

drop policy if exists "usuarios autenticados insertan auditoria" on auditoria;
drop policy if exists "mismo despacho insertan auditoria" on auditoria;
create policy "mismo despacho insertan auditoria" on auditoria
  for insert
  with check (despacho_id = mi_despacho_id());

drop policy if exists "administradores leen auditoria" on auditoria;
drop policy if exists "administradores leen auditoria del mismo despacho" on auditoria;
create policy "administradores leen auditoria del mismo despacho" on auditoria
  for select
  using (soy_administrador() and despacho_id = mi_despacho_id());

-- Cualquier usuario (no solo administradores) puede ver SUS PROPIOS inicios
-- de sesión anteriores — nada más, ninguna otra fila de auditoría — para que
-- la app le pueda avisar "tu última sesión fue el ..." y así note si alguien
-- más entró con su cuenta.
drop policy if exists "cada usuario lee sus propios inicios de sesion" on auditoria;
create policy "cada usuario lee sus propios inicios de sesion" on auditoria
  for select
  using (usuario_id = auth.uid() and accion = 'inicio_sesion');

drop policy if exists "usuarios autenticados leen su despacho" on despachos;
create policy "usuarios autenticados leen su despacho" on despachos
  for select
  using (id = mi_despacho_id());

drop policy if exists "administradores renombran su despacho" on despachos;
create policy "administradores renombran su despacho" on despachos
  for update
  using (soy_administrador() and id = mi_despacho_id())
  with check (id = mi_despacho_id());

-- Logo y celular propios de cada despacho — antes todos los despachos
-- (tenants) veían el mismo logo de Cortés Ramírez Abogados incrustado en
-- la app en sus cuentas de cobro, recibos y contratos. logo_ruta guarda la
-- ruta dentro del bucket "logos" (ver más abajo); la misma política de
-- arriba ("administradores renombran su despacho") ya cubre actualizar
-- estas dos columnas, al ser una política por fila sin restricción de
-- columna.
alter table despachos add column if not exists logo_ruta text;
alter table despachos add column if not exists celular text;

-- Almacenamiento de recibos de pago -----------------------------------------
-- Antes cada recibo (una imagen generada en canvas) se guardaba completo en
-- base64 dentro de la fila del cliente — con el tiempo eso llena el límite
-- de espacio gratis de la base de datos mucho más rápido que cualquier otra
-- cosa en la app. Ahora se sube como archivo a este bucket, organizado en
-- carpetas por despacho_id, y la fila del cliente solo guarda la ruta.
-- Bucket privado (no público): solo se puede leer autenticado y a través de
-- las políticas de abajo, nunca por URL directa.

insert into storage.buckets (id, name, public)
values ('recibos', 'recibos', false)
on conflict (id) do nothing;

drop policy if exists "cada despacho sube sus propios recibos" on storage.objects;
create policy "cada despacho sube sus propios recibos" on storage.objects
  for insert
  with check (bucket_id = 'recibos' and (storage.foldername(name))[1] = mi_despacho_id()::text);

drop policy if exists "cada despacho lee sus propios recibos" on storage.objects;
create policy "cada despacho lee sus propios recibos" on storage.objects
  for select
  using (bucket_id = 'recibos' and (storage.foldername(name))[1] = mi_despacho_id()::text);

drop policy if exists "cada despacho actualiza sus propios recibos" on storage.objects;
create policy "cada despacho actualiza sus propios recibos" on storage.objects
  for update
  using (bucket_id = 'recibos' and (storage.foldername(name))[1] = mi_despacho_id()::text)
  with check (bucket_id = 'recibos' and (storage.foldername(name))[1] = mi_despacho_id()::text);

-- Almacenamiento del logo del despacho ---------------------------------------
-- Mismo patrón que "recibos": bucket privado, una carpeta por despacho_id
-- (un solo archivo "logo.png" adentro). Se usa para las cuentas de cobro,
-- los recibos de pago y los contratos que genera cada despacho — antes
-- todos mostraban el mismo logo fijo de Cortés Ramírez Abogados.

insert into storage.buckets (id, name, public)
values ('logos', 'logos', false)
on conflict (id) do nothing;

drop policy if exists "cada despacho sube su propio logo" on storage.objects;
create policy "cada despacho sube su propio logo" on storage.objects
  for insert
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = mi_despacho_id()::text);

drop policy if exists "cada despacho lee su propio logo" on storage.objects;
create policy "cada despacho lee su propio logo" on storage.objects
  for select
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = mi_despacho_id()::text);

drop policy if exists "cada despacho actualiza su propio logo" on storage.objects;
create policy "cada despacho actualiza su propio logo" on storage.objects
  for update
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = mi_despacho_id()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = mi_despacho_id()::text);

-- Reporte de errores del cliente ---------------------------------------------
-- Antes, si la interfaz se caía con un error inesperado (el ErrorBoundary lo
-- atrapa para no dejar la pantalla en blanco), el detalle solo quedaba en la
-- consola del navegador de esa persona — nadie más se enteraba. Esta tabla
-- guarda ese detalle para poder revisarlo desde "Plataforma" (superadmin).

create table if not exists errores_cliente (
  id bigserial primary key,
  mensaje text not null,
  pila text,
  info_componente text,
  url text,
  despacho_id uuid references despachos (id) on delete set null,
  usuario_id uuid references auth.users (id) on delete set null,
  user_agent text,
  creado_en timestamptz not null default now()
);

create index if not exists errores_cliente_creado_en_idx on errores_cliente (creado_en desc);

alter table errores_cliente enable row level security;
-- Sin políticas a propósito: se escribe y se lee solo desde el servidor con
-- la llave service_role, nunca directo desde el navegador.

-- Accesos de prueba con vencimiento ------------------------------------------
-- Un Administrador puede generar, desde "Usuarios y permisos", un usuario
-- de correo y contraseña al azar para prestarle acceso temporal a alguien
-- (ej. para que revise algo en vivo) sin usar sus propias credenciales.
-- expira_en queda null en los usuarios normales; en los de prueba se
-- verifica al iniciar sesión y cada 30s mientras la sesión sigue abierta
-- (ver App.jsx: iniciarSesion / cargarPerfilActual).

alter table perfiles add column if not exists expira_en timestamptz;

-- Foto de perfil ---------------------------------------------------------
-- Mismo patrón que el bucket "recibos": privado, organizado por
-- despacho_id, con políticas que solo dejan a cada despacho subir/leer/
-- actualizar dentro de su propia carpeta. En "perfiles" solo se guarda la
-- ruta del archivo, nunca la imagen.

alter table perfiles add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', false)
on conflict (id) do nothing;

drop policy if exists "cada despacho sube sus propios avatares" on storage.objects;
create policy "cada despacho sube sus propios avatares" on storage.objects
  for insert
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = mi_despacho_id()::text);

drop policy if exists "cada despacho lee sus propios avatares" on storage.objects;
create policy "cada despacho lee sus propios avatares" on storage.objects
  for select
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = mi_despacho_id()::text);

drop policy if exists "cada despacho actualiza sus propios avatares" on storage.objects;
create policy "cada despacho actualiza sus propios avatares" on storage.objects
  for update
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = mi_despacho_id()::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = mi_despacho_id()::text);

-- Prueba gratis de 7 días y pago self-service -----------------------------
-- Antes un despacho nuevo nacía "activo = false" y quedaba bloqueado hasta
-- que alguien coordinara el pago por WhatsApp y el superadmin lo activara a
-- mano. Ahora nace ya activo con 7 días de prueba (prueba_hasta) — al
-- vencer, si nadie lo activó de verdad (pago confirmado, ver
-- api/plataforma/despachos.js), vuelve a verse como pendiente de activar,
-- pero ya tuvo la semana de prueba completa. pago_reportado_en se marca
-- cuando el propio usuario dice "ya pagué" desde la pantalla de activación
-- (api/despachos/reportar-pago.js) — no confirma el pago por sí solo, solo
-- le avisa al superadmin que hay que revisar y activar.
alter table despachos add column if not exists prueba_hasta timestamptz;
alter table despachos add column if not exists pago_reportado_en timestamptz;

-- Cadena de custodia de la firma electrónica (Ley 527 de 1999) ------------
-- Registro de auditoría propio de "Firmar documentos", separado de la
-- tabla "auditoria" general (esa es para acciones administrativas del
-- despacho; esta es evidencia legal de cada documento firmado). Cada fila
-- es un hecho puntual — visto, consentimiento aceptado, firmado — con su
-- propio timestamp, IP y user-agent. A propósito NUNCA se otorga permiso de
-- UPDATE ni DELETE sobre esta tabla a nadie (ni siquiera al Administrador
-- del despacho): una vez insertada, una fila queda para siempre, para que
-- el registro sea defendible como prueba ante un juzgado — si alguien
-- pudiera editar o borrar una fila, dejaría de servir como evidencia.
-- Los eventos del firmante público (#firmar, sin sesión) los inserta el
-- servidor con la llave service_role (api/documentos/firmar.js y
-- api/documentos/evento.js) — así la IP real queda capturada del lado del
-- servidor, donde el navegador no la puede falsificar. El evento de firma
-- del abogado (con sesión, dentro de la app) lo inserta el propio
-- navegador autenticado, sin IP (limitación conocida: capturarla también
-- ahí requeriría pasar esa firma por un endpoint de servidor aparte).

create table if not exists documento_eventos (
  id bigserial primary key,
  despacho_id uuid references despachos (id),
  documento_id text not null,
  tipo_evento text not null check (tipo_evento in ('documento_visualizado', 'consentimiento_aceptado', 'documento_firmado')),
  firmante_nombre text,
  firmante_documento_id text,
  rol text,
  ip text,
  user_agent text,
  hash_documento text,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists documento_eventos_documento_idx on documento_eventos (documento_id, creado_en);
create index if not exists documento_eventos_despacho_idx on documento_eventos (despacho_id, creado_en desc);

alter table documento_eventos enable row level security;

-- Solo lectura (y solo del propio despacho) para exportar el log desde la
-- app. La inserción normal la hacen las funciones de servidor (llave
-- service_role, que se salta RLS) — la política de insert de aquí abajo
-- es solo para el caso del abogado firmando CON sesión dentro de la app.
drop policy if exists "mismo despacho lee eventos de documento" on documento_eventos;
create policy "mismo despacho lee eventos de documento" on documento_eventos
  for select
  using (despacho_id = mi_despacho_id());

drop policy if exists "mismo despacho inserta eventos de documento" on documento_eventos;
create policy "mismo despacho inserta eventos de documento" on documento_eventos
  for insert
  with check (despacho_id = mi_despacho_id());

-- A propósito: no existe ningún "for update" ni "for delete" — con RLS
-- activado y sin política que lo permita, Postgres deniega ambas
-- operaciones a cualquier cliente normal (anon o authenticated), incluido
-- el propio Administrador del despacho. La llave service_role (usada solo
-- en los endpoints de servidor) sí puede saltarse RLS por diseño de
-- Supabase — la garantía real de "nadie edita esto" es que ningún código
-- de esta app llama nunca UPDATE ni DELETE sobre esta tabla, ni desde el
-- navegador ni desde el servidor; solo se inserta. Quien administre la
-- base de datos directamente en Supabase (fuera de la app) sí podría
-- editarla — eso ya escapa a lo que el software puede impedir por sí solo.

-- "Conectado ahora" (portal de superadministrador) ---------------------------
-- Solo un indicador de presencia liviano: si el usuario tiene la app abierta
-- ahora mismo y en qué pestaña está — NO qué escribe, NO sus datos. Se
-- actualiza solo (ver App.jsx) cada vez que cambia de pestaña y cada minuto
-- mientras la pestaña del navegador sigue visible.
alter table perfiles add column if not exists ultima_actividad_en timestamptz;
alter table perfiles add column if not exists pestana_actual text;

-- La política de update existente ("administradores actualizan perfiles del
-- mismo despacho") NO alcanza para esto: un Abogado/Asistente normal no
-- puede actualizar ni su propia fila hoy. Se agrega una política que sí se
-- lo permite, pero SOLO sobre su propia fila — y el trigger de abajo la
-- acota más todavía: aunque la política deje pasar el UPDATE, cualquier
-- cambio a un campo que no sea el latido de presencia (rol, permisos,
-- despacho_id, etc.) se rechaza, para que nadie pueda auto-otorgarse
-- permisos editando su propio perfil.
drop policy if exists "usuario actualiza su propio latido de presencia" on perfiles;
create policy "usuario actualiza su propio latido de presencia" on perfiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function limitar_autoactualizacion_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not soy_administrador() then
    if (to_jsonb(new) - 'ultima_actividad_en' - 'pestana_actual')
       is distinct from
       (to_jsonb(old) - 'ultima_actividad_en' - 'pestana_actual')
    then
      raise exception 'Solo puedes actualizar tu estado de conexión.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists limitar_autoactualizacion_perfil_trigger on perfiles;
create trigger limitar_autoactualizacion_perfil_trigger
  before update on perfiles
  for each row
  execute function limitar_autoactualizacion_perfil();

-- Conexión con Google Calendar ------------------------------------------------
-- Un usuario conecta su propia cuenta de Google (OAuth) para que, al crear un
-- evento en Agenda, se cree también en su Google Calendar real con un enlace
-- de Meet — así le llegan las notificaciones nativas de Google, sin que Nomos
-- tenga que reinventar avisos por correo/push. Guarda el token de acceso
-- (dura ~1h) y el de refresco (para renovarlo solo, sin que el usuario tenga
-- que reconectar cada hora).
--
-- RLS habilitado SIN ninguna política: ni el propio dueño del token puede
-- leerlo o tocarlo desde el navegador — solo las funciones de servidor
-- (llave service_role, que se salta RLS) leen/escriben esta tabla. Un token
-- de Google es tan sensible como una contraseña; no tiene sentido exponerlo
-- ni siquiera de vuelta a su propio dueño.
create table if not exists google_calendar_conexiones (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  despacho_id uuid references despachos (id),
  access_token text not null,
  refresh_token text not null,
  expira_en timestamptz not null,
  email_google text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table google_calendar_conexiones enable row level security;

-- Pagos de suscripción a Nomos, registrados a mano por el superadmin --------
-- Antes solo existía "pago_reportado_en" (el propio despacho dice "ya
-- pagué", sin confirmar nada) y "activo" (sí/no) — no quedaba un historial
-- de cuánto pagó cada despacho ni cuándo, así que no había forma de ver de
-- un vistazo quién ya pagó este mes y quién no. Esta tabla es ese registro
-- manual: cada fila es un pago que el superadmin confirmó y anotó él mismo
-- desde "Plataforma" (api/plataforma/despachos.js).
create table if not exists plataforma_pagos (
  id bigserial primary key,
  despacho_id uuid not null references despachos (id) on delete cascade,
  valor bigint not null,
  fecha date not null,
  creado_en timestamptz not null default now()
);

create index if not exists plataforma_pagos_despacho_idx on plataforma_pagos (despacho_id, fecha desc);

-- Pagos en línea con Wompi (api/despachos/reportar-pago.js): cada pago
-- aprobado se anota solo, con el id de la transacción de Wompi. La columna
-- única evita anotarlo dos veces si Wompi avisa más de una vez (o si el
-- aviso y la confirmación al volver del pago llegan los dos).
alter table plataforma_pagos add column if not exists wompi_transaccion_id text;
alter table plataforma_pagos add column if not exists metodo text;
create unique index if not exists plataforma_pagos_wompi_idx on plataforma_pagos (wompi_transaccion_id) where wompi_transaccion_id is not null;

-- Vencimiento mensual y cobro automático de la suscripción -----------------
-- pagado_hasta: hasta cuándo está pagado el plan. Cada pago (Wompi o
-- registrado a mano en Plataforma) lo extiende un mes. Pasados 2 días de
-- gracia sin pago, el despacho se ve como pendiente de activar. Si es null
-- (despachos activados antes de esto), no vence.
-- cobro_automatico / wompi_*: tarjeta guardada en Wompi como "fuente de
-- pago" (Nomos nunca guarda el número de la tarjeta, solo el id que da
-- Wompi y una etiqueta tipo "VISA •••• 4242") para cobrar cada mes solo.
alter table despachos add column if not exists pagado_hasta timestamptz;
alter table despachos add column if not exists plan text;
alter table despachos add column if not exists cobro_automatico boolean not null default false;
alter table despachos add column if not exists wompi_fuente_pago_id text;
alter table despachos add column if not exists wompi_tarjeta text;
alter table despachos add column if not exists wompi_email text;
alter table despachos add column if not exists cobro_auto_intento_en timestamptz;
alter table despachos add column if not exists cobro_auto_error text;

-- SEGURIDAD: la política "administradores renombran su despacho" deja
-- actualizar la fila completa del despacho — sin esto, un Administrador
-- podría marcarse activo o ponerse una fecha de pago falsa desde el
-- navegador sin pagar. Desde el navegador solo se pueden cambiar nombre,
-- celular y logo; todo lo demás (activo, prueba, pagos, vencimiento, cobro
-- automático) lo cambia únicamente el servidor con la llave service_role.
revoke update on despachos from anon;
revoke update on despachos from authenticated;
grant update (nombre, celular, logo_ruta) on despachos to authenticated;

alter table plataforma_pagos enable row level security;
-- Sin políticas a propósito: solo el endpoint de servidor (llave
-- service_role, ya protegido por verificarSuperadmin) lee y escribe aquí —
-- ni siquiera el Administrador de un despacho debería ver cuánto paga otro.

-- PostgREST (el API que usa Supabase) cachea qué tablas existen y a veces
-- tarda en darse cuenta de una tabla nueva creada por este script — el
-- síntoma es "Could not find the table '...' in the schema cache" aunque
-- la tabla sí quedó creada. Este NOTIFY le avisa que recargue su caché de
-- una vez, cada vez que se corre este archivo, para no depender de que lo
-- note solo (o de tener que ir a Settings → API → Reload schema a mano).
NOTIFY pgrst, 'reload schema';
