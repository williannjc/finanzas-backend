import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware";
import { supabase } from "../config/supabase";
import {
  obtenerGastosDelMes,
  obtenerGastosPorCategoria,
  obtenerIngresosDelMes,
  obtenerResumenMensual,
  obtenerSaldoTotal,
  obtenerUltimasTransacciones,
} from "../services/finance.service";
import { crearTransaccion } from "../services/transaction.service";

const router = Router();
router.use(requireAuth);

router.get("/dashboard", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const [saldo, resumen, ultimosMovimientos] = await Promise.all([
      obtenerSaldoTotal(userId),
      obtenerResumenMensual(userId),
      obtenerUltimasTransacciones(userId, 10),
    ]);

    return res.json({
      totalBalance: saldo.saldoTotal,
      accounts: saldo.cuentas,
      monthlyIncome: resumen.ingresos,
      monthlyExpenses: resumen.gastos,
      monthlyBalance: resumen.balance,
      expensesByCategory: resumen.categorias,
      recentTransactions: ultimosMovimientos,
    });
  } catch (error) {
    console.error("Error obteniendo dashboard financiero:", error);
    return res.status(500).json({ error: "No se pudo obtener el dashboard." });
  }
});

router.get("/transactions", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const { from, to, type, categoryId, accountId } = req.query;
    let query = supabase
      .from("transactions")
      .select("id, type, amount, description, notes, transaction_date, created_at, account_id, category_id")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false });

    if (typeof from === "string") query = query.gte("transaction_date", from);
    if (typeof to === "string") query = query.lte("transaction_date", to);
    if (type === "income" || type === "expense") query = query.eq("type", type);
    if (typeof categoryId === "string") query = query.eq("category_id", categoryId);
    if (typeof accountId === "string") query = query.eq("account_id", accountId);

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ data: data ?? [] });
  } catch (error) {
    console.error("Error listando transacciones:", error);
    return res.status(500).json({ error: "No se pudieron listar las transacciones." });
  }
});

router.post("/transactions", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const body = req.body as Record<string, unknown>;
    const amount = Number(body.amount);
    const type = body.type;
    const accountId = body.accountId;

    if (!Number.isFinite(amount) || amount <= 0 ||
        (type !== "income" && type !== "expense") || typeof accountId !== "string") {
      return res.status(400).json({ error: "amount, type y accountId son obligatorios y válidos." });
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return res.status(404).json({ error: "Cuenta no encontrada o inactiva." });

    const transaction = await crearTransaccion({
      userId,
      accountId,
      tipo: type,
      monto: amount,
      categoria: typeof body.category === "string" ? body.category : null,
      descripcion: typeof body.description === "string" ? body.description : null,
    });
    return res.status(201).json({ data: transaction });
  } catch (error) {
    console.error("Error creando transacción:", error);
    return res.status(500).json({ error: "No se pudo crear la transacción." });
  }
});

router.delete("/transactions/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId!);
    if (error) throw error;
    // El trigger existente en Supabase conserva current_balance consistente.
    return res.sendStatus(204);
  } catch (error) {
    console.error("Error eliminando transacción:", error);
    return res.status(500).json({ error: "No se pudo eliminar la transacción." });
  }
});

router.patch("/transactions/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount debe ser un número positivo." });
      }
      update.amount = amount;
    }
    if (body.type !== undefined) {
      if (body.type !== "income" && body.type !== "expense") {
        return res.status(400).json({ error: "type debe ser income o expense." });
      }
      update.type = body.type;
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        return res.status(400).json({ error: "description debe ser texto o null." });
      }
      update.description = body.description;
    }
    if (body.transactionDate !== undefined) {
      if (typeof body.transactionDate !== "string" || Number.isNaN(Date.parse(body.transactionDate))) {
        return res.status(400).json({ error: "transactionDate debe ser una fecha ISO válida." });
      }
      update.transaction_date = body.transactionDate;
    }
    if (body.accountId !== undefined) {
      if (typeof body.accountId !== "string") return res.status(400).json({ error: "accountId no es válido." });
      const { data: account, error } = await supabase.from("accounts").select("id")
        .eq("id", body.accountId).eq("user_id", userId).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!account) return res.status(404).json({ error: "Cuenta no encontrada o inactiva." });
      update.account_id = account.id;
    }
    if (body.categoryId !== undefined) {
      if (body.categoryId !== null && typeof body.categoryId !== "string") {
        return res.status(400).json({ error: "categoryId debe ser texto o null." });
      }
      if (typeof body.categoryId === "string") {
        const { data: category, error } = await supabase.from("categories").select("id")
          .eq("id", body.categoryId).or(`user_id.is.null,user_id.eq.${userId}`).maybeSingle();
        if (error) throw error;
        if (!category) return res.status(404).json({ error: "Categoría no encontrada." });
      }
      update.category_id = body.categoryId;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No se recibieron campos editables." });
    }

    const { data, error } = await supabase.from("transactions").update(update)
      .eq("id", req.params.id).eq("user_id", userId).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Transacción no encontrada." });
    return res.json({ data });
  } catch (error) {
    console.error("Error editando transacción:", error);
    return res.status(500).json({ error: "No se pudo editar la transacción." });
  }
});

router.get("/accounts", async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, type, institution, color, icon, currency, initial_balance, current_balance, is_active, created_at")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return res.json({ data: data ?? [] });
  } catch (error) {
    console.error("Error listando cuentas:", error);
    return res.status(500).json({ error: "No se pudieron listar las cuentas." });
  }
});

router.post("/accounts", async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const type = typeof body.type === "string" ? body.type.trim() : "";
    const initialBalance = body.initialBalance === undefined ? 0 : Number(body.initialBalance);
    if (!name || !type || !Number.isFinite(initialBalance)) {
      return res.status(400).json({ error: "name, type e initialBalance válido son obligatorios." });
    }
    const { data, error } = await supabase.from("accounts").insert({
      user_id: req.userId!, name, type,
      currency: typeof body.currency === "string" ? body.currency : "USD",
      initial_balance: initialBalance,
      current_balance: initialBalance,
      is_active: true,
      institution: typeof body.institution === "string" ? body.institution : null,
      color: typeof body.color === "string" ? body.color : null,
      icon: typeof body.icon === "string" ? body.icon : null,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (error) {
    console.error("Error creando cuenta:", error);
    return res.status(500).json({ error: "No se pudo crear la cuenta." });
  }
});

router.patch("/accounts/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const [requestKey, column] of Object.entries({
      name: "name", type: "type", institution: "institution", color: "color", icon: "icon",
    })) {
      if (body[requestKey] !== undefined) {
        if (typeof body[requestKey] !== "string" || !body[requestKey].trim()) {
          return res.status(400).json({ error: `${requestKey} debe ser texto no vacío.` });
        }
        update[column] = body[requestKey].trim();
      }
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") return res.status(400).json({ error: "isActive debe ser booleano." });
      update.is_active = body.isActive;
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "No se recibieron campos editables." });
    const { data, error } = await supabase.from("accounts").update(update)
      .eq("id", req.params.id).eq("user_id", req.userId!).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Cuenta no encontrada." });
    return res.json({ data });
  } catch (error) {
    console.error("Error editando cuenta:", error);
    return res.status(500).json({ error: "No se pudo editar la cuenta." });
  }
});

router.get("/categories", async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, user_id, name, icon, color, transaction_type, is_default")
      .or(`user_id.eq.${req.userId},is_default.eq.true`)
      .order("name", { ascending: true });
    if (error) throw error;
    return res.json({ data: data ?? [] });
  } catch (error) {
    console.error("Error listando categorías:", error);
    return res.status(500).json({ error: "No se pudieron listar las categorías." });
  }
});

router.post("/categories", async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || (body.transactionType !== "income" && body.transactionType !== "expense")) {
      return res.status(400).json({ error: "name y transactionType son obligatorios." });
    }
    const { data, error } = await supabase.from("categories").insert({
      user_id: req.userId!, name, transaction_type: body.transactionType, is_default: false,
      icon: typeof body.icon === "string" ? body.icon : null,
      color: typeof body.color === "string" ? body.color : null,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (error) {
    console.error("Error creando categoría:", error);
    return res.status(500).json({ error: "No se pudo crear la categoría." });
  }
});

router.patch("/categories/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const key of ["name", "icon", "color"] as const) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== "string" || !body[key].trim()) {
          return res.status(400).json({ error: `${key} debe ser texto no vacío.` });
        }
        update[key] = body[key].trim();
      }
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "No se recibieron campos editables." });
    const { data, error } = await supabase.from("categories").update(update)
      .eq("id", req.params.id).eq("user_id", req.userId!).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Categoría no encontrada o predeterminada." });
    return res.json({ data });
  } catch (error) {
    console.error("Error editando categoría:", error);
    return res.status(500).json({ error: "No se pudo editar la categoría." });
  }
});

export default router;
