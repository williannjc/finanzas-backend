import app from "./app";
import { env, validarConfiguracionProduccion } from "./config/env";

validarConfiguracionProduccion();

app.listen(env.PORT, () => {
  console.log("");
  console.log("==================================");
  console.log("🚀 Finanzas Backend iniciado");
  console.log(`📍 Puerto: ${env.PORT}`);
  console.log("==================================");
});
