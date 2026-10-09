import test, { mock } from "node:test";
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

const {
  obtenerSaldoTotal,
  obtenerGastosDelDia,
  obtenerGastosDelMes,
  obtenerIngresosDelMes,
  obtenerGastosPorCategoria,
  obtenerGastosPorCategoriaNombre,
  obtenerUltimasTransacciones,
  obtenerResumenMensual,
} = await import("./finance.service.js");

const USER_ID = "3af35876-c813-46f6-8cbb-7dffbd4d0b87";

test("finance.service exporta todas las consultas principales", () => {
  assert.equal(typeof obtenerSaldoTotal, "function");
  assert.equal(typeof obtenerGastosDelDia, "function");
  assert.equal(typeof obtenerGastosDelMes, "function");
  assert.equal(typeof obtenerIngresosDelMes, "function");
  assert.equal(typeof obtenerGastosPorCategoria, "function");
  assert.equal(typeof obtenerGastosPorCategoriaNombre, "function");
  assert.equal(typeof obtenerUltimasTransacciones, "function");
  assert.equal(typeof obtenerResumenMensual, "function");
});

test("obtenerSaldoTotal devuelve cuentas y saldo numérico", async () => {
  const resultado = await obtenerSaldoTotal(USER_ID);
  assert.deepEqual(resultado, { saldoTotal: 0, cuentas: [] });
});

test("obtenerGastosDelDia devuelve total y transacciones", async () => {
  const resultado = await obtenerGastosDelDia(USER_ID);
  assert.deepEqual(resultado, { total: 0, transacciones: [] });
});

test("obtenerGastosDelMes devuelve total y transacciones", async () => {
  const resultado = await obtenerGastosDelMes(USER_ID);
  assert.deepEqual(resultado, { total: 0, transacciones: [] });
});

test("obtenerIngresosDelMes devuelve total y transacciones", async () => {
  const resultado = await obtenerIngresosDelMes(USER_ID);
  assert.deepEqual(resultado, { total: 0, transacciones: [] });
});

test("obtenerGastosPorCategoria devuelve un arreglo", async () => {
  assert.deepEqual(await obtenerGastosPorCategoria(USER_ID), []);
});

test("obtenerGastosPorCategoriaNombre devuelve estructura válida sin categoría", async () => {
  assert.deepEqual(
    await obtenerGastosPorCategoriaNombre(USER_ID, "alimentacion"),
    { categoria: "alimentacion", total: 0, transacciones: [] }
  );
});

test("obtenerUltimasTransacciones devuelve un arreglo", async () => {
  assert.deepEqual(await obtenerUltimasTransacciones(USER_ID, 5), []);
});

test("obtenerResumenMensual devuelve ingresos, gastos, balance y categorías", async () => {
  assert.deepEqual(await obtenerResumenMensual(USER_ID), {
    ingresos: 0,
    gastos: 0,
    balance: 0,
    categorias: [],
  });
});
