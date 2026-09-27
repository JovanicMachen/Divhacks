-- Campus Connect: optional cover photo on events.
-- Run after 20260926220000_events_live_schema_compat.sql. Additive and safe to
-- run again; it never drops, renames, or loosens anything.
--
-- Photos live in the existing public Storage bucket `event-images` under
-- <user id>/<event id>/. This file does not touch the bucket or its policies.
-- It adds one column, events.image_url, holding the photo's public URL, and a
-- check that the URL points inside the poster's own folder for that event.

begin;

do $$
declare
  similar_columns text;
  id_type text;
begin
  if to_regclass('public.events') is null then
    raise exception 'public.events does not exist. Nothing was changed.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'source') then
    raise exception 'public.events has no source column yet. Run 20260926220000_events_live_schema_compat.sql first. Nothing was changed.';
  end if;

  select data_type into id_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'id';
  if id_type is distinct from 'uuid' then
    raise exception 'public.events.id is %, not uuid. Photo uploads need the event id before the row is saved. Nothing was changed.',
      coalesce(id_type, 'missing');
  end if;

  select string_agg(column_name, ', ' order by column_name) into similar_columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events'
     and column_name in (
       'image', 'photo', 'picture', 'cover', 'banner', 'thumbnail',
       'photo_url', 'picture_url', 'cover_url', 'cover_image', 'cover_image_url',
       'banner_url', 'thumbnail_url', 'image_path', 'photo_path', 'media_url'
     );
  if similar_columns is not null then
    raise exception 'public.events already has: %. That may already be the event photo. Nothing was changed; reuse that column instead of adding image_url.',
      similar_columns;
  end if;
end $$;

alter table public.events add column if not exists image_url text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'events_image_in_owner_folder' and conrelid = 'public.events'::regclass) then
    alter table public.events
      add constraint events_image_in_owner_folder check (
        image_url is null
        or position(('/storage/v1/object/public/event-images/' || created_by::text || '/' || id::text || '/') in image_url) > 0
      );
  end if;
end $$;

commit;

-- Read-only summary.
select column_name as name, data_type as detail
  from information_schema.columns
 where table_schema = 'public' and table_name = 'events' and column_name in ('id', 'created_by', 'image_url')
union all
select conname, 'check constraint'
  from pg_constraint
 where conrelid = 'public.events'::regclass and conname = 'events_image_in_owner_folder'
order by 1;
