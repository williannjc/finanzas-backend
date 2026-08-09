import { supabase } from "../config/supabase";

export async function obtenerOCrearUsuario(
  whatsappPhone: string
) {
  // 1. Buscar si ya existe un perfil con ese número
  const { data: existingProfile, error: profileError } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("phone", whatsappPhone)
      .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  // 2. Si ya existe, lo utilizamos
  if (existingProfile) {
    return existingProfile;
  }

  // 3. Crear usuario en Supabase Auth
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      phone: whatsappPhone,
      phone_confirm: true,
      user_metadata: {
        phone: whatsappPhone,
      },
    });

  if (authError) {
    throw authError;
  }

  if (!authData.user) {
    throw new Error("No se pudo crear el usuario");
  }

  // 4. Crear profile
  const { data: profile, error: newProfileError } =
    await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        phone: whatsappPhone,
      })
      .select()
      .single();

  if (newProfileError) {
    throw newProfileError;
  }

  return profile;
}