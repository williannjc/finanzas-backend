import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  coincideNumeroAutorizado,
  verificarFirmaMeta,
} from "./whatsapp-security.middleware.js";

test("acepta únicamente el número autorizado normalizado", () => {
  assert.equal(coincideNumeroAutorizado("593982807918", "+593 982 807 918"), true);
  assert.equal(coincideNumeroAutorizado("593999999999", "593982807918"), false);
  assert.equal(coincideNumeroAutorizado("593982807918", ""), false);
});

test("verifica la firma HMAC SHA-256 de Meta", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = "test-secret";
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verificarFirmaMeta(body, `sha256=${digest}`, secret), true);
  assert.equal(verificarFirmaMeta(body, `sha256=${digest}`, "wrong-secret"), false);
  assert.equal(verificarFirmaMeta(body, "invalid", secret), false);
});
