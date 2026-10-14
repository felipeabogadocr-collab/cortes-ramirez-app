-- Actualiza la función del portal del cliente a la versión de schema.sql.
-- Pegar completo en Supabase → SQL Editor → Run.

alter table despachos add column if not exists celular text;

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
