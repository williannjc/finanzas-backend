import { supabase } from "../config/supabase";

export async function obtenerCategoria(
  categoriaTexto: string,
  tipo: "income" | "expense"
) {
  const texto = categoriaTexto.trim().toLowerCase();

  // Buscar todas las categorías del tipo correspondiente
  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .eq("transaction_type", tipo);

  if (error) {
    throw error;
  }

  if (!categories || categories.length === 0) {
    throw new Error(
      `No existen categorías para el tipo ${tipo}`
    );
  }

  // Coincidencia exacta
  const exacta = categories.find(
    (category) =>
      category.name.toLowerCase() === texto
  );

  if (exacta) {
    return exacta;
  }

  // Algunas equivalencias comunes
    const equivalencias: Record<string, string[]> = {
        almuerzo: ["restaurantes"],
        cena: ["restaurantes"],
        desayuno: ["restaurantes"],
        comida: ["restaurantes"],
        restaurante: ["restaurantes"],
        uber: ["transporte"],
        taxi: ["transporte"],
        bus: ["transporte"],
        gasolina: ["gasolina"],
        combustible: ["gasolina"],
        supermercado: ["supermercado"],
        netflix: ["streaming"],
    };

  const posibles = equivalencias[texto];

  if (posibles) {
    const encontrada = categories.find(
      (category) =>
        posibles.includes(category.name.toLowerCase())
    );

    if (encontrada) {
      return encontrada;
    }
  }

  // Si no encontramos coincidencia,
  // utilizamos "Otros"
  const otros = categories.find(
    (category) =>
      category.name.toLowerCase() === "otros"
  );

  return otros || null;
}