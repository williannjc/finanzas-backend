"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const whatsapp_routes_1 = __importDefault(require("./routes/whatsapp.routes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/api", health_routes_1.default);
app.use("/", whatsapp_routes_1.default);
app.get("/", (_, res) => {
    res.json({
        status: "ok",
        message: "🚀 Finanzas Backend funcionando"
    });
});
exports.default = app;
//# sourceMappingURL=app.js.map