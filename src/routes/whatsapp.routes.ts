import { Router, Request, Response } from "express";
import { env } from "../config/env";

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
  console.dir(req.body, { depth: null });
  console.log("===================================");

  return res.sendStatus(200);
});

export default router;