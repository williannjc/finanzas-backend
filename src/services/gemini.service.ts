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
  | "create_account"
  | "transfer"
  | "other";

export interface AnalisisMensaje {
  tipo: "gasto" | "ingreso" | "consulta" | "otro";
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
  intencion: IntencionConsulta;

  // Datos para creación de cuentas
  nombreCuenta?: string | null;
  tipoCuenta?:
    | "bank"
    | "credit"
    | "cash"
    | "investment"
    | "cooperative"
    | "other"
    | null;

  // Datos para transferencias
  cuentaOrigen?: string | null;
  cuentaDestino?: string | null;
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
  "create_account",
  "transfer",
  "other",
];

export async function analizarMensaje(
  mensaje: string
): Promise<AnalisisMensaje> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no está configurada.");
  }

  const ai = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
  });

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    config: {
      responseMimeType: "application/json",
    },
    contents: `Eres un asistente de control financiero para usuarios de Ecuador.

Devuelve únicamente un objeto JSON válido, sin Markdown, con esta estructura:

{
  "tipo": "gasto" | "ingreso" | "consulta" | "otro",
  "monto": number | null,
  "categoria": string | null,
  "descripcion": string | null,
  "intencion": "transaction" | "balance_query" | "daily_expense_query" | "monthly_expense_query" | "monthly_income_query" | "summary_query" | "recent_transactions_query" | "category_expense_query" | "create_account" | "transfer" | "other",
  "nombreCuenta": string | null,
  "tipoCuenta": "bank" | "credit" | "cash" | "investment" | "cooperative" | "other" | null,
  "cuentaOrigen": string | null,
  "cuentaDestino": string | null
}

REGLAS:

1. Usa "transaction" únicamente para un gasto o ingreso inequívoco con monto positivo.

2. Si no hay monto, usa null.

3. Para consultas selecciona la intención más específica.

4. Para category_expense_query, incluye la categoría pedida.

5. Para crear una cuenta usa "create_account".

6. Si el usuario quiere crear una cuenta, extrae el nombre exacto de la cuenta en "nombreCuenta".

7. Determina el tipo de cuenta:
   - banco, cuenta bancaria, cuenta corriente, cuenta de ahorros → "bank"
   - tarjeta de crédito → "credit"
   - efectivo → "cash"
   - inversión, cuenta de inversión → "investment"
   - cooperativa → "cooperative"
   - si no se puede determinar → "other"

8. Para transferencias entre cuentas usa SIEMPRE "transfer".

9. Una transferencia ocurre cuando el usuario indica que quiere mover dinero de una cuenta a otra.

10. En una transferencia:
   - "monto" debe contener el monto positivo transferido.
   - "cuentaOrigen" debe contener el nombre de la cuenta desde donde sale el dinero.
   - "cuentaDestino" debe contener el nombre de la cuenta a donde llega el dinero.
   - "categoria" debe ser "transferencia".
   - "tipo" debe ser "otro".
   - "descripcion" debe conservar una descripción natural de la operación.

11. No confundas una transferencia con un gasto.

12. Ejemplos de transferencias:

"transferí 20 dólares de efectivo a Banco Pichincha"

→ {
  "tipo": "otro",
  "monto": 20,
  "categoria": "transferencia",
  "descripcion": "transferí 20 dólares de efectivo a Banco Pichincha",
  "intencion": "transfer",
  "nombreCuenta": null,
  "tipoCuenta": null,
  "cuentaOrigen": "Efectivo",
  "cuentaDestino": "Banco Pichincha"
}

"pasa $50 de Banco Pichincha a efectivo"

→ {
  "tipo": "otro",
  "monto": 50,
  "categoria": "transferencia",
  "descripcion": "pasa $50 de Banco Pichincha a efectivo",
  "intencion": "transfer",
  "nombreCuenta": null,
  "tipoCuenta": null,
  "cuentaOrigen": "Banco Pichincha",
  "cuentaDestino": "Efectivo"
}

"transfiere 100 de mi cuenta del Banco Guayaquil a Banco Pichincha"

→ {
  "tipo": "otro",
  "monto": 100,
  "categoria": "transferencia",
  "descripcion": "transfiere 100 de mi cuenta del Banco Guayaquil a Banco Pichincha",
  "intencion": "transfer",
  "nombreCuenta": null,
  "tipoCuenta": null,
  "cuentaOrigen": "Banco Guayaquil",
  "cuentaDestino": "Banco Pichincha"
}

13. Para crear una cuenta:

"crea una cuenta bancaria llamada Banco Pichincha"

→ intencion: "create_account"
→ nombreCuenta: "Banco Pichincha"
→ tipoCuenta: "bank"

14. No inventes nombres de cuentas.

15. Para saludos u otros mensajes usa tipo "otro" e intencion "other".

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
    console.error(
      "Gemini devolvió un análisis inválido.",
      error
    );

    throw new Error(
      "La respuesta de Gemini no es un JSON válido."
    );
  }
}

export function validarAnalisis(
  analisis: AnalisisMensaje
): void {
  if (
    !["gasto", "ingreso", "consulta", "otro"].includes(
      analisis.tipo
    )
  ) {
    throw new Error("Tipo de análisis inválido.");
  }

  if (
    !intencionesValidas.includes(
      analisis.intencion
    )
  ) {
    throw new Error(
      "Intención de análisis inválida."
    );
  }

  if (
    analisis.monto !== null &&
    (!Number.isFinite(analisis.monto) ||
      analisis.monto <= 0)
  ) {
    throw new Error(
      "El monto recibido no es válido."
    );
  }

  if (
    analisis.intencion === "transaction" &&
    (
      analisis.monto === null ||
      !["gasto", "ingreso"].includes(
        analisis.tipo
      )
    )
  ) {
    throw new Error(
      "Una transacción requiere tipo y monto positivo."
    );
  }

  if (
    analisis.intencion === "create_account" &&
    !analisis.nombreCuenta?.trim()
  ) {
    throw new Error(
      "Crear una cuenta requiere un nombre."
    );
  }

  if (
    analisis.intencion === "transfer"
  ) {
    if (
      analisis.monto === null ||
      !Number.isFinite(analisis.monto) ||
      analisis.monto <= 0
    ) {
      throw new Error(
        "Una transferencia requiere un monto positivo."
      );
    }

    if (!analisis.cuentaOrigen?.trim()) {
      throw new Error(
        "Una transferencia requiere una cuenta de origen."
      );
    }

    if (!analisis.cuentaDestino?.trim()) {
      throw new Error(
        "Una transferencia requiere una cuenta de destino."
      );
    }
  }
}