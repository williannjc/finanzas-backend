import { createHmac, timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

type RequestWithRawBody = Request & { rawBody?: Buffer };

export function coincideNumeroAutorizado(
  sender: string,
  allowedNumber: string
): boolean {
  const senderDigits = sender.replace(/\D/g, "");
  const allowedDigits = allowedNumber.replace(/\D/g, "");
  return Boolean(allowedDigits) && senderDigits === allowedDigits;
}

export function verificarFirmaMeta(
  rawBody: Buffer,
  signature: string,
  appSecret: string
): boolean {
  if (!signature.startsWith("sha256=") || !appSecret) return false;
  const supplied = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/**
 * En producción exige firma válida de Meta y limita el webhook al número
 * personal configurado. En desarrollo/test no bloquea los tests locales.
 */
export function validarWebhookMeta(
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
): void {
  if (env.NODE_ENV !== "production") return next();

  if (!env.META_APP_SECRET || !env.WHATSAPP_ALLOWED_PHONE_NUMBER) {
    res.status(503).json({ error: "Webhook no configurado para uso personal seguro." });
    return;
  }

  const rawBody = req.rawBody;
  const signature = req.header("x-hub-signature-256") || "";
  if (!rawBody || !verificarFirmaMeta(rawBody, signature, env.META_APP_SECRET)) {
    res.sendStatus(401);
    return;
  }

  const sender = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  // Los eventos de estado enviados por Meta no contienen remitente.
  if (typeof sender === "string" &&
      !coincideNumeroAutorizado(sender, env.WHATSAPP_ALLOWED_PHONE_NUMBER)) {
    // Responder 200 sin revelar si el número está autorizado.
    res.sendStatus(200);
    return;
  }

  next();
}
