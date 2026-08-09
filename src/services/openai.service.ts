import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export async function analizarMensaje(mensaje: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: `
Eres un asistente de control financiero.

Analiza el mensaje del usuario y determina si contiene un movimiento financiero.

Devuelve únicamente JSON válido con esta estructura:

{
  "tipo": "gasto" | "ingreso" | "consulta" | "otro",
  "monto": number | null,
  "categoria": string | null,
  "descripcion": string | null
}

Reglas:
- Si menciona dinero gastado, es "gasto".
- Si menciona dinero recibido, cobrado o ganado, es "ingreso".
- Si pregunta algo sobre sus finanzas sin registrar un movimiento, es "consulta".
- Si no corresponde a ninguna de esas categorías, es "otro".
- Si no puedes determinar el monto, usa null.
- No inventes información.

Mensaje del usuario:
${mensaje}
`,
  });

  return response.text;
}