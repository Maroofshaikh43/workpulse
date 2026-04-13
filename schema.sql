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
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended', 'rejected')),
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
alter table public.companies add column if not exists status text not null default 'pending';
alter table public.companies add column if not exists verification_status text not null default 'pending';
alter table public.companies add column if not exists verification_notes text;
alter table public.companies add column if not exists verified_at timestamptz;
alter table public.companies add column if not exists verified_by uuid;
alter table public.users add column if not exists daily_report_drive_url text;

update public.companies
set status = 'approved'
where status is null;

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
  drive_link_opened_at timestamptz,
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (user_id, date)
);

alter table public.daily_report_submissions add column if not exists drive_link_opened_at timestamptz;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  type text not null default 'public' check (type in ('public', 'private', 'direct')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (company_id, name, type)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  content text,
  file_url text,
  file_type text,
  reply_to uuid references public.messages (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (content is not null or file_url is not null)
);

create table if not exists public.channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  last_read_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (channel_id, user_id)
);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (message_id, user_id, emoji)
);

alter table public.messages add column if not exists is_pinned boolean not null default false;

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
create index if not exists idx_channels_company_type on public.channels (company_id, type, created_at desc);
create index if not exists idx_messages_channel_created on public.messages (channel_id, created_at);
create index if not exists idx_messages_company_created on public.messages (company_id, created_at desc);
create index if not exists idx_channel_members_user_id on public.channel_members (user_id, channel_id);
create index if not exists idx_reactions_message_id on public.message_reactions (message_id);

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
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.channel_members enable row level security;
alter table public.message_reactions enable row level security;

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

create or replace function public.can_access_channel(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    left join public.channel_members cm
      on cm.channel_id = c.id
      and cm.user_id = auth.uid()
    where c.id = target_channel_id
      and (
        public.is_super_admin()
        or (
          c.company_id = public.get_my_company_id()
          and (
            c.type = 'public'
            or cm.user_id is not null
          )
        )
      )
  );
$$;

create or replace function public.create_default_chat_channels(target_company_id uuid, actor_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.channels (company_id, name, description, type, created_by)
  values
    (target_company_id, 'general', 'Company-wide discussions and updates.', 'public', actor_id),
    (target_company_id, 'announcements', 'Official company announcements.', 'public', actor_id),
    (target_company_id, 'hr', 'HR questions, policies, and support.', 'public', actor_id),
    (target_company_id, 'random', 'Casual team chat and non-work banter.', 'public', actor_id)
  on conflict (company_id, name, type) do nothing;

  insert into public.channel_members (channel_id, user_id)
  select c.id, u.id
  from public.channels c
  join public.users u on u.company_id = c.company_id
  where c.company_id = target_company_id
    and c.type = 'public'
  on conflict (channel_id, user_id) do nothing;
end;
$$;

create or replace function public.handle_company_chat_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.create_default_chat_channels(new.id, new.verified_by);
  end if;
  return new;
end;
$$;

drop trigger if exists company_default_chat_channels on public.companies;
create trigger company_default_chat_channels
after insert or update of status on public.companies
for each row
execute function public.handle_company_chat_channels();

create or replace function public.handle_user_channel_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.channel_members (channel_id, user_id)
  select id, new.id
  from public.channels
  where company_id = new.company_id
    and type = 'public'
  on conflict (channel_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists user_public_channel_membership on public.users;
create trigger user_public_channel_membership
after insert on public.users
for each row
execute function public.handle_user_channel_membership();

create or replace function public.sync_message_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_company_id uuid;
begin
  select company_id
  into channel_company_id
  from public.channels
  where id = new.channel_id;

  if channel_company_id is null then
    raise exception 'Channel not found';
  end if;

  if new.company_id is null then
    new.company_id := channel_company_id;
  end if;

  if new.company_id <> channel_company_id then
    raise exception 'Message company mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists message_company_sync on public.messages;
create trigger message_company_sync
before insert or update on public.messages
for each row
execute function public.sync_message_company_id();

select public.create_default_chat_channels(id, verified_by)
from public.companies
where status = 'approved';

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
drop policy if exists "channels_company" on public.channels;
drop policy if exists "messages_select_company" on public.messages;
drop policy if exists "messages_insert_company" on public.messages;
drop policy if exists "messages_update_owner_or_admin" on public.messages;
drop policy if exists "messages_delete_owner_or_admin" on public.messages;
drop policy if exists "members_access" on public.channel_members;
drop policy if exists "reactions_access" on public.message_reactions;
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
drop policy if exists "chat_files_authenticated" on storage.objects;

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

create policy "channels_company"
on public.channels
for all
using (public.is_super_admin() or public.can_access_channel(id))
with check (public.is_super_admin() or company_id = public.get_my_company_id());

create policy "messages_select_company"
on public.messages
for select
using (public.is_super_admin() or public.can_access_channel(channel_id));

create policy "messages_insert_company"
on public.messages
for insert
with check (
  (public.is_super_admin() or public.can_access_channel(channel_id))
  and sender_id = auth.uid()
);

create policy "messages_update_owner_or_admin"
on public.messages
for update
using (public.is_super_admin() or company_id = public.get_my_company_id())
with check (
  public.is_super_admin()
  or (
    public.can_access_channel(channel_id)
    and (
      sender_id = auth.uid()
      or public.is_manager()
    )
  )
);

create policy "messages_delete_owner_or_admin"
on public.messages
for delete
using (
  public.is_super_admin()
  or (
    public.can_access_channel(channel_id)
    and (
      sender_id = auth.uid()
      or public.is_manager()
    )
  )
);

create policy "members_access"
on public.channel_members
for all
using (
  public.is_super_admin()
  or user_id = auth.uid()
  or channel_id in (
    select id
    from public.channels
    where public.can_access_channel(id)
  )
)
with check (
  public.is_super_admin()
  or user_id = auth.uid()
  or channel_id in (
    select id
    from public.channels
    where company_id = public.get_my_company_id()
  )
);

create policy "reactions_access"
on public.message_reactions
for all
using (
  public.is_super_admin()
  or message_id in (
    select id
    from public.messages
    where public.can_access_channel(channel_id)
  )
)
with check (
  public.is_super_admin()
  or (
    user_id = auth.uid()
    and message_id in (
      select id
      from public.messages
      where public.can_access_channel(channel_id)
    )
  )
);

insert into storage.buckets (id, name, public)
values
  ('profile-photos', 'profile-photos', true),
  ('id-proofs', 'id-proofs', true),
  ('salary-slips', 'salary-slips', true),
  ('company-verification', 'company-verification', true),
  ('chat-files', 'chat-files', true)
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

create policy "chat_files_authenticated"
on storage.objects
for all
using (bucket_id = 'chat-files' and auth.uid() is not null)
with check (bucket_id = 'chat-files' and auth.uid() is not null);
