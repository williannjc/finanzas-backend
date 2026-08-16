import test from "node:test";
import assert from "node:assert/strict";

import {
  obtenerSaldoTotal,
  obtenerGastosDelDia,
  obtenerGastosDelMes,
  obtenerIngresosDelMes,
  obtenerGastosPorCategoria,
  obtenerGastosPorCategoriaNombre,
  obtenerUltimasTransacciones,
  obtenerResumenMensual,
} from "./finance.service";

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

  assert.ok(Array.isArray(resultado.cuentas));
  assert.equal(typeof resultado.saldoTotal, "number");

  for (const cuenta of resultado.cuentas) {
    assert.equal(typeof cuenta.id, "string");
    assert.equal(typeof cuenta.name, "string");
    assert.equal(typeof Number(cuenta.current_balance), "number");
  }
});

test("obtenerGastosDelDia devuelve total y transacciones", async () => {
  const resultado = await obtenerGastosDelDia(USER_ID);

  assert.equal(typeof resultado.total, "number");
  assert.ok(Array.isArray(resultado.transacciones));

  for (const transaccion of resultado.transacciones) {
    assert.equal(typeof transaccion.id, "string");
    assert.equal(typeof Number(transaccion.amount), "number");
  }
});

test("obtenerGastosDelMes devuelve total y transacciones", async () => {
  const resultado = await obtenerGastosDelMes(USER_ID);

  assert.equal(typeof resultado.total, "number");
  assert.ok(Array.isArray(resultado.transacciones));
});

test("obtenerIngresosDelMes devuelve total y transacciones", async () => {
  const resultado = await obtenerIngresosDelMes(USER_ID);

  assert.equal(typeof resultado.total, "number");
  assert.ok(Array.isArray(resultado.transacciones));
});

test("obtenerGastosPorCategoria devuelve categorías ordenadas", async () => {
  const resultado = await obtenerGastosPorCategoria(USER_ID);

  assert.ok(Array.isArray(resultado));

  for (let i = 0; i < resultado.length; i++) {
    assert.equal(typeof resultado[i].nombre, "string");
    assert.equal(typeof resultado[i].total, "number");

    if (i > 0) {
      assert.ok(
        resultado[i - 1].total >= resultado[i].total
      );
    }
  }
});

test("obtenerGastosPorCategoriaNombre devuelve estructura válida", async () => {
  const resultado =
    await obtenerGastosPorCategoriaNombre(
      USER_ID,
      "alimentacion"
    );

  assert.equal(typeof resultado.categoria, "string");
  assert.equal(typeof resultado.total, "number");
  assert.ok(Array.isArray(resultado.transacciones));
});

test("obtenerUltimasTransacciones devuelve un arreglo", async () => {
  const resultado =
    await obtenerUltimasTransacciones(USER_ID, 5);

  assert.ok(Array.isArray(resultado));
  assert.ok(resultado.length <= 5);
});

test("obtenerResumenMensual devuelve ingresos, gastos, balance y categorías", async () => {
  const resultado =
    await obtenerResumenMensual(USER_ID);

  assert.equal(typeof resultado.ingresos, "number");
  assert.equal(typeof resultado.gastos, "number");
  assert.equal(typeof resultado.balance, "number");
  assert.ok(Array.isArray(resultado.categorias));

  assert.equal(
    resultado.balance,
    resultado.ingresos - resultado.gastos
  );
});