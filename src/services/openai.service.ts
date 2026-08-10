import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export interface AnalisisMensaje {
  tipo: "gasto" | "ingreso" | "consulta" | "otro";
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
}

export async function analizarMensaje(
  mensaje: string
): Promise<AnalisisMensaje> {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: `
Eres un asistente de control financiero.

Analiza el mensaje del usuario y determina si contiene un movimiento financiero.

Devuelve únicamente un objeto JSON válido.

ESTRUCTURA:

{
  "tipo": "gasto" | "ingreso" | "consulta" | "otro",
  "monto": number | null,
  "categoria": string | null,
  "descripcion": string | null
}

REGLAS:

- Si menciona dinero gastado, es "gasto".
- Si menciona dinero recibido, cobrado o ganado, es "ingreso".
- Si pregunta algo sobre sus finanzas sin registrar un movimiento, es "consulta".
- Si no corresponde a ninguna de esas categorías, es "otro".
- Si no puedes determinar el monto, usa null.
- No inventes información.
- No utilices bloques Markdown.
- No escribas \`\`\`json.
- No agregues explicaciones.
- Devuelve solamente el objeto JSON.

Mensaje del usuario:
${mensaje}
`,
  });

  const texto = response.text;

  if (!texto) {
    throw new Error("Gemini no devolvió ningún resultado.");
  }

  // ==========================================
  // LIMPIAR RESPUESTA DE GEMINI
  // ==========================================

  let textoLimpio = texto.trim();

  // Eliminar bloques Markdown si Gemini los agrega
  if (textoLimpio.startsWith("```")) {
    textoLimpio = textoLimpio
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  try {
    const analisis = JSON.parse(
      textoLimpio
    ) as AnalisisMensaje;

    // ==========================================
    // VALIDAR ESTRUCTURA
    // ==========================================

    const tiposValidos = [
      "gasto",
      "ingreso",
      "consulta",
      "otro",
    ];

    if (!tiposValidos.includes(analisis.tipo)) {
      throw new Error(
        `Tipo de análisis inválido: ${analisis.tipo}`
      );
    }

    if (
      analisis.monto !== null &&
      typeof analisis.monto !== "number"
    ) {
      throw new Error(
        "El monto recibido no es un número válido."
      );
    }

    if (
      analisis.categoria !== null &&
      typeof analisis.categoria !== "string"
    ) {
      throw new Error(
        "La categoría recibida no es válida."
      );
    }

    if (
      analisis.descripcion !== null &&
      typeof analisis.descripcion !== "string"
    ) {
      throw new Error(
        "La descripción recibida no es válida."
      );
    }

    return analisis;

  } catch (error) {
    console.error(
      "❌ Gemini devolvió un JSON inválido:"
    );

    console.error(texto);

    throw new Error(
      "La respuesta de Gemini no es un JSON válido."
    );
  }
}