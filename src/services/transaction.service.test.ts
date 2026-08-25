import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { supabase } from "../config/supabase";
import { crearTransaccion } from "./transaction.service";

const USER_ID = "3af35876-c813-46f6-8cbb-7dffbd4d0b87";
const ACCOUNT_ID = "account-id";
const MESSAGE_ID = "wamid.test-123";

afterEach(() => {
  mock.restoreAll();
});

function mockearCategoria() {
  mock.method(
    supabase as any,
    "from",
    (tabla: string) => {
      assert.equal(tabla, "categories");

      const query = {
        select: () => query,
        eq: () => query,
        ilike: () => query,
        maybeSingle: async () => ({
          data: null,
          error: null,
        }),
      };

      return query;
    }
  );
}

test("crea una transacción correctamente con sourceMessageId", async () => {
  let insertRecibido: Record<string, unknown> | null = null;

  mock.method(
    supabase as any,
    "from",
    (tabla: string) => {
      if (tabla === "categories") {
        const query = {
          select: () => query,
          eq: () => query,
          ilike: () => query,
          maybeSingle: async () => ({
            data: null,
            error: null,
          }),
        };

        return query;
      }

      assert.equal(tabla, "transactions");

      const query = {
        insert: (datos: Record<string, unknown>) => {
          insertRecibido = datos;
          return query;
        },
        select: () => query,
        single: async () => ({
          data: {
            id: "transaction-123",
            user_id: USER_ID,
            account_id: ACCOUNT_ID,
            type: "expense",
            amount: 20,
            description: "Almuerzo",
            source_message_id: MESSAGE_ID,
          },
          error: null,
        }),
      };

      return query;
    }
  );

  const resultado = await crearTransaccion({
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    tipo: "expense",
    monto: 20,
    categoria: null,
    descripcion: "Almuerzo",
    sourceMessageId: MESSAGE_ID,
  });

  assert.equal(resultado.id, "transaction-123");

  assert.deepEqual(insertRecibido, {
    user_id: USER_ID,
    account_id: ACCOUNT_ID,
    category_id: null,
    type: "expense",
    amount: 20,
    description: "Almuerzo",
    source_message_id: MESSAGE_ID,
  });
});

test("recupera una transacción existente cuando sourceMessageId ya fue utilizado", async () => {
  let llamadasTransactions = 0;

  mock.method(
    supabase as any,
    "from",
    (tabla: string) => {
      if (tabla === "categories") {
        const query = {
          select: () => query,
          eq: () => query,
          ilike: () => query,
          maybeSingle: async () => ({
            data: null,
            error: null,
          }),
        };

        return query;
      }

      assert.equal(tabla, "transactions");

      llamadasTransactions++;

      if (llamadasTransactions === 1) {
        const query = {
          insert: () => query,
          select: () => query,
          single: async () => ({
            data: null,
            error: {
              code: "23505",
              message:
                "duplicate key value violates unique constraint",
            },
          }),
        };

        return query;
      }

      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: {
            id: "transaction-existing",
            user_id: USER_ID,
            account_id: ACCOUNT_ID,
            type: "expense",
            amount: 20,
            description: "Almuerzo",
            source_message_id: MESSAGE_ID,
          },
          error: null,
        }),
      };

      return query;
    }
  );

  const resultado = await crearTransaccion({
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    tipo: "expense",
    monto: 20,
    categoria: null,
    descripcion: "Almuerzo",
    sourceMessageId: MESSAGE_ID,
  });

  assert.equal(
    resultado.id,
    "transaction-existing"
  );

  assert.equal(
    resultado.source_message_id,
    MESSAGE_ID
  );

  assert.equal(
    resultado.amount,
    20
  );
});

test("propaga un error de transacción que no sea duplicado", async () => {
  mock.method(
    supabase as any,
    "from",
    (tabla: string) => {
      if (tabla === "categories") {
        const query = {
          select: () => query,
          eq: () => query,
          ilike: () => query,
          maybeSingle: async () => ({
            data: null,
            error: null,
          }),
        };

        return query;
      }

      const query = {
        insert: () => query,
        select: () => query,
        single: async () => ({
          data: null,
          error: {
            code: "23503",
            message: "foreign key violation",
          },
        }),
      };

      return query;
    }
  );

  await assert.rejects(
    () =>
      crearTransaccion({
        userId: USER_ID,
        accountId: ACCOUNT_ID,
        tipo: "expense",
        monto: 20,
        categoria: null,
        descripcion: "Almuerzo",
        sourceMessageId: MESSAGE_ID,
      }),
    {
      message: "foreign key violation",
    }
  );
});