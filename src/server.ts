import app from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log("");
  console.log("==================================");
  console.log("🚀 Finanzas Backend iniciado");
  console.log(`📍 Puerto: ${env.PORT}`);
  console.log("==================================");
});