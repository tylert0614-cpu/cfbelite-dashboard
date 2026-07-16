-- CFB Elite 27 v26: quota-safe YouTube resolution cache for RedZone.

begin;

alter table public.live_stream_status
  add column if not exists youtube_channel_id text,
  add column if not exists youtube_uploads_playlist_id text,
  add column if not exists youtube_resolved_key text;

comment on column public.live_stream_status.youtube_channel_id is
  'Resolved YouTube channel ID cached to avoid repeated channel lookups.';

comment on column public.live_stream_status.youtube_uploads_playlist_id is
  'Resolved YouTube uploads playlist used for low-quota live detection.';

comment on column public.live_stream_status.youtube_resolved_key is
  'Channel key and URL fingerprint used to invalidate the YouTube cache after profile edits.';

commit;
