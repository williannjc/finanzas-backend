import { supabase } from "../config/supabase";

/**
 * WhatsApp solo puede operar sobre un perfil que ya existe y que está
 * asociado al número autorizado. Nunca crea usuarios ni perfiles.
 */
export async function obtenerUsuarioWhatsAppAutorizado(
  whatsappPhone: string
) {
  const digits = whatsappPhone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("El número de WhatsApp no tiene formato válido.");
  }

  const candidates = [digits, `+${digits}`];
  for (const phone of candidates) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  throw new Error(
    "El número autorizado no está vinculado a un perfil existente. No se creó ningún usuario."
  );
}
