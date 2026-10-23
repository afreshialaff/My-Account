-- Accounting OS — foundation schema
-- Tenancy (firm > client > legal entity > branch), users & memberships,
-- chart of accounts, fiscal periods, double-entry journals, audit log.
--
-- Isolation model
--   * Every tenant table carries firm_id and is protected by FORCE ROW LEVEL SECURITY
--     keyed on the transaction-local setting app.firm_id.
--   * Child rows reference parents through composite (firm_id/entity_id, id) foreign keys,
--     so a row can never point at another tenant's or another entity's data.
--   * Client/entity-level access inside a firm is enforced by the API (memberships).

create extension if not exists btree_gist;
create extension if not exists citext;

create or replace function app_firm_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.firm_id', true), '')::uuid
$$;

create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ------------------------------------------------------------------ tenancy

create table firms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);

create table users (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references firms(id),
  email          citext not null unique,
  full_name      text not null,
  password_hash  text not null,
  role           text not null check (role in ('partner', 'manager', 'accountant', 'auditor')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (firm_id, id)
);

create table clients (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id),
  code        text not null,
  name        text not null check (length(trim(name)) > 0),
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (firm_id, code),
  unique (firm_id, id)
);

create table client_memberships (
  firm_id     uuid not null,
  user_id     uuid not null,
  client_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, client_id),
  foreign key (firm_id, user_id) references users(firm_id, id) on delete cascade,
  foreign key (firm_id, client_id) references clients(firm_id, id) on delete cascade
);

create table legal_entities (
  id                       uuid primary key default gen_random_uuid(),
  firm_id                  uuid not null,
  client_id                uuid not null,
  name                     text not null check (length(trim(name)) > 0),
  legal_name               text,
  npwp                     text,
  address                  text,
  functional_currency      char(3) not null default 'IDR',
  fiscal_year_start_month  int not null default 1 check (fiscal_year_start_month between 1 and 12),
  require_approval         boolean not null default true,
  created_at               timestamptz not null default now(),
  foreign key (firm_id, client_id) references clients(firm_id, id),
  unique (firm_id, id)
);

create table branches (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null,
  entity_id   uuid not null,
  code        text not null,
  name        text not null,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (firm_id, entity_id) references legal_entities(firm_id, id),
  unique (entity_id, code),
  unique (entity_id, id)
);

-- ------------------------------------------------------------------ chart of accounts

create table accounts (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null,
  entity_id    uuid not null,
  code         text not null,
  name         text not null check (length(trim(name)) > 0),
  category     text not null check (category in (
                 'cash_bank', 'receivable', 'inventory', 'other_current_asset', 'fixed_asset',
                 'depreciation', 'other_asset', 'payable', 'other_current_liability',
                 'long_term_liability', 'equity', 'revenue', 'other_income', 'cogs',
                 'expense', 'other_expense')),
  parent_id    uuid,
  is_postable  boolean not null default true,
  is_active    boolean not null default true,
  is_system    boolean not null default false,
  description  text,
  created_at   timestamptz not null default now(),
  foreign key (firm_id, entity_id) references legal_entities(firm_id, id),
  unique (entity_id, code),
  unique (entity_id, id),
  foreign key (entity_id, parent_id) references accounts(entity_id, id)
);

-- ------------------------------------------------------------------ fiscal periods

create table fiscal_periods (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null,
  entity_id   uuid not null,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'open' check (status in ('open', 'locked')),
  locked_at   timestamptz,
  locked_by   uuid,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (firm_id, entity_id) references legal_entities(firm_id, id),
  exclude using gist (entity_id with =, daterange(start_date, end_date, '[]') with &&)
);

-- ------------------------------------------------------------------ numbering

create table document_sequences (
  firm_id     uuid not null,
  entity_id   uuid not null,
  doc_type    text not null,
  prefix      text not null,
  next_value  bigint not null default 1,
  primary key (entity_id, doc_type),
  foreign key (firm_id, entity_id) references legal_entities(firm_id, id)
);

-- ------------------------------------------------------------------ journals

create table journal_entries (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null,
  entity_id        uuid not null,
  branch_id        uuid,
  number           text not null,
  journal_date     date not null,
  status           text not null default 'draft'
                     check (status in ('draft', 'submitted', 'approved', 'posted', 'reversed')),
  memo             text,
  source_type      text not null default 'manual',
  source_id        uuid,
  currency         char(3) not null default 'IDR',
  idempotency_key  text,
  reversal_of      uuid,
  reversed_by      uuid,
  created_by       uuid not null,
  submitted_by     uuid,
  submitted_at     timestamptz,
  approved_by      uuid,
  approved_at      timestamptz,
  posted_by        uuid,
  posted_at        timestamptz,
  reversed_at      timestamptz,
  version          int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (firm_id, entity_id) references legal_entities(firm_id, id),
  foreign key (entity_id, branch_id) references branches(entity_id, id),
  unique (entity_id, number),
  unique (entity_id, idempotency_key),
  unique (entity_id, id),
  foreign key (entity_id, reversal_of) references journal_entries(entity_id, id),
  foreign key (entity_id, reversed_by) references journal_entries(entity_id, id)
);

create index journal_entries_entity_date on journal_entries (entity_id, journal_date, status);

create table journal_lines (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null,
  entity_id    uuid not null,
  entry_id     uuid not null,
  line_no      int not null,
  account_id   uuid not null,
  branch_id    uuid,
  description  text,
  debit        numeric(20, 2) not null default 0 check (debit >= 0),
  credit       numeric(20, 2) not null default 0 check (credit >= 0),
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0),
  foreign key (entity_id, entry_id) references journal_entries(entity_id, id) on delete cascade,
  foreign key (entity_id, account_id) references accounts(entity_id, id),
  foreign key (entity_id, branch_id) references branches(entity_id, id),
  unique (entry_id, line_no)
);

create index journal_lines_account on journal_lines (entity_id, account_id);

-- Journal entries may only be created as drafts; posting is a status transition
-- that is validated below. Posted history is immutable: the only permitted change
-- is marking a posted entry as reversed while linking its reversal.
create or replace function journal_entry_guard() returns trigger
language plpgsql as $$
declare
  n_lines int;
  s_debit numeric;
  s_credit numeric;
  p_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'journal entries must be created as draft' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only draft journal entries can be deleted (status %)', old.status using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status in ('posted', 'reversed') then
    if old.status = 'posted' and new.status = 'reversed' and new.reversed_by is not null
       and (new.entity_id, new.number, new.journal_date, new.memo, new.branch_id, new.currency,
            new.posted_by, new.posted_at, new.created_by, new.reversal_of)
           is not distinct from
           (old.entity_id, old.number, old.journal_date, old.memo, old.branch_id, old.currency,
            old.posted_by, old.posted_at, old.created_by, old.reversal_of) then
      return new;
    end if;
    raise exception 'posted journal % is immutable; correct it with a reversal', old.number using errcode = 'P0001';
  end if;

  if new.status = 'posted' then
    select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into n_lines, s_debit, s_credit
      from journal_lines where entry_id = new.id;
    if n_lines < 2 then
      raise exception 'journal % needs at least two lines', new.number using errcode = 'P0001';
    end if;
    if s_debit <> s_credit then
      raise exception 'journal % is not balanced (debit % <> credit %)', new.number, s_debit, s_credit using errcode = 'P0001';
    end if;
    if s_debit = 0 then
      raise exception 'journal % has zero value', new.number using errcode = 'P0001';
    end if;
    select status into p_status from fiscal_periods
      where entity_id = new.entity_id and new.journal_date between start_date and end_date;
    if p_status is null then
      raise exception 'no fiscal period covers %', new.journal_date using errcode = 'P0001';
    end if;
    if p_status <> 'open' then
      raise exception 'fiscal period for % is locked', new.journal_date using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create trigger journal_entries_guard
  before insert or update or delete on journal_entries
  for each row execute function journal_entry_guard();

-- Lines can only be changed while their entry is a draft, and must use an active postable account.
create or replace function journal_line_guard() returns trigger
language plpgsql as $$
declare
  e_status text;
  a_ok boolean;
begin
  select status into e_status from journal_entries
    where id = coalesce(new.entry_id, old.entry_id);
  if e_status is not null and e_status <> 'draft' then
    raise exception 'lines of a % journal cannot be changed', e_status using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select is_postable and is_active into a_ok from accounts
    where entity_id = new.entity_id and id = new.account_id;
  if not coalesce(a_ok, false) then
    raise exception 'account is not active or not postable' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger journal_lines_guard
  before insert or update or delete on journal_lines
  for each row execute function journal_line_guard();

-- ------------------------------------------------------------------ audit (append-only)

create table audit_events (
  id           bigserial primary key,
  firm_id      uuid not null references firms(id),
  entity_id    uuid,
  actor_id     uuid,
  action       text not null,
  object_type  text not null,
  object_id    text,
  data         jsonb,
  created_at   timestamptz not null default now()
);

create index audit_events_scope on audit_events (firm_id, entity_id, created_at desc);

create or replace function audit_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit events are append-only' using errcode = 'P0001';
end $$;

create trigger audit_events_immutable
  before update or delete on audit_events
  for each row execute function audit_append_only();

-- ------------------------------------------------------------------ row level security

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'clients', 'client_memberships', 'legal_entities', 'branches', 'accounts',
    'fiscal_periods', 'document_sequences', 'journal_entries', 'journal_lines', 'audit_events'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy firm_isolation on %I using (firm_id = app_firm_id()) with check (firm_id = app_firm_id())', t);
  end loop;
end $$;

alter table firms enable row level security;
alter table firms force row level security;
create policy firm_isolation on firms using (id = app_firm_id()) with check (id = app_firm_id());

-- Login happens before a firm context exists. The login transaction sets app.auth_email,
-- which exposes exactly one user row (by unique email) for credential verification.
create policy auth_lookup on users for select
  using (email = nullif(current_setting('app.auth_email', true), '')::citext);
