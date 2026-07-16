-- Inventory shares this database but keeps its own access model. Harden the
-- public lead path and prevent a broker from changing security-sensitive fields
-- on their own profile.

create or replace function public.inv_crear_lead(
  p_vehiculo uuid,
  p_broker uuid,
  p_nombre text,
  p_telefono text,
  p_mensaje text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_broker uuid := null;
  v_count integer;
  v_id uuid;
begin
  if nullif(btrim(p_nombre), '') is null or nullif(btrim(p_telefono), '') is null then
    raise exception 'nombre_y_telefono_requeridos';
  end if;

  if not exists (
    select 1 from public.inv_vehiculos
    where id = p_vehiculo and estado = 'disponible'
  ) then
    raise exception 'vehiculo_no_disponible';
  end if;

  if p_broker is not null and exists (
    select 1 from public.inv_profiles
    where id = p_broker and rol = 'broker'
  ) then
    v_broker := p_broker;
  end if;

  select count(*) into v_count
  from public.inv_leads
  where vehiculo_id = p_vehiculo and telefono = p_telefono;

  if v_count >= 3 then
    return null;
  end if;

  insert into public.inv_leads (vehiculo_id, broker_id, nombre, telefono, mensaje)
  values (
    p_vehiculo,
    v_broker,
    left(btrim(p_nombre), 120),
    btrim(p_telefono),
    left(btrim(coalesce(p_mensaje, '')), 500)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.inv_crear_lead(uuid, uuid, text, text, text) from public;
grant execute on function public.inv_crear_lead(uuid, uuid, text, text, text) to anon, authenticated, service_role;

create or replace function public.inv_guard_sensitive_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profile_id_cannot_change';
  end if;

  if coalesce(auth.role(), '') = 'service_role' or public.inv_is_admin() then
    return new;
  end if;

  if new.rol is distinct from old.rol
    or new.activo is distinct from old.activo
    or new.w9_status is distinct from old.w9_status
    or new.w9_fecha_firma is distinct from old.w9_fecha_firma
    or new.w9_documento_path is distinct from old.w9_documento_path then
    raise exception 'solo_administracion_puede_modificar_campos_de_control';
  end if;

  return new;
end;
$$;

revoke all on function public.inv_guard_sensitive_profile_fields() from public, anon, authenticated;
grant execute on function public.inv_guard_sensitive_profile_fields() to service_role, supabase_auth_admin;

drop trigger if exists inv_guard_sensitive_profile_fields on public.inv_profiles;
create trigger inv_guard_sensitive_profile_fields
before update on public.inv_profiles
for each row execute function public.inv_guard_sensitive_profile_fields();

alter function public.update_updated_at() set search_path to pg_catalog;
alter function public.inv_touch_updated_at() set search_path to pg_catalog;
alter function public.exec_sql(text) set search_path to pg_catalog, public;

alter function public.inv_handle_new_user() set search_path to '';
revoke all on function public.inv_handle_new_user() from public, anon, authenticated;
grant execute on function public.inv_handle_new_user() to service_role, supabase_auth_admin;
