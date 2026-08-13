import { supabase } from "../config/supabase";

function telefonoE164(whatsappPhone: string): string {
  const digits = whatsappPhone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("El número de WhatsApp no tiene formato válido.");
  }
  return `+${digits}`;
}

export async function obtenerOCrearUsuario(
  whatsappPhone: string
) {
  // 1. Buscar perfil por número de WhatsApp
  const { data: existingProfile, error: profileError } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("phone", whatsappPhone)
      .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (existingProfile) {
    console.log("👤 Perfil encontrado por teléfono");
    return existingProfile;
  }

  // 2. Buscar usuario existente en Auth
  const { data: usersData, error: usersError } =
    await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (usersError) {
    throw usersError;
  }

  const existingAuthUser = usersData.users.find(
    (user) =>
      user.phone === whatsappPhone ||
      user.phone === telefonoE164(whatsappPhone)
  );

  let userId: string;
  if (existingAuthUser) {
    userId = existingAuthUser.id;
    console.log("👤 Usuario de Auth existente encontrado");
  } else {
    const { data: createdUser, error: createUserError } =
      await supabase.auth.admin.createUser({
        phone: telefonoE164(whatsappPhone),
        phone_confirm: true,
      });

    if (createUserError || !createdUser.user) {
      throw createUserError || new Error("No se pudo crear el usuario de Auth.");
    }

    userId = createdUser.user.id;
    console.log("✅ Usuario de Auth creado para WhatsApp");
  }

  // 3. Buscar el profile utilizando el ID de Auth
  const { data: profileById, error: profileByIdError } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

  if (profileByIdError) {
    throw profileByIdError;
  }

  // 4. El profile ya existe → actualizarlo
  if (profileById) {
    const { data: updatedProfile, error: updateError } =
      await supabase
        .from("profiles")
        .update({
          phone: whatsappPhone,
        })
        .eq("id", userId)
        .select()
        .single();

    if (updateError) {
      throw updateError;
    }

    console.log("✅ Perfil existente actualizado con WhatsApp");

    return updatedProfile;
  }

  // 5. Solo si realmente no existe, crearlo
  const { data: newProfile, error: newProfileError } =
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

  return newProfile;
}
