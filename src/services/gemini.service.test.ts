import assert from "node:assert/strict";
import test from "node:test";
import { validarAnalisis } from "./gemini.service";

test("acepta una transacción inequívoca con monto positivo", () => {
  assert.doesNotThrow(() => validarAnalisis({
    tipo: "gasto",
    monto: 15,
    categoria: "alimentación",
    descripcion: "almuerzo",
    intencion: "transaction",
  }));
});

test("rechaza una transacción sin monto válido", () => {
  assert.throws(() => validarAnalisis({
    tipo: "gasto",
    monto: null,
    categoria: "alimentación",
    descripcion: "almuerzo",
    intencion: "transaction",
  }));
});

test("acepta una consulta financiera sin monto", () => {
  assert.doesNotThrow(() => validarAnalisis({
    tipo: "consulta",
    monto: null,
    categoria: "transporte",
    descripcion: "¿Cuánto gasté en transporte?",
    intencion: "category_expense_query",
  }));
});
