-- Pagos de suscripción a Nomos (pantalla "Plataforma").
-- Síntoma si falta: al registrar un pago aparece
--   "Could not find the table 'public.plataforma_pagos' in the schema cache".
-- Es seguro correrlo más de una vez: no borra ni cambia nada que ya exista.

create table if not exists plataforma_pagos (
  id bigserial primary key,
  despacho_id uuid not null references despachos (id) on delete cascade,
  valor bigint not null,
  fecha date not null,
  creado_en timestamptz not null default now()
);
create index if not exists plataforma_pagos_despacho_idx on plataforma_pagos (despacho_id, fecha desc);

-- Pagos en línea (Wompi): el id de la transacción evita anotarlos dos veces.
alter table plataforma_pagos add column if not exists wompi_transaccion_id text;
alter table plataforma_pagos add column if not exists metodo text;
create unique index if not exists plataforma_pagos_wompi_idx on plataforma_pagos (wompi_transaccion_id) where wompi_transaccion_id is not null;

-- Vencimiento mensual y cobro automático: cada pago extiende "pagado_hasta" un mes.
alter table despachos add column if not exists pagado_hasta timestamptz;
alter table despachos add column if not exists plan text;
alter table despachos add column if not exists cobro_automatico boolean not null default false;
alter table despachos add column if not exists wompi_fuente_pago_id text;
alter table despachos add column if not exists wompi_tarjeta text;
alter table despachos add column if not exists wompi_email text;
alter table despachos add column if not exists cobro_auto_intento_en timestamptz;
alter table despachos add column if not exists cobro_auto_error text;

-- Solo el servidor (llave service_role) lee y escribe los pagos: sin
-- políticas a propósito, ningún despacho ve cuánto paga otro.
alter table plataforma_pagos enable row level security;

-- Le avisa a Supabase que ya existe la tabla, para que la vea de inmediato.
notify pgrst, 'reload schema';
