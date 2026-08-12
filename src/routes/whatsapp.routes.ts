import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { supabase } from "../config/supabase";

import { analizarMensaje } from "../services/openai.service";
import { obtenerOCrearUsuario } from "../services/user.service";
import { obtenerOCrearCuentaPrincipal } from "../services/account.service";
import { crearTransaccion } from "../services/transaction.service";
import { enviarMensajeWhatsApp } from "../services/whatsapp.service";

import {
  obtenerSaldoTotal,
  obtenerGastosDelDia,
  obtenerGastosDelMes,
  obtenerIngresosDelMes,
  obtenerGastosPorCategoriaNombre,
  obtenerUltimasTransacciones,
  obtenerResumenMensual,
} from "../services/finance.service";

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
      // 7. PROCESAR SOLO MENSAJES DE TEXTO
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
      // 9. CONSULTAS FINANCIERAS
      // ========================================================

      if (analisis.tipo === "consulta") {
        console.log("🔎 Consulta financiera detectada");

        const consultaTexto = (
          analisis.descripcion ||
          text ||
          ""
        ).toLowerCase().trim();

        console.log(
          "🧠 Texto de consulta:",
          consultaTexto
        );

        // ========================================================
        // 9.1 SALDO ACTUAL
        // ========================================================

        if (
          consultaTexto.includes("cuánto tengo") ||
          consultaTexto.includes("cuanto tengo") ||
          consultaTexto.includes("mi saldo") ||
          consultaTexto.includes("saldo actual") ||
          consultaTexto.includes("cuánto dinero tengo") ||
          consultaTexto.includes("cuanto dinero tengo")
        ) {
          const resultado =
            await obtenerSaldoTotal(usuario.id);

          const saldo = Number(
            resultado.saldoTotal
          );

          let respuesta =
            `💰 *Tu saldo actual*\n\n` +
            `💵 $${saldo.toFixed(2)}\n\n`;

          if (resultado.cuentas.length > 0) {
            respuesta += `💳 *Cuentas*\n`;

            for (const cuentaActual of resultado.cuentas) {
              respuesta +=
                `• ${cuentaActual.name}: $${Number(
                  cuentaActual.current_balance || 0
                ).toFixed(2)}\n`;
            }
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de saldo enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.2 GASTOS DE HOY
        // ========================================================

        if (
          consultaTexto.includes("gastado hoy") ||
          consultaTexto.includes("gastos de hoy") ||
          consultaTexto.includes("gaste hoy") ||
          consultaTexto.includes("gastos hoy")
        ) {
          const resultado =
            await obtenerGastosDelDia(
              usuario.id
            );

          const total = Number(
            resultado.total
          );

          let respuesta =
            `📅 *Gastos de hoy*\n\n` +
            `💸 Total gastado: $${total.toFixed(2)}\n`;

          if (resultado.transacciones.length > 0) {
            respuesta += `\n🧾 *Movimientos*\n`;

            for (const transaccion of resultado.transacciones) {
              respuesta +=
                `• $${Number(
                  transaccion.amount
                ).toFixed(2)} — ${
                  transaccion.description || "Sin descripción"
                }\n`;
            }
          } else {
            respuesta +=
              `\n✨ No tienes gastos registrados hoy`;
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de gastos del día enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.3 GASTOS DEL MES
        // ========================================================

        if (
          consultaTexto.includes("gastado este mes") ||
          consultaTexto.includes("gastos de este mes") ||
          consultaTexto.includes("gastos este mes") ||
          consultaTexto.includes("gaste este mes")
        ) {
          const resultado =
            await obtenerGastosDelMes(
              usuario.id
            );

          const total = Number(
            resultado.total
          );

          let respuesta =
            `📅 *Gastos de este mes*\n\n` +
            `💸 Total gastado: $${total.toFixed(2)}\n`;

          if (resultado.transacciones.length > 0) {
            respuesta +=
              `\n🧾 Movimientos registrados: ` +
              `${resultado.transacciones.length}`;
          } else {
            respuesta +=
              `\n✨ No tienes gastos registrados este mes`;
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de gastos del mes enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.4 INGRESOS DEL MES
        // ========================================================

        if (
          consultaTexto.includes("recibido este mes") ||
          consultaTexto.includes("recibí este mes") ||
          consultaTexto.includes("recibi este mes") ||
          consultaTexto.includes("ingresos del mes") ||
          consultaTexto.includes("ingresos este mes") ||
          consultaTexto.includes("ganado este mes")
        ) {
          const resultado =
            await obtenerIngresosDelMes(
              usuario.id
            );

          const total = Number(
            resultado.total
          );

          let respuesta =
            `📈 *Ingresos de este mes*\n\n` +
            `💵 Total recibido: $${total.toFixed(2)}\n`;

          if (resultado.transacciones.length > 0) {
            respuesta +=
              `\n🧾 Movimientos registrados: ` +
              `${resultado.transacciones.length}`;
          } else {
            respuesta +=
              `\n✨ No tienes ingresos registrados este mes`;
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de ingresos del mes enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.5 RESUMEN FINANCIERO
        // ========================================================

        if (
          consultaTexto.includes("resumen") ||
          consultaTexto.includes("resumen de mis finanzas") ||
          consultaTexto.includes("resumen financiero")
        ) {
          const resultado =
            await obtenerResumenMensual(
              usuario.id
            );

          const ingresos = Number(
            resultado.ingresos
          );

          const gastos = Number(
            resultado.gastos
          );

          const balance = Number(
            resultado.balance
          );

          let respuesta =
            `📊 *Resumen financiero del mes*\n\n` +
            `📈 Ingresos: $${ingresos.toFixed(2)}\n` +
            `📉 Gastos: $${gastos.toFixed(2)}\n` +
            `💰 Balance: $${balance.toFixed(2)}\n`;

          if (
            resultado.categorias.length > 0
          ) {
            respuesta +=
              `\n🏷️ *Gastos por categoría*\n`;

            for (
              const categoria
              of resultado.categorias
            ) {
              respuesta +=
                `• ${categoria.nombre}: $${Number(
                  categoria.total
                ).toFixed(2)}\n`;
            }
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de resumen enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.6 ÚLTIMOS MOVIMIENTOS
        // ========================================================

        if (
          consultaTexto.includes("últimos movimientos") ||
          consultaTexto.includes("ultimos movimientos") ||
          consultaTexto.includes("últimos movimientos") ||
          consultaTexto.includes("movimientos recientes") ||
          consultaTexto.includes("últimas transacciones") ||
          consultaTexto.includes("ultimas transacciones")
        ) {
          const transacciones =
            await obtenerUltimasTransacciones(
              usuario.id,
              5
            );

          let respuesta =
            `🧾 *Últimos movimientos*\n\n`;

          if (transacciones.length === 0) {
            respuesta +=
              `No tienes movimientos registrados.`;
          } else {
            for (
              const transaccion
              of transacciones
            ) {
              const simbolo =
                transaccion.type === "income"
                  ? "📈"
                  : "📉";

              const tipo =
                transaccion.type === "income"
                  ? "Ingreso"
                  : "Gasto";

              respuesta +=
                `${simbolo} *${tipo}* — $${Number(
                  transaccion.amount
                ).toFixed(2)}\n`;

              respuesta +=
                `   ${transaccion.description || "Sin descripción"}\n\n`;
            }
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de últimos movimientos enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.7 GASTOS POR CATEGORÍA
        // ========================================================

        if (analisis.categoria) {
          console.log(
            "🏷️ Consulta por categoría:",
            analisis.categoria
          );

          const resultado =
            await obtenerGastosPorCategoriaNombre(
              usuario.id,
              analisis.categoria
            );

          const total = Number(
            resultado.total
          );

          let respuesta =
            `🏷️ *Gastos en ${resultado.categoria}*\n\n` +
            `💸 Total este mes: $${total.toFixed(2)}\n`;

          if (
            resultado.transacciones.length > 0
          ) {
            respuesta +=
              `\n🧾 *Movimientos*\n`;

            for (
              const transaccion
              of resultado.transacciones
            ) {
              respuesta +=
                `• $${Number(
                  transaccion.amount
                ).toFixed(2)} — ${
                  transaccion.description ||
                  "Sin descripción"
                }\n`;
            }
          } else {
            respuesta +=
              `\n✨ No tienes gastos registrados en esta categoría este mes`;
          }

          await enviarMensajeWhatsApp(
            from,
            respuesta
          );

          console.log(
            "📤 Respuesta de categoría enviada"
          );

          console.log(
            "==================================="
          );

          return res.sendStatus(200);
        }

        // ========================================================
        // 9.8 CONSULTA NO RECONOCIDA
        // ========================================================

        console.log(
          "⚠️ Consulta financiera no reconocida"
        );

        const respuesta =
          `🤔 No estoy seguro de qué consulta quieres hacer.\n\n` +
          `Puedes preguntarme por ejemplo:\n` +
          `• cuánto tengo\n` +
          `• cuánto he gastado hoy\n` +
          `• cuánto he gastado este mes\n` +
          `• cuánto he recibido este mes\n` +
          `• dame un resumen de mis finanzas\n` +
          `• cuáles son mis últimos movimientos\n` +
          `• cuánto he gastado en transporte`;

        await enviarMensajeWhatsApp(
          from,
          respuesta
        );

        console.log(
          "📤 Ayuda de consultas enviada"
        );

        console.log(
          "==================================="
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // 10. VALIDAR SI ES UNA TRANSACCIÓN
      // ========================================================

      const esGasto =
        analisis.tipo === "gasto";

      const esIngreso =
        analisis.tipo === "ingreso";

      /**
       * Si no es gasto, ingreso ni consulta,
       * simplemente ignoramos el mensaje.
       */
      if (!esGasto && !esIngreso) {
        console.log(
          "ℹ️ El mensaje no corresponde a una transacción ni consulta."
        );

        console.log(
          "==================================="
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // 11. VALIDAR MONTO
      // ========================================================

      const monto = analisis.monto;

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
      // 12. CONVERTIR TIPO GEMINI -> ENUM SUPABASE
      // ========================================================

      const tipoTransaccion:
        | "expense"
        | "income" =
        esGasto
          ? "expense"
          : "income";

      // ========================================================
      // 13. CREAR TRANSACCIÓN
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
      // 14. OBTENER SALDO ACTUALIZADO
      // ========================================================

      const {
        data: cuentaActualizada,
        error: cuentaError,
      } = await supabase
        .from("accounts")
        .select("current_balance")
        .eq("id", cuenta.id)
        .single();

      if (cuentaError) {
        throw cuentaError;
      }

      // ========================================================
      // 15. OBTENER NOMBRE REAL DE LA CATEGORÍA
      // ========================================================

      let nombreCategoria =
        analisis.categoria ||
        "Otros";

      if (
        transaccion.category_id
      ) {
        const {
          data: categoria,
          error: categoriaError,
        } = await supabase
          .from("categories")
          .select("name")
          .eq(
            "id",
            transaccion.category_id
          )
          .single();

        if (categoriaError) {
          console.log(
            "⚠️ No se pudo obtener el nombre de la categoría:",
            categoriaError.message
          );
        }

        if (categoria?.name) {
          nombreCategoria =
            categoria.name;
        }
      }

      // ========================================================
      // 16. SALDO Y MONTO
      // ========================================================

      const saldo =
        Number(
          cuentaActualizada.current_balance
        );

      const montoFinal =
        Number(monto);

      // ========================================================
      // 17. CREAR RESPUESTA PARA WHATSAPP
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
      // 18. ENVIAR RESPUESTA POR WHATSAPP
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