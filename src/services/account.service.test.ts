import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { supabase } from "../config/supabase";
import { transferirEntreCuentas } from "./account.service";

const USER_ID = "3af35876-c813-46f6-8cbb-7dffbd4d0b87";

function crearQueryMock(
  data: unknown,
  error: unknown = null
) {
  const query = {
    select: () => query,
    eq: () => query,
    ilike: () => query,
    maybeSingle: async () => ({
      data,
      error,
    }),
  };

  return query;
}

function mockearCuentas(
  cuentaOrigen: unknown,
  cuentaDestino: unknown,
  origenError: unknown = null,
  destinoError: unknown = null
) {
  let llamadas = 0;

  mock.method(
    supabase as any,
    "from",
    () => {
      llamadas++;

      if (llamadas === 1) {
        return crearQueryMock(
          cuentaOrigen,
          origenError
        );
      }

      return crearQueryMock(
        cuentaDestino,
        destinoError
      );
    }
  );

  return {
    obtenerLlamadas: () => llamadas,
  };
}

const cuentaOrigen = {
  id: "origen-id",
  user_id: USER_ID,
  name: "Efectivo",
  type: "cash",
  currency: "USD",
  current_balance: 100,
  is_active: true,
};

const cuentaDestino = {
  id: "destino-id",
  user_id: USER_ID,
  name: "Banco Pichincha",
  type: "bank",
  currency: "USD",
  current_balance: 50,
  is_active: true,
};

afterEach(() => {
  mock.restoreAll();
});

test("rechaza una transferencia sin cuenta de origen", async () => {
  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "",
        "Banco Pichincha",
        20
      ),
    {
      message:
        "La transferencia requiere cuenta de origen y cuenta de destino.",
    }
  );
});

test("rechaza una transferencia sin cuenta de destino", async () => {
  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "",
        20
      ),
    {
      message:
        "La transferencia requiere cuenta de origen y cuenta de destino.",
    }
  );
});

test("rechaza una transferencia entre la misma cuenta", async () => {
  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "efectivo",
        20
      ),
    {
      message:
        "La cuenta de origen y destino no pueden ser la misma.",
    }
  );
});

test("rechaza una transferencia con monto cero", async () => {
  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        0
      ),
    {
      message:
        "El monto de la transferencia no es válido.",
    }
  );
});

test("rechaza una transferencia con monto negativo", async () => {
  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        -10
      ),
    {
      message:
        "El monto de la transferencia no es válido.",
    }
  );
});

test("rechaza una transferencia con monto NaN", async () => {
  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        Number.NaN
      ),
    {
      message:
        "El monto de la transferencia no es válido.",
    }
  );
});

test("rechaza cuando no existe la cuenta de origen", async () => {
  mockearCuentas(null, cuentaDestino);

  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        20
      ),
    {
      message:
        'No encontré la cuenta de origen "Efectivo".',
    }
  );
});

test("rechaza cuando no existe la cuenta de destino", async () => {
  mockearCuentas(cuentaOrigen, null);

  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        20
      ),
    {
      message:
        'No encontré la cuenta de destino "Banco Pichincha".',
    }
  );
});

test("rechaza cuando Supabase devuelve error al buscar origen", async () => {
  mockearCuentas(
    null,
    cuentaDestino,
    new Error("Error de Supabase")
  );

  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        20
      ),
    {
      message: "Error de Supabase",
    }
  );
});

test("rechaza cuando Supabase devuelve error al buscar destino", async () => {
  mockearCuentas(
    cuentaOrigen,
    null,
    null,
    new Error("Error buscando destino")
  );

  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        20
      ),
    {
      message: "Error buscando destino",
    }
  );
});

test("rechaza una transferencia cuando el RPC devuelve saldo insuficiente", async () => {
  mockearCuentas(
    cuentaOrigen,
    cuentaDestino
  );

  mock.method(
    supabase as any,
    "rpc",
    async () => ({
      data: null,
      error: {
        message:
          "Saldo insuficiente en la cuenta de origen. Saldo disponible: $100.00",
      },
    })
  );

  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        150
      ),
    {
      message:
        "Saldo insuficiente en la cuenta de origen. Saldo disponible: $100.00",
    }
  );
});

test("rechaza cuando el RPC no devuelve ningún resultado", async () => {
  mockearCuentas(
    cuentaOrigen,
    cuentaDestino
  );

  mock.method(
    supabase as any,
    "rpc",
    async () => ({
      data: [],
      error: null,
    })
  );

  await assert.rejects(
    () =>
      transferirEntreCuentas(
        USER_ID,
        "Efectivo",
        "Banco Pichincha",
        20
      ),
    {
      message:
        "La transferencia no produjo ningún resultado.",
    }
  );
});

test("ejecuta correctamente una transferencia válida", async () => {
  mockearCuentas(
    cuentaOrigen,
    cuentaDestino
  );

  mock.method(
    supabase as any,
    "rpc",
    async (
      nombreFuncion: string,
      parametros: Record<string, unknown>
    ) => {
      assert.equal(
        nombreFuncion,
        "transfer_between_accounts"
      );

      assert.deepEqual(parametros, {
        p_user_id: USER_ID,
        p_source_account_id: "origen-id",
        p_destination_account_id: "destino-id",
        p_amount: 20,
        p_description:
          "Transferencia de Efectivo a Banco Pichincha",
      });

      return {
        data: [
          {
            transfer_id: "transfer-123",
            amount: 20,
            source_balance: 80,
            destination_balance: 70,
          },
        ],
        error: null,
      };
    }
  );

  const resultado =
    await transferirEntreCuentas(
      USER_ID,
      "Efectivo",
      "Banco Pichincha",
      20
    );

  assert.equal(
    resultado.transferId,
    "transfer-123"
  );

  assert.equal(resultado.monto, 20);

  assert.equal(
    resultado.cuentaOrigen.name,
    "Efectivo"
  );

  assert.equal(
    resultado.cuentaOrigen.current_balance,
    80
  );

  assert.equal(
    resultado.cuentaDestino.name,
    "Banco Pichincha"
  );

  assert.equal(
    resultado.cuentaDestino.current_balance,
    70
  );
});