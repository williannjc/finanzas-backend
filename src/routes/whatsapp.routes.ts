import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { supabase } from "../config/supabase";

import { analizarMensaje } from "../services/openai.service";
import { obtenerOCrearUsuario } from "../services/user.service";
import { obtenerOCrearCuentaPrincipal } from "../services/account.service";
import { crearTransaccion } from "../services/transaction.service";
import { enviarMensajeWhatsApp } from "../services/whatsapp.service";

const router = Router();

/**
 * ============================================================
 * COMPROBAR SI UN MENSAJE YA FUE PROCESADO
 * ============================================================
 */
async function mensajeYaProcesado(
  messageId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("processed_messages")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}

/**
 * ============================================================
 * VERIFICACIÓN DEL WEBHOOK DE META
 * ============================================================
 */
router.get(
  "/webhook",
  (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === env.WHATSAPP_VERIFY_TOKEN
    ) {
      console.log("✅ Webhook verificado por Meta");

      return res
        .status(200)
        .send(challenge);
    }

    return res.sendStatus(403);
  }
);

/**
 * ============================================================
 * RECEPCIÓN DE MENSAJES DE WHATSAPP
 * ============================================================
 */
router.post(
  "/webhook",
  async (req: Request, res: Response) => {
    console.log("========== NUEVO MENSAJE ==========");

    try {
      // ========================================================
      // 1. OBTENER INFORMACIÓN DEL EVENTO
      // ========================================================

      const entry = req.body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      const message = value?.messages?.[0];

      /**
       * Meta también envía eventos que no contienen mensajes.
       * Por ejemplo, estados de mensajes enviados.
       */
      if (!message) {
        console.log(
          "ℹ️ Evento recibido sin mensaje"
        );

        return res.sendStatus(200);
      }

      const from = message.from;
      const messageType = message.type;
      const messageId = message.id;

      console.log("📱 Remitente:", from);
      console.log("📦 Tipo:", messageType);
      console.log("🆔 ID del mensaje:", messageId);

      // ========================================================
      // 2. VALIDAR ID DEL MENSAJE
      // ========================================================

      if (!messageId) {
        console.log(
          "⚠️ El mensaje no tiene ID. Se ignora."
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // 3. EVITAR MENSAJES DUPLICADOS
      // ========================================================

      const yaProcesado =
        await mensajeYaProcesado(messageId);

      if (yaProcesado) {
        console.log(
          "🔁 Mensaje duplicado. Se ignora."
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // 4. REGISTRAR MENSAJE COMO PROCESADO
      // ========================================================

      const { error: insertError } =
        await supabase
          .from("processed_messages")
          .insert({
            message_id: messageId,
          });

      if (insertError) {
        /**
         * Si otra petición registró el mismo mensaje
         * al mismo tiempo, la restricción UNIQUE
         * evita que se procese dos veces.
         */
        if (insertError.code === "23505") {
          console.log(
            "🔁 Mensaje duplicado detectado por UNIQUE. Se ignora."
          );

          return res.sendStatus(200);
        }

        throw insertError;
      }

      console.log(
        "✅ Mensaje nuevo registrado para procesamiento"
      );

      // ========================================================
      // 5. OBTENER / CREAR USUARIO
      // ========================================================

      const usuario =
        await obtenerOCrearUsuario(from);

      console.log("👤 Usuario:");
      console.dir(usuario, {
        depth: null,
      });

      // ========================================================
      // 6. OBTENER / CREAR CUENTA PRINCIPAL
      // ========================================================

      const cuenta =
        await obtenerOCrearCuentaPrincipal(
          usuario.id
        );

      console.log("💰 Cuenta:");
      console.dir(cuenta, {
        depth: null,
      });

      // ========================================================
      // 7. PROCESAR MENSAJE DE TEXTO
      // ========================================================

      if (messageType !== "text") {
        console.log(
          `ℹ️ Tipo de mensaje no procesado: ${messageType}`
        );

        console.log(
          "==================================="
        );

        return res.sendStatus(200);
      }

      const text = message.text?.body;

      console.log("💬 Mensaje:", text);

      if (!text) {
        console.log(
          "ℹ️ Mensaje de texto vacío"
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // 8. ANALIZAR MENSAJE CON GEMINI
      // ========================================================

      const analisis =
        await analizarMensaje(text);

      console.log("🤖 Análisis de IA:");
      console.dir(analisis, {
        depth: null,
      });

      // ========================================================
      // 9. VALIDAR SI ES UNA TRANSACCIÓN
      // ========================================================

      const esGasto =
        analisis.tipo === "gasto";

      const esIngreso =
        analisis.tipo === "ingreso";

      /**
       * IMPORTANTE:
       *
       * Guardamos monto en una constante y comprobamos
       * explícitamente que NO sea null.
       *
       * Después de este if, TypeScript sabe que monto
       * es un number.
       */
      const monto = analisis.monto;

      if (
        !esGasto &&
        !esIngreso
      ) {
        console.log(
          "ℹ️ El mensaje no corresponde a una transacción."
        );

        console.log(
          "==================================="
        );

        return res.sendStatus(200);
      }

      if (
        monto === null ||
        !Number.isFinite(monto) ||
        monto <= 0
      ) {
        console.log(
          "⚠️ La transacción no tiene un monto válido."
        );

        console.log(
          "==================================="
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // 10. CONVERTIR TIPO GEMINI -> ENUM SUPABASE
      // ========================================================

      const tipoTransaccion:
        | "expense"
        | "income" =
        esGasto
          ? "expense"
          : "income";

      // ========================================================
      // 11. CREAR TRANSACCIÓN
      // ========================================================

      const transaccion =
        await crearTransaccion({
          userId: usuario.id,
          accountId: cuenta.id,
          tipo: tipoTransaccion,
          monto: monto,
          categoria:
            analisis.categoria,
          descripcion:
            analisis.descripcion,
        });

      console.log(
        "💸 Transacción creada:"
      );

      console.dir(transaccion, {
        depth: null,
      });

      // ========================================================
      // 12. OBTENER SALDO ACTUALIZADO
      // ========================================================

      const {
        data: cuentaActualizada,
        error: cuentaError,
      } = await supabase
        .from("accounts")
        .select(
          "current_balance"
        )
        .eq(
          "id",
          cuenta.id
        )
        .single();

      if (cuentaError) {
        throw cuentaError;
      }

      // ========================================================
      // 13. OBTENER NOMBRE REAL DE LA CATEGORÍA
      // ========================================================

      let nombreCategoria =
        analisis.categoria ||
        "Otros";

      if (
        transaccion.category_id
      ) {
        const {
          data: categoria,
        } = await supabase
          .from("categories")
          .select("name")
          .eq(
            "id",
            transaccion.category_id
          )
          .single();

        if (categoria?.name) {
          nombreCategoria =
            categoria.name;
        }
      }

      // ========================================================
      // 14. SALDO Y MONTO
      // ========================================================

      const saldo =
        Number(
          cuentaActualizada.current_balance
        );

      const montoFinal =
        Number(monto);

      // ========================================================
      // 15. CREAR RESPUESTA PARA WHATSAPP
      // ========================================================

      let respuesta = "";

      if (
        tipoTransaccion ===
        "expense"
      ) {
        respuesta =
          `✅ Gasto registrado\n\n` +
          `💵 $${montoFinal.toFixed(2)}\n` +
          `🏷️ ${nombreCategoria}\n` +
          `💳 ${cuenta.name}\n` +
          `📊 Saldo actual: $${saldo.toFixed(2)}`;
      } else {
        respuesta =
          `✅ Ingreso registrado\n\n` +
          `💵 $${montoFinal.toFixed(2)}\n` +
          `🏷️ ${nombreCategoria}\n` +
          `💳 ${cuenta.name}\n` +
          `📊 Saldo actual: $${saldo.toFixed(2)}`;
      }

      // ========================================================
      // 16. ENVIAR RESPUESTA POR WHATSAPP
      // ========================================================

      await enviarMensajeWhatsApp(
        from,
        respuesta
      );

      console.log(
        "📤 Respuesta enviada al usuario"
      );

      console.log(
        "==================================="
      );

      return res.sendStatus(200);

    } catch (error: any) {
      console.error(
        "❌ Error procesando webhook:",
        error?.response?.data ||
          error
      );

      console.log(
        "==================================="
      );

      return res.sendStatus(500);
    }
  }
);

export default router;