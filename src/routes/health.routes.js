"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const router = (0, express_1.Router)();
router.get("/health", async (_, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .select("id")
            .limit(1);
        if (error) {
            return res.status(500).json({
                status: "error",
                error: error.message,
            });
        }
        return res.json({
            status: "ok",
            database: "connected",
            data,
        });
    }
    catch (err) {
        return res.status(500).json({
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
        });
    }
});
exports.default = router;
//# sourceMappingURL=health.routes.js.map