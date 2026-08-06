import { Router } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.get("/health", async (_, res) => {
  try {
    const { data, error } = await supabase
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
  } catch (err) {
    return res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;