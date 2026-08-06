"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
app_1.default.listen(env_1.env.PORT, () => {
    console.log("");
    console.log("==================================");
    console.log("🚀 Finanzas Backend iniciado");
    console.log(`📍 Puerto: ${env_1.env.PORT}`);
    console.log("==================================");
});
//# sourceMappingURL=server.js.map