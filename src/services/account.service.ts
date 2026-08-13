import { supabase } from "../config/supabase";

export async function obtenerOCrearCuentaPrincipal(
  userId: string
) {
  // Buscar cuentas activas del usuario
  const { data: existingAccounts, error: accountsError } =
    await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

  if (accountsError) {
    throw accountsError;
  }

  // Si ya tiene una cuenta, utilizar la primera
  if (existingAccounts && existingAccounts.length > 0) {
    console.log("💰 Cuenta existente encontrada");

    return existingAccounts[0];
  }

  // Si no tiene ninguna, crear Efectivo
  console.log("💰 Creando cuenta principal: Efectivo");

  const { data: newAccount, error: newAccountError } =
    await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: "Efectivo",
        type: "cash",
        currency: "USD",
        initial_balance: 0,
        current_balance: 0,
        is_active: true,
      })
      .select()
      .single();

  if (newAccountError) {
    throw newAccountError;
  }

  console.log("✅ Cuenta Efectivo creada");

  return newAccount;
}

export async function crearCuenta(
  userId: string,
  nombre: string,
  tipo:
    | "bank"
    | "credit"
    | "cash"
    | "investment"
    | "cooperative"
    | "other"
) {
  const nombreNormalizado = nombre.trim();

  if (!nombreNormalizado) {
    throw new Error(
      "El nombre de la cuenta es obligatorio."
    );
  }

  // Evitar crear dos cuentas activas con el mismo nombre
  const { data: cuentaExistente, error: buscarError } =
    await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .ilike("name", nombreNormalizado)
      .maybeSingle();

  if (buscarError) {
    throw buscarError;
  }

  if (cuentaExistente) {
    return {
      creada: false,
      cuenta: cuentaExistente,
    };
  }

  const { data: nuevaCuenta, error } =
    await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: nombreNormalizado,
        type: tipo,
        currency: "USD",
        initial_balance: 0,
        current_balance: 0,
        is_active: true,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    creada: true,
    cuenta: nuevaCuenta,
  };
}