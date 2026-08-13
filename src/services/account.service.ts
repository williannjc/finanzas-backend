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
export async function transferirEntreCuentas(
  userId: string,
  cuentaOrigenNombre: string,
  cuentaDestinoNombre: string,
  monto: number
) {
  const origenNombre = cuentaOrigenNombre.trim();
  const destinoNombre = cuentaDestinoNombre.trim();

  if (!origenNombre || !destinoNombre) {
    throw new Error(
      "La transferencia requiere cuenta de origen y cuenta de destino."
    );
  }

  if (origenNombre.toLowerCase() === destinoNombre.toLowerCase()) {
    throw new Error(
      "La cuenta de origen y destino no pueden ser la misma."
    );
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error(
      "El monto de la transferencia no es válido."
    );
  }

  // ============================================================
  // BUSCAR CUENTA DE ORIGEN
  // ============================================================

  const { data: cuentaOrigen, error: origenError } =
    await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .ilike("name", origenNombre)
      .maybeSingle();

  if (origenError) {
    throw origenError;
  }

  if (!cuentaOrigen) {
    throw new Error(
      `No encontré la cuenta de origen "${origenNombre}".`
    );
  }

  // ============================================================
  // BUSCAR CUENTA DE DESTINO
  // ============================================================

  const { data: cuentaDestino, error: destinoError } =
    await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .ilike("name", destinoNombre)
      .maybeSingle();

  if (destinoError) {
    throw destinoError;
  }

  if (!cuentaDestino) {
    throw new Error(
      `No encontré la cuenta de destino "${destinoNombre}".`
    );
  }

  // ============================================================
  // EJECUTAR TRANSFERENCIA ATÓMICA EN SUPABASE
  // ============================================================

  const { data, error } = await supabase.rpc(
    "transfer_between_accounts",
    {
      p_user_id: userId,
      p_source_account_id: cuentaOrigen.id,
      p_destination_account_id: cuentaDestino.id,
      p_amount: monto,
      p_description: `Transferencia de ${cuentaOrigen.name} a ${cuentaDestino.name}`,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "La transferencia no produjo ningún resultado."
    );
  }

  const resultado = data[0];

  console.log("✅ Transferencia realizada");
  console.log(
    `💸 ${cuentaOrigen.name} → ${cuentaDestino.name}`
  );
  console.log(`💵 Monto: $${Number(resultado.amount).toFixed(2)}`);
  console.log(
    `💰 Saldo origen: $${Number(resultado.source_balance).toFixed(2)}`
  );
  console.log(
    `💰 Saldo destino: $${Number(resultado.destination_balance).toFixed(2)}`
  );

  return {
    transferId: resultado.transfer_id,
    monto: Number(resultado.amount),
    cuentaOrigen: {
      ...cuentaOrigen,
      current_balance: Number(resultado.source_balance),
    },
    cuentaDestino: {
      ...cuentaDestino,
      current_balance: Number(resultado.destination_balance),
    },
  };
}