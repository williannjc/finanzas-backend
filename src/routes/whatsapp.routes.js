"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
/**
 * Verificación del webhook (Meta)
 */
router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" &&
        token === env_1.env.WHATSAPP_VERIFY_TOKEN) {
        console.log("✅ Webhook verificado por Meta");
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});
/**
 * Recepción de mensajes
 */
router.post("/webhook", async (req, res) => {
    console.log("========== NUEVO MENSAJE ==========");
    console.dir(req.body, { depth: null });
    console.log("===================================");
    return res.sendStatus(200);
});
exports.default = router;
//# sourceMappingURL=whatsapp.routes.js.map