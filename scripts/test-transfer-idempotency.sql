-- Integration test for public.transfer_between_accounts idempotency.
-- SAFETY: run ONLY against a disposable local/staging Supabase database, never production.
-- All fixture rows and balance changes are enclosed in a transaction and rolled back.
-- Requires at least one existing public.profiles row in the test database.

begin;

do $test$
declare
  v_user_id uuid;
  v_source_id uuid := gen_random_uuid();
  v_destination_id uuid := gen_random_uuid();
  v_message_id text := 'db-idempotency-test-' || gen_random_uuid()::text;
  v_first record;
  v_second record;
  v_transfer_count integer;
  v_source_balance numeric;
  v_destination_balance numeric;
begin
  select id into v_user_id
  from public.profiles
  order by created_at nulls last
  limit 1;

  if v_user_id is null then
    raise exception 'TEST SETUP FAILED: public.profiles has no user fixture.';
  end if;

  insert into public.accounts (
    id, user_id, name, type, currency, initial_balance, current_balance, is_active
  ) values
    (v_source_id, v_user_id, 'TEST ONLY - idempotency source', 'cash', 'USD', 100, 100, true),
    (v_destination_id, v_user_id, 'TEST ONLY - idempotency destination', 'bank', 'USD', 50, 50, true);

  select * into v_first
  from public.transfer_between_accounts(
    v_user_id, v_source_id, v_destination_id, 20,
    'Automated idempotency test', v_message_id
  );

  select * into v_second
  from public.transfer_between_accounts(
    v_user_id, v_source_id, v_destination_id, 20,
    'Automated idempotency test duplicate', v_message_id
  );

  if v_first.transfer_id is distinct from v_second.transfer_id then
    raise exception 'FAIL: duplicate call returned a different transfer id.';
  end if;

  select count(*) into v_transfer_count
  from public.transactions
  where user_id = v_user_id
    and source_message_id = v_message_id
    and type = 'transfer'::public.transaction_type;

  if v_transfer_count <> 1 then
    raise exception 'FAIL: expected exactly 1 transfer row, found %.', v_transfer_count;
  end if;

  select current_balance into v_source_balance
  from public.accounts where id = v_source_id;

  select current_balance into v_destination_balance
  from public.accounts where id = v_destination_id;

  if v_source_balance <> 80 or v_destination_balance <> 70 then
    raise exception 'FAIL: expected balances 80/70, found %/%.',
      v_source_balance, v_destination_balance;
  end if;

  raise notice 'PASS: duplicate call reused transfer %, exactly one row, balances source=%, destination=%.',
    v_first.transfer_id, v_source_balance, v_destination_balance;
end;
$test$;

rollback;
