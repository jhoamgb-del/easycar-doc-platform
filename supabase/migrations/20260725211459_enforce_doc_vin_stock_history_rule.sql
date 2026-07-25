create or replace function public.doc_enforce_vin_stock_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_vin text := upper(regexp_replace(coalesce(new.vin, ''), '[^A-Za-z0-9]+', '', 'g'));
  normalized_stock text := upper(btrim(coalesce(new.stock_number, '')));
begin
  if normalized_vin = '' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.vin is not distinct from old.vin
    and new.stock_number is not distinct from old.stock_number then
    return new;
  end if;

  if exists (
    select 1
    from public.doc_sales existing
    where existing.id <> new.id
      and upper(regexp_replace(coalesce(existing.vin, ''), '[^A-Za-z0-9]+', '', 'g')) = normalized_vin
      and (
        normalized_stock = ''
        or btrim(coalesce(existing.stock_number, '')) = ''
        or upper(btrim(existing.stock_number)) = normalized_stock
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'VIN duplicado: para registrar otra venta el stock debe existir y ser diferente al ciclo anterior.';
  end if;

  return new;
end;
$$;

revoke all on function public.doc_enforce_vin_stock_history() from public, anon, authenticated;

drop trigger if exists doc_sales_enforce_vin_stock_history on public.doc_sales;
create trigger doc_sales_enforce_vin_stock_history
before insert or update of vin, stock_number on public.doc_sales
for each row execute function public.doc_enforce_vin_stock_history();
