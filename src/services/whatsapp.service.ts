import axios from "axios";
import { env } from "../config/env";

export async function enviarMensajeWhatsApp(
  numero: string,
  mensaje: string
) {
  const url = `https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: {
          body: mensaje,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📤 Mensaje enviado por WhatsApp");
    console.log(response.data);

    return response.data;
  } catch (error: any) {
    console.error(
      "❌ Error enviando mensaje por WhatsApp:",
      error.response?.data || error.message
    );

    throw error;
  }
}