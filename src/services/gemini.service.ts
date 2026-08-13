import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export type IntencionConsulta =
  | "transaction"
  | "balance_query"
  | "daily_expense_query"
  | "monthly_expense_query"
  | "monthly_income_query"
  | "summary_query"
  | "recent_transactions_query"
  | "category_expense_query"
  | "other";

export interface AnalisisMensaje {
  // Se mantienen estos campos para compatibilidad con el flujo existente.
  tipo: "gasto" | "ingreso" | "consulta" | "otro";
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
  // Permite enrutar las consultas sin depender de coincidencias literales.
  intencion: IntencionConsulta;
}

const intencionesValidas: readonly IntencionConsulta[] = [
  "transaction",
  "balance_query",
  "daily_expense_query",
  "monthly_expense_query",
  "monthly_income_query",
  "summary_query",
  "recent_transactions_query",
  "category_expense_query",
  "other",
];

export async function analizarMensaje(mensaje: string): Promise<AnalisisMensaje> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no está configurada.");
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    // Se conserva el modelo ya utilizado por el proyecto para evitar un cambio de comportamiento.
    model: "gemini-3.5-flash-lite",
    config: { responseMimeType: "application/json" },
    contents: `Eres un asistente de control financiero para usuarios de Ecuador.
Devuelve únicamente un objeto JSON válido, sin Markdown, con esta estructura:
{
  "tipo": "gasto" | "ingreso" | "consulta" | "otro",
  "monto": number | null,
  "categoria": string | null,
  "descripcion": string | null,
  "intencion": "transaction" | "balance_query" | "daily_expense_query" | "monthly_expense_query" | "monthly_income_query" | "summary_query" | "recent_transactions_query" | "category_expense_query" | "other"
}
Usa transaction solo para un gasto o ingreso inequívoco con monto positivo. Si no hay monto, usa null.
Para consultas selecciona la intencion más específica. Para category_expense_query, incluye la categoría pedida.
No inventes montos, categorías ni movimientos. Para saludos u otros mensajes usa tipo e intencion other.

Mensaje del usuario: ${mensaje}`,
  });

  const texto = response.text?.trim();
  if (!texto) {
    throw new Error("Gemini no devolvió ningún resultado.");
  }

  try {
    const analisis = JSON.parse(texto) as AnalisisMensaje;
    validarAnalisis(analisis);
    return analisis;
  } catch (error) {
    console.error("Gemini devolvió un análisis inválido.", error);
    throw new Error("La respuesta de Gemini no es un JSON válido.");
  }
}

export function validarAnalisis(analisis: AnalisisMensaje): void {
  if (!["gasto", "ingreso", "consulta", "otro"].includes(analisis.tipo)) {
    throw new Error("Tipo de análisis inválido.");
  }
  if (!intencionesValidas.includes(analisis.intencion)) {
    throw new Error("Intención de análisis inválida.");
  }
  if (analisis.monto !== null && (!Number.isFinite(analisis.monto) || analisis.monto <= 0)) {
    throw new Error("El monto recibido no es válido.");
  }
  if (analisis.intencion === "transaction" &&
      (analisis.monto === null || !["gasto", "ingreso"].includes(analisis.tipo))) {
    throw new Error("Una transacción requiere tipo y monto positivo.");
  }
}
