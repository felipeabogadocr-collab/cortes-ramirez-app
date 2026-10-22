-- Tareas del equipo + Google Calendar.
-- Correo de Google (Gmail o Google Workspace) de cada usuario del despacho:
-- a ese correo llega como invitación de Google Calendar cada tarea con fecha
-- que le asignen, aunque esa persona no haya conectado su Google en Nomos.
alter table perfiles add column if not exists correo_google text;

-- Para los que ya entran a Nomos con una cuenta de Gmail, se copia de una.
update perfiles set correo_google = lower(email)
where correo_google is null and email ilike '%@gmail.com';

-- Cada usuario (no solo el Administrador) puede poner o cambiar su propio
-- Gmail. El resto de su perfil (rol, permisos, despacho) sigue bloqueado.
create or replace function limitar_autoactualizacion_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not soy_administrador() then
    if (to_jsonb(new) - 'ultima_actividad_en' - 'pestana_actual' - 'correo_google')
       is distinct from
       (to_jsonb(old) - 'ultima_actividad_en' - 'pestana_actual' - 'correo_google')
    then
      raise exception 'Solo puedes actualizar tu estado de conexión.';
    end if;
  end if;
  return new;
end;
$$;
