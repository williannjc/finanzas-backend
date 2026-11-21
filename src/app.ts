import express, { Request } from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes";
import whatsappRoutes from "./routes/whatsapp.routes";
import financeRoutes from "./routes/finance.routes";

const app = express();

app.use(cors());

// Meta firma el cuerpo HTTP original; conservarlo antes de parsear JSON.
app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));

app.use("/api", healthRoutes);
app.use("/api", financeRoutes);

app.use("/", whatsappRoutes);

app.get("/", (_, res) => {
  res.json({
    status: "ok",
    message: "🚀 Finanzas Backend funcionando"
  });
});

export default app;
