import { supabase } from "../config/supabase";

export async function obtenerOCrearUsuario(
  whatsappPhone: string
) {
  // 1. Buscar primero el perfil
  const { data: existingProfile, error: profileError } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("phone", whatsappPhone)
      .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  // Si ya existe el perfil, lo usamos
  if (existingProfile) {
    console.log("👤 Perfil existente encontrado");
    return existingProfile;
  }

  // 2. Buscar si el usuario ya existe en Auth
  const { data: usersData, error: usersError } =
    await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (usersError) {
    throw usersError;
  }

  const existingAuthUser = usersData.users.find(
    (user) => user.phone === whatsappPhone
  );

  let userId: string;

  // 3. Si ya existe en Auth, reutilizamos su ID
  if (existingAuthUser) {
    console.log("👤 Usuario de Auth existente encontrado");

    userId = existingAuthUser.id;
  } else {
    // 4. Si tampoco existe en Auth, lo creamos
    console.log("🆕 Creando nuevo usuario de Auth");

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

    userId = authData.user.id;
  }

  // 5. Crear el perfil utilizando el mismo ID de Auth
  const { data: profile, error: newProfileError } =
    await supabase
      .from("profiles")
      .insert({
        id: userId,
        phone: whatsappPhone,
        currency: "USD",
        locale: "es-EC",
        timezone: "America/Guayaquil",
      })
      .select()
      .single();

  if (newProfileError) {
    throw newProfileError;
  }

  console.log("✅ Perfil creado correctamente");

  return profile;
}