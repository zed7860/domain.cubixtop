-- Cubixtop Domains - Supabase/PostgreSQL schema
create extension if not exists "pgcrypto";

create type public.user_role as enum ('customer','admin');
create type public.domain_status as enum ('pending','active','expired','transfer','failed','cancelled');
create type public.order_status as enum ('pending','paid','provisioning','completed','failed','refunded');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text,
 phone text,
 role public.user_role not null default 'customer',
 created_at timestamptz not null default now()
);

create table public.tld_pricing (
 id uuid primary key default gen_random_uuid(),
 tld text unique not null,
 registrar_cost numeric(12,2) not null default 0,
 sell_price numeric(12,2) not null,
 renewal_price numeric(12,2) not null,
 transfer_price numeric(12,2) not null,
 active boolean not null default true,
 updated_at timestamptz not null default now()
);

create table public.orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 domain_name text not null,
 years int not null default 1 check(years between 1 and 10),
 amount numeric(12,2) not null,
 registrar_cost numeric(12,2) not null default 0,
 gross_margin numeric(12,2) generated always as (amount-registrar_cost) stored,
 currency text not null default 'INR',
 status public.order_status not null default 'pending',
 payment_provider text,
 payment_id text,
 created_at timestamptz not null default now()
);

create table public.domains (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 order_id uuid references public.orders(id),
 domain_name text unique not null,
 registrar text not null default 'namesilo',
 registrar_domain_id text,
 status public.domain_status not null default 'pending',
 registered_at timestamptz,
 expires_at timestamptz,
 auto_renew boolean not null default false,
 nameservers text[] default '{}',
 created_at timestamptz not null default now()
);

create table public.domain_events (
 id bigint generated always as identity primary key,
 domain_id uuid references public.domains(id) on delete cascade,
 event_type text not null,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.domains enable row level security;
alter table public.domain_events enable row level security;
alter table public.tld_pricing enable row level security;

create policy "profile own read" on public.profiles for select using (auth.uid()=id);
create policy "orders own read" on public.orders for select using (auth.uid()=user_id);
create policy "domains own read" on public.domains for select using (auth.uid()=user_id);
create policy "domain events own read" on public.domain_events for select using (
 exists(select 1 from public.domains d where d.id=domain_id and d.user_id=auth.uid())
);
create policy "pricing public read" on public.tld_pricing for select using (active=true);

insert into public.tld_pricing(tld,registrar_cost,sell_price,renewal_price,transfer_price) values
('.com',900,1199,1299,1199),('.in',550,799,899,799),('.co.in',450,699,799,699),
('.org',1000,1299,1399,1299),('.net',1020,1299,1399,1299),('.io',3200,3999,4299,3999)
on conflict(tld) do nothing;

