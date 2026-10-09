import test, { before, mock } from "node:test";
import assert from "node:assert/strict";

// Estas pruebas son unitarias: nunca deben conectarse a la base de datos real.
const queryMock = {
  select: () => queryMock,
  eq: () => queryMock,
  gte: () => queryMock,
  lte: () => queryMock,
  lt: () => queryMock,
  order: () => queryMock,
  limit: () => queryMock,
  or: () => queryMock,
  ilike: () => queryMock,
  maybeSingle: async () => ({ data: null, error: null }),
  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve),
};

mock.module("../config/supabase.js", {
  namedExports: {
    supabase: {
      from: () => queryMock,
    },
  },
});

let financeService: typeof import("./finance.service.js");

before(async () => {
  financeService = await import("./finance.service.js");
});

const USER_ID = "3af35876-c813-46f6-8cbb-7dffbd4d0b87";

test("finance.service exporta todas las consultas principales", () => {
  assert.equal(typeof financeService.obtenerSaldoTotal, "function");
  assert.equal(typeof financeService.obtenerGastosDelDia, "function");
  assert.equal(typeof financeService.obtenerGastosDelMes, "function");
  assert.equal(typeof financeService.obtenerIngresosDelMes, "function");
  assert.equal(typeof financeService.obtenerGastosPorCategoria, "function");
  assert.equal(typeof financeService.obtenerGastosPorCategoriaNombre, "function");
  assert.equal(typeof financeService.obtenerUltimasTransacciones, "function");
  assert.equal(typeof financeService.obtenerResumenMensual, "function");
});

test("obtenerSaldoTotal devuelve cuentas y saldo numérico", async () => {
  assert.deepEqual(await financeService.obtenerSaldoTotal(USER_ID), {
    saldoTotal: 0,
    cuentas: [],
  });
});

test("obtenerGastosDelDia devuelve total y transacciones", async () => {
  assert.deepEqual(await financeService.obtenerGastosDelDia(USER_ID), {
    total: 0,
    transacciones: [],
  });
});

test("obtenerGastosDelMes devuelve total y transacciones", async () => {
  assert.deepEqual(await financeService.obtenerGastosDelMes(USER_ID), {
    total: 0,
    transacciones: [],
  });
});

test("obtenerIngresosDelMes devuelve total y transacciones", async () => {
  assert.deepEqual(await financeService.obtenerIngresosDelMes(USER_ID), {
    total: 0,
    transacciones: [],
  });
});

test("obtenerGastosPorCategoria devuelve un arreglo", async () => {
  assert.deepEqual(await financeService.obtenerGastosPorCategoria(USER_ID), []);
});

test("obtenerGastosPorCategoriaNombre devuelve estructura válida sin categoría", async () => {
  assert.deepEqual(
    await financeService.obtenerGastosPorCategoriaNombre(USER_ID, "alimentacion"),
    { categoria: "alimentacion", total: 0, transacciones: [] }
  );
});

test("obtenerUltimasTransacciones devuelve un arreglo", async () => {
  assert.deepEqual(
    await financeService.obtenerUltimasTransacciones(USER_ID, 5),
    []
  );
});

test("obtenerResumenMensual devuelve ingresos, gastos, balance y categorías", async () => {
  assert.deepEqual(await financeService.obtenerResumenMensual(USER_ID), {
    ingresos: 0,
    gastos: 0,
    balance: 0,
    categorias: [],
  });
});
