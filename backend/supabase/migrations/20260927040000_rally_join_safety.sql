-- Campus Connect: make Rally joins safe under concurrency and Rally windows
-- independent of the phone's clock. Run after
-- 20260927020000_rallies_organizations.sql. Replaces two functions from that
-- file with safer versions and recounts existing Rallies; drops nothing.
--
-- 1. rally_participants_sync now locks the Rally's events row before counting.
--    Before, two people joining at the same moment could each count only their
--    own row plus the committed ones (e.g. both saw 2 of 3), so the stored count
--    was one short and the Rally never switched on. With the lock the second
--    join waits for the first to commit and counts both.
-- 2. events_prepare_insert measures the Rally window from the times the client
--    sent (end minus start) and applies it to the database clock, so a phone
--    whose clock is off can't post a Rally that's too long or be rejected.
-- 3. Existing Rally counts are recounted from rally_participants.

begin;

do $$
begin
  if to_regclass('public.rally_participants') is null then
    raise exception 'Run 20260927020000_rallies_organizations.sql first (rally_participants is missing). Nothing was changed.';
  end if;
end $$;

create or replace function public.rally_participants_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.event_id, old.event_id);
  rally public.events%rowtype;
  joined integer;
  activates boolean;
begin
  -- Serialise joins for this Rally: later joins wait here until earlier ones commit.
  select * into rally from public.events where id = target for update;
  if not found or rally.event_type <> 'rally' then
    return null;
  end if;

  select count(*) into joined from public.rally_participants where event_id = target;
  activates := rally.rally_status = 'forming'
    and joined >= rally.rally_min_participants
    and rally.rally_expires_at > now();

  perform set_config('campus.rally_internal', 'on', true);
  update public.events
     set rally_participant_count = joined,
         rally_status = case when activates then 'active' else rally_status end,
         rally_activated_at = case when activates then now() else rally_activated_at end,
         start_time = case when activates then now() else start_time end,
         end_time = case when activates then now() + interval '1 hour' else end_time end
   where id = target;
  perform set_config('campus.rally_internal', 'off', true);
  return null;
end;
$$;

create or replace function public.events_prepare_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rally_window interval;
begin
  if not public.is_client_request() then
    return new;
  end if;

  new.organization_event := coalesce((select p.is_org from public.profiles p where p.id = auth.uid()), false);
  if not new.organization_event or not new.is_paid then
    new.is_paid := false;
    new.price_display := null;
  end if;

  if new.event_type = 'rally' then
    if new.rally_min_participants is null or new.rally_min_participants not between 2 and 20 then
      raise exception 'A Rally needs between 2 and 20 people.' using errcode = '22023';
    end if;
    -- The length the poster chose, read from their own clock, applied to the database clock.
    rally_window := new.rally_expires_at - coalesce(new.start_time, now());
    if new.rally_expires_at is null
       or rally_window < interval '110 seconds'
       or rally_window > interval '15 minutes 10 seconds' then
      raise exception 'A Rally window is 2 to 15 minutes.' using errcode = '22023';
    end if;
    new.rally_status := 'forming';
    new.rally_participant_count := 0;
    new.rally_activated_at := null;
    new.start_time := now();
    new.rally_expires_at := now() + least(rally_window, interval '15 minutes');
    new.end_time := new.rally_expires_at;
    new.is_paid := false;
    new.price_display := null;
    if new.rally_anonymous then
      new.host_name := 'Anonymous student';
    end if;
  else
    new.event_type := 'event';
    new.rally_status := null;
    new.rally_min_participants := null;
    new.rally_expires_at := null;
    new.rally_anonymous := false;
    new.rally_participant_count := 0;
    new.rally_activated_at := null;
  end if;
  return new;
end;
$$;

-- Recount every Rally once, in case an earlier race left a count short.
do $$
begin
  perform set_config('campus.rally_internal', 'on', true);
  update public.events e
     set rally_participant_count = counted.n
    from (
      select ev.id, count(p.user_id)::integer as n
        from public.events ev
        left join public.rally_participants p on p.event_id = ev.id
       where ev.event_type = 'rally'
       group by ev.id
    ) counted
   where e.id = counted.id and e.rally_participant_count is distinct from counted.n;
  perform set_config('campus.rally_internal', 'off', true);
end $$;

commit;

-- Read-only check: stored counts should match the participant rows.
select e.id, e.title, e.rally_status, e.rally_participant_count as stored_count, count(p.user_id) as participant_rows
  from public.events e
  left join public.rally_participants p on p.event_id = e.id
 where e.event_type = 'rally'
 group by e.id, e.title, e.rally_status, e.rally_participant_count
 order by e.created_at desc nulls last
 limit 20;
