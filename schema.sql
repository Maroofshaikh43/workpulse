create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gst_number text not null,
  phone text not null,
  company_code varchar(10) not null unique,
  office_lat double precision,
  office_lng double precision,
  attendance_radius_meters integer not null default 200,
  google_drive_folder_url text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'under_review', 'verified', 'rejected')),
  verification_notes text,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  department text not null,
  role text not null default 'employee' check (role in ('admin', 'hr', 'employee')),
  profile_photo_url text,
  id_proof_url text,
  daily_report_drive_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.companies add column if not exists attendance_radius_meters integer not null default 200;
alter table public.companies add column if not exists google_drive_folder_url text;
alter table public.companies add column if not exists verification_status text not null default 'pending';
alter table public.companies add column if not exists verification_notes text;
alter table public.companies add column if not exists verified_at timestamptz;
alter table public.companies add column if not exists verified_by uuid;
alter table public.users add column if not exists daily_report_drive_url text;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  asset_tag text not null,
  name text not null,
  category text not null,
  serial_number text,
  status text not null default 'available' check (status in ('available', 'assigned', 'repair', 'retired')),
  assigned_to uuid references public.users (id) on delete set null,
  assigned_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (company_id, asset_tag)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  sender_user_id uuid references auth.users (id) on delete set null,
  title text not null,
  body text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email')),
  kind text not null default 'system',
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  attendance_alerts boolean not null default true,
  hr_alerts boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.google_workspace_integrations (
  company_id uuid primary key references public.companies (id) on delete cascade,
  workspace_domain text,
  drive_sync_enabled boolean not null default false,
  report_folder_id text,
  report_template_file_id text,
  service_account_email text,
  sync_status text not null default 'not_connected' check (sync_status in ('not_connected', 'pending', 'connected', 'error')),
  last_sync_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_report_sync_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  report_date date not null,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  external_file_id text,
  external_modified_at timestamptz,
  message text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.platform_super_admins (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.company_verification_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  document_type text not null,
  file_url text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  date date not null,
  check_in_time time,
  check_out_time time,
  location_lat double precision,
  location_lng double precision,
  face_verified boolean not null default false,
  status text not null default 'present' check (status in ('present', 'absent', 'late')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, date)
);

create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null,
  from_date date not null,
  to_date date not null,
  days integer not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.salary_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  basic numeric(12,2) not null default 0,
  hra numeric(12,2) not null default 0,
  bonus numeric(12,2) not null default 0,
  tds numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  slip_file_url text,
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  to_group text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  date date not null,
  tasks text not null,
  hours numeric(5,2) not null,
  mood text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, date)
);

create table if not exists public.daily_report_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  date date not null,
  drive_link text,
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (user_id, date)
);

create index if not exists idx_users_company_id on public.users (company_id);
create index if not exists idx_attendance_company_date on public.attendance (company_id, date);
create index if not exists idx_leaves_company_status on public.leaves (company_id, status);
create index if not exists idx_broadcasts_company_created on public.broadcasts (company_id, created_at desc);
create index if not exists idx_reports_company_date on public.daily_reports (company_id, date);
create index if not exists idx_report_submissions_company_date on public.daily_report_submissions (company_id, date);
create index if not exists idx_salary_company_period on public.salary_slips (company_id, year, month);
create index if not exists idx_company_verification_company_id on public.company_verification_documents (company_id);
create index if not exists idx_assets_company_status on public.assets (company_id, status);
create index if not exists idx_notifications_recipient_created on public.notifications (recipient_user_id, created_at desc);
create index if not exists idx_sync_logs_company_date on public.daily_report_sync_logs (company_id, report_date desc);

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.attendance enable row level security;
alter table public.leaves enable row level security;
alter table public.salary_slips enable row level security;
alter table public.broadcasts enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_submissions enable row level security;
alter table public.platform_super_admins enable row level security;
alter table public.company_verification_documents enable row level security;
alter table public.assets enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.google_workspace_integrations enable row level security;
alter table public.daily_report_sync_logs enable row level security;

create or replace function public.get_my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.users
  where id = auth.uid()
  limit 1;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('admin', 'hr')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_super_admins
    where id = auth.uid()
  );
$$;

drop policy if exists "companies_select_same_company" on public.companies;
drop policy if exists "companies_select_open" on public.companies;
drop policy if exists "companies_insert_authenticated" on public.companies;
drop policy if exists "companies_update_admin" on public.companies;
drop policy if exists "platform_super_admins_self" on public.platform_super_admins;
drop policy if exists "company_verification_docs_access" on public.company_verification_documents;
drop policy if exists "assets_same_company_all" on public.assets;
drop policy if exists "notifications_access" on public.notifications;
drop policy if exists "notification_preferences_self" on public.notification_preferences;
drop policy if exists "google_workspace_same_company_all" on public.google_workspace_integrations;
drop policy if exists "sync_logs_same_company_all" on public.daily_report_sync_logs;
drop policy if exists "users_select_same_company" on public.users;
drop policy if exists "users_insert_self" on public.users;
drop policy if exists "users_update_same_company" on public.users;
drop policy if exists "attendance_same_company_all" on public.attendance;
drop policy if exists "leaves_same_company_all" on public.leaves;
drop policy if exists "salary_same_company_all" on public.salary_slips;
drop policy if exists "broadcasts_same_company_all" on public.broadcasts;
drop policy if exists "reports_same_company_all" on public.daily_reports;
drop policy if exists "report_submissions_same_company_all" on public.daily_report_submissions;
drop policy if exists "profile_photos_same_company" on storage.objects;
drop policy if exists "id_proofs_same_company" on storage.objects;
drop policy if exists "salary_slips_same_company" on storage.objects;
drop policy if exists "company_verification_docs_authenticated" on storage.objects;
drop policy if exists "profile_photos_authenticated" on storage.objects;
drop policy if exists "id_proofs_authenticated" on storage.objects;
drop policy if exists "salary_slips_authenticated" on storage.objects;

create policy "companies_select_open"
on public.companies
for select
using (true);

create policy "companies_insert_authenticated"
on public.companies
for insert
with check (auth.uid() is not null);

create policy "companies_update_admin"
on public.companies
for update
using (
  public.is_super_admin()
  or (id = public.get_my_company_id() and public.is_manager())
)
with check (
  public.is_super_admin()
  or (id = public.get_my_company_id() and public.is_manager())
);

create policy "platform_super_admins_self"
on public.platform_super_admins
for select
using (id = auth.uid());

create policy "users_select_same_company"
on public.users
for select
using (public.is_super_admin() or company_id = public.get_my_company_id());

create policy "users_insert_self"
on public.users
for insert
with check (
  id = auth.uid()
  and (
    role = 'admin'
    or company_id in (select id from public.companies)
  )
);

create policy "users_update_same_company"
on public.users
for update
using (public.is_super_admin() or company_id = public.get_my_company_id())
with check (public.is_super_admin() or company_id = public.get_my_company_id());

create policy "attendance_same_company_all"
on public.attendance
for all
using (company_id = public.get_my_company_id())
with check (company_id = public.get_my_company_id());

create policy "leaves_same_company_all"
on public.leaves
for all
using (company_id = public.get_my_company_id())
with check (company_id = public.get_my_company_id());

create policy "salary_same_company_all"
on public.salary_slips
for all
using (company_id = public.get_my_company_id())
with check (company_id = public.get_my_company_id());

create policy "broadcasts_same_company_all"
on public.broadcasts
for all
using (company_id = public.get_my_company_id())
with check (company_id = public.get_my_company_id());

create policy "reports_same_company_all"
on public.daily_reports
for all
using (company_id = public.get_my_company_id())
with check (company_id = public.get_my_company_id());

create policy "report_submissions_same_company_all"
on public.daily_report_submissions
for all
using (company_id = public.get_my_company_id())
with check (company_id = public.get_my_company_id());

create policy "company_verification_docs_access"
on public.company_verification_documents
for all
using (public.is_super_admin() or company_id = public.get_my_company_id())
with check (public.is_super_admin() or company_id = public.get_my_company_id());

create policy "assets_same_company_all"
on public.assets
for all
using (public.is_super_admin() or company_id = public.get_my_company_id())
with check (public.is_super_admin() or company_id = public.get_my_company_id());

create policy "notifications_access"
on public.notifications
for all
using (public.is_super_admin() or recipient_user_id = auth.uid() or company_id = public.get_my_company_id())
with check (public.is_super_admin() or recipient_user_id = auth.uid() or company_id = public.get_my_company_id());

create policy "notification_preferences_self"
on public.notification_preferences
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "google_workspace_same_company_all"
on public.google_workspace_integrations
for all
using (public.is_super_admin() or company_id = public.get_my_company_id())
with check (public.is_super_admin() or company_id = public.get_my_company_id());

create policy "sync_logs_same_company_all"
on public.daily_report_sync_logs
for all
using (public.is_super_admin() or company_id = public.get_my_company_id())
with check (public.is_super_admin() or company_id = public.get_my_company_id());

insert into storage.buckets (id, name, public)
values
  ('profile-photos', 'profile-photos', true),
  ('id-proofs', 'id-proofs', true),
  ('salary-slips', 'salary-slips', true),
  ('company-verification', 'company-verification', true)
on conflict (id) do nothing;

create policy "profile_photos_authenticated"
on storage.objects
for all
using (bucket_id = 'profile-photos')
with check (bucket_id = 'profile-photos');

create policy "id_proofs_authenticated"
on storage.objects
for all
using (bucket_id = 'id-proofs')
with check (bucket_id = 'id-proofs');

create policy "salary_slips_authenticated"
on storage.objects
for all
using (bucket_id = 'salary-slips' and auth.uid() is not null)
with check (bucket_id = 'salary-slips' and auth.uid() is not null);

create policy "company_verification_docs_authenticated"
on storage.objects
for all
using (bucket_id = 'company-verification' and auth.uid() is not null)
with check (bucket_id = 'company-verification' and auth.uid() is not null);
