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