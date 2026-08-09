import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { analizarMensaje } from "../services/openai.service";
import { obtenerOCrearUsuario } from "../services/user.service";
import { obtenerOCrearCuentaPrincipal } from "../services/account.service";

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
 * Recepción de mensajes
 */
router.post("/webhook", async (req: Request, res: Response) => {
  console.log("========== NUEVO MENSAJE ==========");

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];

    // Si el evento no contiene un mensaje, lo ignoramos
    if (!message) {
      console.log("ℹ️ Evento recibido sin mensaje");
      return res.sendStatus(200);
    }

    const from = message.from;
    const messageType = message.type;

    console.log("📱 Remitente:", from);
    console.log("📦 Tipo:", messageType);

    const usuario = await obtenerOCrearUsuario(from);

    console.log("👤 Usuario:", usuario);

    const cuenta = await obtenerOCrearCuentaPrincipal(usuario.id);

    console.log("💰 Cuenta:", cuenta);

    // Mensaje de texto
    if (messageType === "text") {
      const text = message.text?.body;

      console.log("💬 Mensaje:", text);

      if (text) {
        const analisis = await analizarMensaje(text);

        console.log("🤖 Análisis de OpenAI:");
        console.log(analisis);
      }
    }

    console.log("===================================");

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error procesando webhook:", error);

    return res.sendStatus(500);
  }
});

export default router;