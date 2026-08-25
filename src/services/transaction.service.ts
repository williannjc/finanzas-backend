import { supabase } from "../config/supabase";
import { obtenerCategoria } from "./category.service";

interface CrearTransaccionParams {
  userId: string;
  accountId: string;
  tipo: "income" | "expense";
  monto: number;
  categoria: string | null;
  descripcion: string | null;
  sourceMessageId?: string | null;
}

export async function crearTransaccion(
  params: CrearTransaccionParams
) {
  const {
    userId,
    accountId,
    tipo,
    monto,
    categoria,
    descripcion,
    sourceMessageId,
  } = params;

  let categoryId: string | null = null;

  if (categoria) {
    const category = await obtenerCategoria(
      userId,
      categoria,
      tipo
    );

    if (category) {
      categoryId = category.id;
    }
  }

  const { data: transaction, error } =
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        account_id: accountId,
        category_id: categoryId,
        type: tipo,
        amount: monto,
        description: descripcion,
        source_message_id: sourceMessageId ?? null,
      })
      .select()
      .single();

  if (error) {
    // ============================================================
    // IDEMPOTENCIA
    // ============================================================
    // Si el mismo mensaje de WhatsApp ya creó una transacción,
    // PostgreSQL rechazará el INSERT por la restricción UNIQUE
    // de source_message_id.
    //
    // En lugar de crear otra transacción, recuperamos la existente.
    // ============================================================

    if (
      error.code === "23505" &&
      sourceMessageId
    ) {
      const {
        data: existingTransaction,
        error: existingError,
      } = await supabase
        .from("transactions")
        .select("*")
        .eq("source_message_id", sourceMessageId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingTransaction) {
        console.log(
          "🔁 Transacción existente recuperada por source_message_id"
        );

        return existingTransaction;
      }
    }

    throw error;
  }

  return transaction;
}