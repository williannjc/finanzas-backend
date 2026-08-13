# Finanzas AI Backend

Backend único para WhatsApp y la aplicación web. Supabase es la fuente de verdad; los saldos se leen de `accounts.current_balance` y los actualizan los triggers de la base de datos.

## Ejecución

1. Copia `.env.example` a `.env` y completa los valores.
2. Ejecuta `npm install`.
3. Ejecuta `npm run dev` o `npm run build && npm start`.

En Render, configura las mismas variables de entorno. Nunca incluyas `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` ni los valores de WhatsApp en Lovable.

## WhatsApp

Configura en Meta el callback `https://TU-DOMINIO/webhook` y el mismo valor de `WHATSAPP_VERIFY_TOKEN` que está en Render. Los eventos sin mensajes y los mensajes no textuales se confirman con HTTP 200 sin crear movimientos.

## API web

Las rutas bajo `/api` requieren un token de sesión de Supabase:

`Authorization: Bearer <access_token>`

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/dashboard` | Balance, cuentas, resumen mensual, categorías y movimientos. |
| GET | `/api/transactions` | Lista; filtros: `from`, `to`, `type`, `categoryId`, `accountId`. |
| POST | `/api/transactions` | Crea con `amount`, `type`, `accountId`, `category`, `description`. |
| PATCH | `/api/transactions/:id` | Edita monto, tipo, descripción, fecha o cuenta. |
| DELETE | `/api/transactions/:id` | Elimina una transacción propia. |
| GET/POST | `/api/accounts` | Lista o crea cuentas. |
| PATCH | `/api/accounts/:id` | Edita o activa/desactiva una cuenta. |
| GET/POST | `/api/categories` | Lista o crea categorías propias. |
| PATCH | `/api/categories/:id` | Edita una categoría propia. |

## Verificación

Ejecuta `npm test`. Incluye la compilación TypeScript y pruebas de la validación de mensajes Gemini.
