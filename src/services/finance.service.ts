import { supabase } from "../config/supabase";

interface Periodo {
  inicio: string;
  fin: string;
}

/**
 * Obtiene los límites de un día en horario de Ecuador.
 *
 * Ecuador continental = UTC-5
 */
function obtenerDiaActual(): Periodo {
  const ahora = new Date();

  const fechaEcuador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);

  const inicio = `${fechaEcuador}T00:00:00-05:00`;
  const fin = `${fechaEcuador}T23:59:59.999-05:00`;

  return {
    inicio: new Date(inicio).toISOString(),
    fin: new Date(fin).toISOString(),
  };
}

/**
 * Obtiene los límites del mes actual en horario de Ecuador.
 */
function obtenerMesActual(): Periodo {
  const ahora = new Date();

  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(ahora);

  const year = partes.find((p) => p.type === "year")?.value;
  const month = partes.find((p) => p.type === "month")?.value;

  if (!year || !month) {
    throw new Error("No se pudo determinar la fecha actual.");
  }

  const siguienteMes =
    Number(month) === 12
      ? `${Number(year) + 1}-01`
      : `${year}-${String(Number(month) + 1).padStart(2, "0")}`;

  const inicio = `${year}-${month}-01T00:00:00-05:00`;
  const fin = `${siguienteMes}-01T00:00:00-05:00`;

  return {
    inicio: new Date(inicio).toISOString(),
    fin: new Date(fin).toISOString(),
  };
}

/**
 * Obtiene el saldo total de todas las cuentas activas.
 */
export async function obtenerSaldoTotal(userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, current_balance, currency")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const cuentas = data || [];

  const saldoTotal = cuentas.reduce(
    (total, cuenta) =>
      total + Number(cuenta.current_balance || 0),
    0
  );

  return {
    saldoTotal,
    cuentas,
  };
}

/**
 * Obtiene los gastos realizados hoy.
 */
export async function obtenerGastosDelDia(userId: string) {
  const periodo = obtenerDiaActual();

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      description,
      transaction_date,
      category_id,
      account_id
    `)
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("transaction_date", periodo.inicio)
    .lte("transaction_date", periodo.fin)
    .order("transaction_date", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  const transacciones = data || [];

  const total = transacciones.reduce(
    (sum, transaccion) =>
      sum + Number(transaccion.amount || 0),
    0
  );

  return {
    total,
    transacciones,
  };
}

/**
 * Obtiene los gastos del mes actual.
 */
export async function obtenerGastosDelMes(userId: string) {
  const periodo = obtenerMesActual();

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      description,
      transaction_date,
      category_id,
      account_id
    `)
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("transaction_date", periodo.inicio)
    .lt("transaction_date", periodo.fin)
    .order("transaction_date", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  const transacciones = data || [];

  const total = transacciones.reduce(
    (sum, transaccion) =>
      sum + Number(transaccion.amount || 0),
    0
  );

  return {
    total,
    transacciones,
  };
}

/**
 * Obtiene los ingresos del mes actual.
 */
export async function obtenerIngresosDelMes(userId: string) {
  const periodo = obtenerMesActual();

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      description,
      transaction_date,
      category_id,
      account_id
    `)
    .eq("user_id", userId)
    .eq("type", "income")
    .gte("transaction_date", periodo.inicio)
    .lt("transaction_date", periodo.fin)
    .order("transaction_date", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  const transacciones = data || [];

  const total = transacciones.reduce(
    (sum, transaccion) =>
      sum + Number(transaccion.amount || 0),
    0
  );

  return {
    total,
    transacciones,
  };
}

/**
 * Obtiene gastos agrupados por categoría
 * durante el mes actual.
 */
export async function obtenerGastosPorCategoria(
  userId: string
) {
  const periodo = obtenerMesActual();

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      category_id,
      categories (
        name
      )
    `)
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("transaction_date", periodo.inicio)
    .lt("transaction_date", periodo.fin);

  if (error) {
    throw error;
  }

  const transacciones = data || [];

  const categorias: Record<string, number> = {};

  for (const transaccion of transacciones) {
    const categoria =
      Array.isArray(transaccion.categories)
        ? transaccion.categories[0]
        : transaccion.categories;

    const nombre =
      categoria?.name || "Otros";

    if (!categorias[nombre]) {
      categorias[nombre] = 0;
    }

    categorias[nombre] += Number(
      transaccion.amount || 0
    );
  }

  return Object.entries(categorias)
    .map(([nombre, total]) => ({
      nombre,
      total,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Obtiene los gastos de una categoría
 * durante el mes actual.
 */
export async function obtenerGastosPorCategoriaNombre(
  userId: string,
  nombreCategoria: string
) {
  const periodo = obtenerMesActual();

  const { data: categoria, error: categoriaError } =
    await supabase
      .from("categories")
      .select("id, name")
      .eq("transaction_type", "expense")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .ilike("name", `%${nombreCategoria}%`)
      .limit(1)
      .maybeSingle();

  if (categoriaError) {
    throw categoriaError;
  }

  if (!categoria) {
    return {
      categoria: nombreCategoria,
      total: 0,
      transacciones: [],
    };
  }

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      description,
      transaction_date,
      category_id,
      account_id
    `)
    .eq("user_id", userId)
    .eq("type", "expense")
    .eq("category_id", categoria.id)
    .gte("transaction_date", periodo.inicio)
    .lt("transaction_date", periodo.fin)
    .order("transaction_date", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  const transacciones = data || [];

  const total = transacciones.reduce(
    (sum, transaccion) =>
      sum + Number(transaccion.amount || 0),
    0
  );

  return {
    categoria: categoria.name,
    total,
    transacciones,
  };
}

/**
 * Obtiene los últimos movimientos del usuario.
 */
export async function obtenerUltimasTransacciones(
  userId: string,
  limite: number = 5
) {
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      type,
      amount,
      description,
      transaction_date,
      category_id,
      account_id
    `)
    .eq("user_id", userId)
    .order("transaction_date", {
      ascending: false,
    })
    .limit(limite);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Obtiene un resumen financiero del mes actual.
 */
export async function obtenerResumenMensual(
  userId: string
) {
  const [ingresos, gastos, categorias] =
    await Promise.all([
      obtenerIngresosDelMes(userId),
      obtenerGastosDelMes(userId),
      obtenerGastosPorCategoria(userId),
    ]);

  const balance =
    ingresos.total - gastos.total;

  return {
    ingresos: ingresos.total,
    gastos: gastos.total,
    balance,
    categorias,
  };
}
