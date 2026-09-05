-- Phase 1 clients write as the authenticated Postgres role. The sync stamp
-- trigger calls nextval(), which requires sequence privileges in addition to
-- table INSERT/UPDATE grants.
grant usage, select on sequence public.sync_version_seq to authenticated;
