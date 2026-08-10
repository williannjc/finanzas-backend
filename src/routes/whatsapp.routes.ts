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
 * Verificación del webhook (Meta)
 */
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === env.WHATSAPP_VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verificado por Meta");

    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/**
 * Recepción de mensajes de WhatsApp
 */
router.post("/webhook", async (req: Request, res: Response) => {
  console.log("========== NUEVO MENSAJE ==========");

  try {
    // ==========================================
    // 1. OBTENER INFORMACIÓN DEL EVENTO
    // ==========================================

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];

    // Si Meta envía un evento que no contiene
    // un mensaje, simplemente lo ignoramos.
    if (!message) {
      console.log("ℹ️ Evento recibido sin mensaje");
      return res.sendStatus(200);
    }

    const from = message.from;
    const messageType = message.type;

    console.log("📱 Remitente:", from);
    console.log("📦 Tipo:", messageType);

    // ==========================================
    // 2. OBTENER / CREAR USUARIO
    // ==========================================

    const usuario = await obtenerOCrearUsuario(from);

    console.log("👤 Usuario:", usuario);

    // ==========================================
    // 3. OBTENER / CREAR CUENTA PRINCIPAL
    // ==========================================

    const cuenta = await obtenerOCrearCuentaPrincipal(
      usuario.id
    );

    console.log("💰 Cuenta:", cuenta);

    // ==========================================
    // 4. PROCESAR MENSAJE DE TEXTO
    // ==========================================

    if (messageType === "text") {
      const text = message.text?.body;

      console.log("💬 Mensaje:", text);

      if (!text) {
        console.log("ℹ️ Mensaje de texto vacío");
        return res.sendStatus(200);
      }

      // ==========================================
      // 5. ANALIZAR MENSAJE CON GEMINI
      // ==========================================

      const analisis = await analizarMensaje(text);

      console.log("🤖 Análisis de IA:");
      console.dir(analisis, { depth: null });

      // ==========================================
      // 6. COMPROBAR SI ES UNA TRANSACCIÓN
      // ==========================================

      if (
        (analisis.tipo === "gasto" ||
          analisis.tipo === "ingreso") &&
        analisis.monto !== null &&
        analisis.monto > 0
      ) {
        // Convertimos nuestro tipo en el enum
        // utilizado por Supabase.
        const tipoTransaccion =
          analisis.tipo === "gasto"
            ? "expense"
            : "income";

        // ==========================================
        // 7. CREAR TRANSACCIÓN
        // ==========================================

        const transaccion = await crearTransaccion({
          userId: usuario.id,
          accountId: cuenta.id,
          tipo: tipoTransaccion,
          monto: analisis.monto,
          categoria: analisis.categoria,
          descripcion: analisis.descripcion,
        });

        console.log("💸 Transacción creada:");
        console.dir(transaccion, { depth: null });

        // ==========================================
        // 8. OBTENER SALDO ACTUALIZADO
        // ==========================================

        const { data: cuentaActualizada, error: cuentaError } =
          await supabase
            .from("accounts")
            .select("current_balance")
            .eq("id", cuenta.id)
            .single();

        if (cuentaError) {
          throw cuentaError;
        }

        // ==========================================
        // 9. OBTENER NOMBRE REAL DE LA CATEGORÍA
        // ==========================================

        let nombreCategoria = analisis.categoria || "Otros";

        if (transaccion.category_id) {
          const { data: categoria } = await supabase
            .from("categories")
            .select("name")
            .eq("id", transaccion.category_id)
            .single();

          if (categoria?.name) {
            nombreCategoria = categoria.name;
          }
        }

        // ==========================================
        // 10. CREAR RESPUESTA PARA WHATSAPP
        // ==========================================

        const saldo = Number(
          cuentaActualizada.current_balance
        );

        const monto = Number(analisis.monto);

        let respuesta = "";

        if (tipoTransaccion === "expense") {
          respuesta =
            `✅ Gasto registrado\n\n` +
            `💵 $${monto.toFixed(2)}\n` +
            `🏷️ ${nombreCategoria}\n` +
            `💳 ${cuenta.name}\n` +
            `📊 Saldo actual: $${saldo.toFixed(2)}`;
        } else {
          respuesta =
            `✅ Ingreso registrado\n\n` +
            `💵 $${monto.toFixed(2)}\n` +
            `🏷️ ${nombreCategoria}\n` +
            `💳 ${cuenta.name}\n` +
            `📊 Saldo actual: $${saldo.toFixed(2)}`;
        }

        // ==========================================
        // 11. RESPONDER POR WHATSAPP
        // ==========================================

        await enviarMensajeWhatsApp(
          from,
          respuesta
        );

        console.log("📤 Respuesta enviada al usuario");
      } else {
        // ==========================================
        // MENSAJE SIN TRANSACCIÓN
        // ==========================================

        console.log(
          "ℹ️ El mensaje no corresponde a una transacción."
        );

        // Por ahora no respondemos automáticamente
        // a consultas u otros mensajes.
      }
    } else {
      console.log(
        `ℹ️ Tipo de mensaje no procesado: ${messageType}`
      );
    }

    console.log("===================================");

    return res.sendStatus(200);

  } catch (error: any) {
    console.error(
      "❌ Error procesando webhook:",
      error?.response?.data || error
    );

    console.log("===================================");

    return res.sendStatus(500);
  }
});

export default router;