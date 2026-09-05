-- Quản lý kho E · Online Phase 1
-- Chạy bằng Supabase CLI/SQL Editor với quyền owner. Frontend chỉ dùng publishable key.

create sequence if not exists public.sync_version_seq;

alter table public.profiles add column if not exists employee_id uuid;
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'VIEWER';
alter table public.profiles add column if not exists active boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('ADMIN','MANAGER','EMPLOYEE','VIEWER'));
exception when duplicate_object then null; end $$;

create table if not exists public.employees (
  id uuid primary key,
  sbd text not null,
  name text not null,
  group_name text not null default '',
  phone text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','LEAVE','SUSPENDED')),
  note text not null default '',
  local_role text not null default 'EMPLOYEE' check (local_role in ('ADMIN','MANAGER','EMPLOYEE','VIEWER')),
  local_shift_id text not null default 'shift-2',
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  server_version bigint not null default nextval('public.sync_version_seq'),
  deleted_at timestamptz
);
create unique index if not exists employees_sbd_active_key on public.employees (upper(trim(sbd))) where deleted_at is null;

do $$ begin
  alter table public.profiles add constraint profiles_employee_fk foreign key (employee_id) references public.employees(id) on delete set null;
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_employee_unique on public.profiles(employee_id) where employee_id is not null;

create table if not exists public.work_schedules (
  id uuid primary key,
  employee_id uuid not null references public.employees(id),
  work_date date not null,
  shift_code text not null check (shift_code in ('M','M1','X5','X','X3','A','D','SM','SM1','S','SA','E','P','CK','RO','TS','O')),
  source text not null default 'App',
  client_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), server_version bigint not null default nextval('public.sync_version_seq'), deleted_at timestamptz
);
create unique index if not exists work_schedules_employee_date_active_key on public.work_schedules(employee_id, work_date) where deleted_at is null;

create table if not exists public.schedule_adjustments (
  id uuid primary key, batch_id uuid not null, work_date date not null,
  employee_id uuid not null references public.employees(id),
  original_shift_code text not null, adjusted_shift_code text not null,
  kind text not null check (kind in ('CHANGE','SWAP')),
  reason text not null default '', status text not null check (status in ('ACTIVE','REVERTED')),
  created_by_name text not null default '', client_created_at timestamptz, reverted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), server_version bigint not null default nextval('public.sync_version_seq'), deleted_at timestamptz
);
create index if not exists schedule_adjustments_employee_date_idx on public.schedule_adjustments(employee_id, work_date);

create table if not exists public.attendance (
  id uuid primary key, employee_id uuid not null references public.employees(id), work_date date not null,
  manager_shift_id text not null, actual_shift_code text,
  status text not null check (status in ('PRESENT','ABSENT','LATE','EARLY_LEAVE','OVERTIME','CHECKED_IN')),
  note text not null default '', confirmed_at timestamptz, confirmed_by_name text,
  check_in timestamptz, check_out timestamptz, ot_minutes integer not null default 0,
  client_created_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), server_version bigint not null default nextval('public.sync_version_seq'), deleted_at timestamptz
);
create unique index if not exists attendance_employee_date_shift_active_key on public.attendance(employee_id, work_date, manager_shift_id) where deleted_at is null;

create or replace function public.stamp_synced_row() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid(); new.server_version := nextval('public.sync_version_seq'); return new;
end $$;
drop trigger if exists employees_sync_stamp on public.employees;
create trigger employees_sync_stamp before insert or update on public.employees for each row execute function public.stamp_synced_row();
drop trigger if exists work_schedules_sync_stamp on public.work_schedules;
create trigger work_schedules_sync_stamp before insert or update on public.work_schedules for each row execute function public.stamp_synced_row();
drop trigger if exists schedule_adjustments_sync_stamp on public.schedule_adjustments;
create trigger schedule_adjustments_sync_stamp before insert or update on public.schedule_adjustments for each row execute function public.stamp_synced_row();
drop trigger if exists attendance_sync_stamp on public.attendance;
create trigger attendance_sync_stamp before insert or update on public.attendance for each row execute function public.stamp_synced_row();

create or replace function public.current_app_role() returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and active = true)
$$;
create or replace function public.my_employee_id() returns uuid language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where id = auth.uid() and active = true
$$;
revoke all on function public.current_app_role() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.my_employee_id() from public;
grant execute on function public.current_app_role(), public.is_active_user(), public.my_employee_id() to authenticated;

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.work_schedules enable row level security;
alter table public.schedule_adjustments enable row level security;
alter table public.attendance enable row level security;

revoke all on public.profiles, public.employees, public.work_schedules, public.schedule_adjustments, public.attendance from anon;
grant select on public.profiles, public.employees, public.work_schedules, public.schedule_adjustments, public.attendance to authenticated;
grant insert, update, delete on public.employees, public.work_schedules, public.schedule_adjustments, public.attendance to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.current_app_role() in ('ADMIN','MANAGER'));
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.current_app_role() = 'ADMIN') with check (public.current_app_role() = 'ADMIN');

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated using (public.is_active_user());
drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all to authenticated using (public.current_app_role() in ('ADMIN','MANAGER')) with check (public.current_app_role() in ('ADMIN','MANAGER'));

drop policy if exists schedules_read on public.work_schedules;
create policy schedules_read on public.work_schedules for select to authenticated using (public.is_active_user());
drop policy if exists schedules_write on public.work_schedules;
create policy schedules_write on public.work_schedules for all to authenticated using (public.current_app_role() in ('ADMIN','MANAGER')) with check (public.current_app_role() in ('ADMIN','MANAGER'));

drop policy if exists adjustments_read on public.schedule_adjustments;
create policy adjustments_read on public.schedule_adjustments for select to authenticated using (public.is_active_user());
drop policy if exists adjustments_write on public.schedule_adjustments;
create policy adjustments_write on public.schedule_adjustments for all to authenticated using (public.current_app_role() in ('ADMIN','MANAGER')) with check (public.current_app_role() in ('ADMIN','MANAGER'));

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using (public.is_active_user());
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated with check (public.current_app_role() in ('ADMIN','MANAGER') or employee_id = public.my_employee_id());
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated using (public.current_app_role() in ('ADMIN','MANAGER') or employee_id = public.my_employee_id()) with check (public.current_app_role() in ('ADMIN','MANAGER') or employee_id = public.my_employee_id());
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated using (public.current_app_role() in ('ADMIN','MANAGER'));

do $$ begin
  alter publication supabase_realtime add table public.employees, public.work_schedules, public.schedule_adjustments, public.attendance;
exception when duplicate_object then null; end $$;
