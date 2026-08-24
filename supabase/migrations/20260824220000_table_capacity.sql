-- A table seats at most nine, host included (app-logic, 2026-08-24).
-- The service layer refuses a tenth join with table_full; this trigger is
-- the backstop so no path — a direct insert, a race between two joins —
-- can seat a tenth person. A departed member holds no seat.

create or replace function public.enforce_table_capacity()
returns trigger
language plpgsql
as $$
declare
  seated integer;
begin
  -- only a row that will occupy a seat needs checking
  if new.departed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.departed_at is null then
    return new;  -- was already seated; not a new seat
  end if;

  -- serialise concurrent joins to the same game
  perform 1 from public.games where id = new.game_id for update;

  select count(*) into seated
  from public.game_members
  where game_id = new.game_id
    and departed_at is null
    and user_id <> new.user_id;

  if seated >= 9 then
    raise exception 'table_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists game_members_capacity on public.game_members;
create trigger game_members_capacity
  before insert or update of departed_at on public.game_members
  for each row execute function public.enforce_table_capacity();
