import { supabase } from "../config/supabase";
import { obtenerCategoria } from "./category.service";

interface CrearTransaccionParams {
  userId: string;
  accountId: string;
  tipo: "income" | "expense";
  monto: number;
  categoria: string | null;
  descripcion: string | null;
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
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return transaction;
}
