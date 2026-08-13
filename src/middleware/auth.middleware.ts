import { NextFunction, Request, Response } from "express";
import { supabase } from "../config/supabase";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return res.status(401).json({ error: "Se requiere un token de acceso." });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Token de acceso inválido." });
  }

  req.userId = data.user.id;
  return next();
}
