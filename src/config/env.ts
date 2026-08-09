import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 3000,

  NODE_ENV: process.env.NODE_ENV || "development",

  SUPABASE_URL: process.env.SUPABASE_URL || "",

  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",

  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

  GEMINI_API_KEY:
  process.env.GEMINI_API_KEY || "",

  WHATSAPP_ACCESS_TOKEN:
    process.env.WHATSAPP_ACCESS_TOKEN || "",

  WHATSAPP_PHONE_NUMBER_ID:
    process.env.WHATSAPP_PHONE_NUMBER_ID || "",

  WHATSAPP_VERIFY_TOKEN:
    process.env.WHATSAPP_VERIFY_TOKEN || ""
};