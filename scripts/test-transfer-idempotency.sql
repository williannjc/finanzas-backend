-- Isolated integration test for transfer_between_accounts idempotency.
-- Runs only in a disposable PostgreSQL database (e.g. GitHub Actions service container).
-- It creates a minimal fixture schema, mirrors the deployed function logic, tests two
-- identical calls, then rolls back everything. It never connects to Supabase production.
-- Keep the function body synchronized with public.transfer_between_accounts in Supabase.

begin;

create type public.transaction_type as enum ('income', 'expense', 'transfer');

create table public.profiles (
  id uuid primary key,
  created_at timestamptz default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  name text not null,
  type text not null,
  currency text default 'USD',
  initial_balance numeric default 0,
  current_balance numeric default 0,
  is_active boolean default true,
  updated_at timestamptz default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  account_id uuid not null references public.accounts(id),
  destination_account_id uuid references public.accounts(id),
  category_id uuid,
  type public.transaction_type not null,
  amount numeric not null,
  description text,
  source_message_id text
);

create unique index transactions_source_message_id_unique
  on public.transactions (user_id, source_message_id, type)
  where source_message_id is not null;

create or replace function public.transfer_between_accounts(
  p_user_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_description text default null,
  p_source_message_id text default null
)
returns table (
  transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  amount numeric,
  source_balance numeric,
  destination_balance numeric
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source public.accounts%rowtype;
  v_destination public.accounts%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_source_account_id is null or p_destination_account_id is null then
    raise exception 'La transferencia requiere cuenta de origen y cuenta de destino.';
  end if;

  if p_source_account_id = p_destination_account_id then
    raise exception 'La cuenta de origen y destino no pueden ser la misma.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> p_amount then
    raise exception 'El monto de la transferencia no es válido.';
  end if;

  if p_source_message_id is not null then
    select * into v_existing
    from public.transactions
    where user_id = p_user_id
      and source_message_id = p_source_message_id
      and type = 'transfer'::public.transaction_type
    limit 1;

    if found then
      select * into v_source
      from public.accounts
      where id = v_existing.account_id
        and user_id = p_user_id
        and is_active = true;

      select * into v_destination
      from public.accounts
      where id = v_existing.destination_account_id
        and user_id = p_user_id
        and is_active = true;

      if not found or v_source.id is null or v_destination.id is null then
        raise exception 'No se pudieron recuperar las cuentas de una transferencia existente.';
      end if;

      return query
      select v_existing.id, v_source.id, v_destination.id, v_existing.amount,
        coalesce(v_source.current_balance, 0), coalesce(v_destination.current_balance, 0);
      return;
    end if;
  end if;

  select * into v_source
  from public.accounts
  where id = p_source_account_id and user_id = p_user_id and is_active = true
  for update;

  if not found then raise exception 'No encontré la cuenta de origen.'; end if;

  select * into v_destination
  from public.accounts
  where id = p_destination_account_id and user_id = p_user_id and is_active = true
  for update;

  if not found then raise exception 'No encontré la cuenta de destino.'; end if;

  if coalesce(v_source.currency, 'USD') <> coalesce(v_destination.currency, 'USD') then
    raise exception 'Las cuentas de origen y destino deben tener la misma moneda.';
  end if;

  if coalesce(v_source.current_balance, 0) < p_amount then
    raise exception 'Saldo insuficiente en la cuenta de origen. Saldo disponible: $%',
      to_char(coalesce(v_source.current_balance, 0), 'FM999999999990.00');
  end if;

  update public.accounts
  set current_balance = coalesce(v_source.current_balance, 0) - p_amount, updated_at = now()
  where id = v_source.id;

  update public.accounts
  set current_balance = coalesce(v_destination.current_balance, 0) + p_amount, updated_at = now()
  where id = v_destination.id;

  insert into public.transactions (
    user_id, account_id, destination_account_id, category_id, type, amount, description, source_message_id
  ) values (
    p_user_id, v_source.id, v_destination.id, null, 'transfer'::public.transaction_type,
    p_amount, coalesce(p_description, 'Transferencia entre cuentas'), p_source_message_id
  ) returning id into v_transaction_id;

  return query
  select v_transaction_id, v_source.id, v_destination.id, p_amount,
    coalesce(v_source.current_balance, 0) - p_amount,
    coalesce(v_destination.current_balance, 0) + p_amount;
end;
$function$;

insert into public.profiles (id) values ('937e1840-053c-4252-8878-e44caa328cae');

do $test$
declare
  v_user_id uuid := '937e1840-053c-4252-8878-e44caa328cae';
  v_source_id uuid := 'a7e51b31-0d7b-4b8b-a37a-9d4010000002';
  v_destination_id uuid := 'a7e51b31-0d7b-4b8b-a37a-9d4010000003';
  v_message_id text := 'db-idempotency-test-fixed-message';
  v_first record;
  v_second record;
  v_transfer_count integer;
  v_source_balance numeric;
  v_destination_balance numeric;
begin
  insert into public.accounts (id, user_id, name, type, currency, initial_balance, current_balance, is_active)
  values
    (v_source_id, v_user_id, 'TEST ONLY - source', 'cash', 'USD', 100, 100, true),
    (v_destination_id, v_user_id, 'TEST ONLY - destination', 'bank', 'USD', 50, 50, true);

  select * into v_first from public.transfer_between_accounts(
    v_user_id, v_source_id, v_destination_id, 20, 'Automated idempotency test', v_message_id
  );

  select * into v_second from public.transfer_between_accounts(
    v_user_id, v_source_id, v_destination_id, 20, 'Duplicate message', v_message_id
  );

  if v_first.transfer_id is distinct from v_second.transfer_id then
    raise exception 'FAIL: duplicate call returned a different transfer id.';
  end if;

  select count(*) into v_transfer_count from public.transactions
  where user_id = v_user_id and source_message_id = v_message_id
    and type = 'transfer'::public.transaction_type;

  if v_transfer_count <> 1 then
    raise exception 'FAIL: expected exactly 1 transfer row, found %.', v_transfer_count;
  end if;

  select current_balance into v_source_balance from public.accounts where id = v_source_id;
  select current_balance into v_destination_balance from public.accounts where id = v_destination_id;

  if v_source_balance <> 80 or v_destination_balance <> 70 then
    raise exception 'FAIL: expected balances 80/70, found %/%.', v_source_balance, v_destination_balance;
  end if;

  raise notice 'PASS: same transfer id %, one transaction row, balances source=%, destination=%',
    v_first.transfer_id, v_source_balance, v_destination_balance;
end;
$test$;

rollback;
