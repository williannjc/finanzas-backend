import assert from "node:assert/strict";
import { mock, test } from "node:test";
import request from "supertest";

let analizarMensajeResultado: {
  tipo: "gasto" | "ingreso" | "consulta" | "otro";
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
  intencion:
    | "transaction"
    | "balance_query"
    | "daily_expense_query"
    | "monthly_expense_query"
    | "monthly_income_query"
    | "summary_query"
    | "recent_transactions_query"
    | "category_expense_query"
    | "create_account"
    | "transfer"
    | "otro";
  cuentaOrigen: string | null;
  cuentaDestino: string | null;
} = {
  tipo: "otro",
  monto: 20,
  categoria: "transferencia",
  descripcion: "transferencia de prueba",
  intencion: "transfer",
  cuentaOrigen: "Efectivo",
  cuentaDestino: "Banco Pichincha",
};

let transferenciasEjecutadas = 0;
let ultimaTransferencia: {
  userId: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  monto: number;
  sourceMessageId?: string;
} | null = null;

let processedMessagesMock: Record<
  string,
  {
    id: string;
    message_id: string;
    status: "processing" | "processed" | "failed";
    processed_at: string | null;
    error_message: string | null;
  }
> = {};

function resetProcessedMessagesMock() {
  processedMessagesMock = {};
}

const analizarMensajeMock = mock.module(
  "../services/gemini.service.js",
  {
    namedExports: {
      analizarMensaje: async () => analizarMensajeResultado,
    },
  }
);

const accountServiceMock = mock.module(
  "../services/account.service.js",
  {
    namedExports: {
      obtenerOCrearCuentaPrincipal: async () => ({
        id: "account-main",
        user_id: "user-test",
        name: "Efectivo",
        type: "cash",
        current_balance: 100,
      }),

      crearCuenta: async () => ({
        creada: true,
        cuenta: {
          id: "account-new",
          name: "Banco Pichincha",
          current_balance: 0,
        },
      }),

      transferirEntreCuentas: async (
        userId: string,
        cuentaOrigen: string,
        cuentaDestino: string,
        monto: number,
        sourceMessageId?: string
      ) => {
        transferenciasEjecutadas++;

        ultimaTransferencia = {
          userId,
          cuentaOrigen,
          cuentaDestino,
          monto,
          sourceMessageId,
        };

        return {
          transferId: "transfer-test",
          monto,
          cuentaOrigen: {
            id: "account-origin",
            name: cuentaOrigen,
            current_balance: 80,
          },
          cuentaDestino: {
            id: "account-destination",
            name: cuentaDestino,
            current_balance: 70,
          },
        };
      },
    },
  }
);

const userServiceMock = mock.module(
  "../services/user.service.js",
  {
    namedExports: {
      obtenerOCrearUsuario: async () => ({
        id: "user-test",
        full_name: "Usuario Test",
        phone: "593999999999",
        currency: "USD",
        locale: "es-EC",
        timezone: "America/Guayaquil",
      }),
    },
  }
);

const whatsappServiceMock = mock.module(
  "../services/whatsapp.service.js",
  {
    namedExports: {
      enviarMensajeWhatsApp: async () => undefined,
    },
  }
);

const transactionServiceMock = mock.module(
  "../services/transaction.service.js",
  {
    namedExports: {
      crearTransaccion: async () => ({
        id: "transaction-test",
        category_id: null,
      }),
    },
  }
);

const financeServiceMock = mock.module(
  "../services/finance.service.js",
  {
    namedExports: {
      obtenerSaldoTotal: async () => ({
        saldoTotal: 0,
        cuentas: [],
      }),

      obtenerGastosDelDia: async () => ({
        total: 0,
        transacciones: [],
      }),

      obtenerGastosDelMes: async () => ({
        total: 0,
        transacciones: [],
      }),

      obtenerIngresosDelMes: async () => ({
        total: 0,
        transacciones: [],
      }),

      obtenerGastosPorCategoriaNombre: async () => ({
        categoria: "Otros",
        total: 0,
        transacciones: [],
      }),

      obtenerUltimasTransacciones: async () => [],

      obtenerResumenMensual: async () => ({
        ingresos: 0,
        gastos: 0,
        balance: 0,
        categorias: [],
      }),
    },
  }
);

const supabaseMock = mock.module(
  "../config/supabase.js",
  {
    namedExports: {
      supabase: {
        from: (table: string) => {
          if (table !== "processed_messages") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: null,
                  }),

                  single: async () => ({
                    data: {
                      current_balance: 100,
                      name: "Efectivo",
                    },
                    error: null,
                  }),
                }),
              }),

              insert: async () => ({
                data: null,
                error: null,
              }),

              update: () => ({
                eq: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            };
          }

          // ======================================================
          // MOCK REAL DE processed_messages
          // ======================================================

          return {
            select: (columns: string) => {
              let messageIdFiltro: string | null = null;

              const query = {
                eq: (
                  column: string,
                  value: string
                ) => {
                  if (column === "message_id") {
                    messageIdFiltro = value;
                  }

                  return query;
                },

                maybeSingle: async () => {
                  if (!messageIdFiltro) {
                    return {
                      data: null,
                      error: null,
                    };
                  }

                  const mensaje =
                    processedMessagesMock[
                      messageIdFiltro
                    ];

                  if (!mensaje) {
                    return {
                      data: null,
                      error: null,
                    };
                  }

                  if (
                    columns === "status"
                  ) {
                    return {
                      data: {
                        status: mensaje.status,
                      },
                      error: null,
                    };
                  }

                  return {
                    data: mensaje,
                    error: null,
                  };
                },

                single: async () => ({
                  data: null,
                  error: null,
                }),
              };

              return query;
            },

            insert: async (
              values: {
                message_id: string;
                status:
                  | "processing"
                  | "processed"
                  | "failed";
              }
            ) => {
              const existing =
                processedMessagesMock[
                  values.message_id
                ];

              if (existing) {
                return {
                  data: null,
                  error: {
                    code: "23505",
                    message:
                      "duplicate key value violates unique constraint",
                  },
                };
              }

              processedMessagesMock[
                values.message_id
              ] = {
                id:
                  `processed-${values.message_id}`,
                message_id:
                  values.message_id,
                status: values.status,
                processed_at: null,
                error_message: null,
              };

              return {
                data: null,
                error: null,
              };
            },

            update: (
              values: {
                status:
                  | "processing"
                  | "processed"
                  | "failed";
                processed_at?: string | null;
                error_message?: string | null;
              }
            ) => {
              let messageIdFiltro: string | null = null;

              let statusFiltro:
                | "processing"
                | "processed"
                | "failed"
                | null = null;

              const aplicarActualizacion = () => {
                if (!messageIdFiltro) {
                  return {
                    data: null,
                    error: null,
                  };
                }

                const mensaje =
                  processedMessagesMock[messageIdFiltro];

                if (
                  !mensaje ||
                  (
                    statusFiltro &&
                    mensaje.status !== statusFiltro
                  )
                ) {
                  return {
                    data: null,
                    error: null,
                  };
                }

                mensaje.status = values.status;

                mensaje.processed_at =
                  values.processed_at ?? null;

                mensaje.error_message =
                  values.error_message ?? null;

                return {
                  data: null,
                  error: null,
                };
              };

              const query = {
                eq: (
                  column: string,
                  value: string
                ) => {
                  if (column === "message_id") {
                    messageIdFiltro = value;
                  }

                  if (column === "status") {
                    statusFiltro =
                      value as
                        | "processing"
                        | "processed"
                        | "failed";
                  }

                  return query;
                },

                select: () => ({
                  maybeSingle: async () => {
                    if (!messageIdFiltro) {
                      return {
                        data: null,
                        error: null,
                      };
                    }

                    const mensaje =
                      processedMessagesMock[
                        messageIdFiltro
                      ];

                    if (
                      !mensaje ||
                      (
                        statusFiltro &&
                        mensaje.status !== statusFiltro
                      )
                    ) {
                      return {
                        data: null,
                        error: null,
                      };
                    }

                    mensaje.status = values.status;

                    mensaje.processed_at =
                      values.processed_at ?? null;

                    mensaje.error_message =
                      values.error_message ?? null;

                    return {
                      data: {
                        id: mensaje.id,
                      },
                      error: null,
                    };
                  },
                }),

                then: async (
                  resolve: (
                    value: {
                      data: null;
                      error: null;
                    }
                  ) => unknown
                ) =>
                  resolve(
                    aplicarActualizacion()
                  ),
              };

              return query;
            },

          };
        },
      },
    },
  }
);

const app = require("../app").default;

function crearMensaje(
  texto: string,
  id: string
) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "593999999999",
                  id,
                  type: "text",
                  text: {
                    body: texto,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function resetTransferenciaMock() {
  transferenciasEjecutadas = 0;
  ultimaTransferencia = null;
  resetProcessedMessagesMock();
}

test("GET /webhook rechaza una verificación con token incorrecto", async () => {
  const response = await request(app)
    .get("/webhook")
    .query({
      "hub.mode": "subscribe",
      "hub.verify_token": "token-incorrecto",
      "hub.challenge": "12345",
    });

  assert.equal(response.status, 403);
});

test("POST /webhook acepta eventos sin mensaje", async () => {
  const response = await request(app)
    .post("/webhook")
    .send({
      entry: [
        {
          changes: [
            {
              value: {},
            },
          ],
        },
      ],
    });

  assert.equal(response.status, 200);
});

test("POST /webhook ignora mensajes que no sean texto", async () => {
  const response = await request(app)
    .post("/webhook")
    .send({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "593999999999",
                    id: `test-image-${Date.now()}`,
                    type: "image",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

  assert.equal(response.status, 200);
});

test("POST /webhook ignora un mensaje sin ID", async () => {
  const response = await request(app)
    .post("/webhook")
    .send({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "593999999999",
                    type: "text",
                    text: {
                      body: "hola",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

  assert.equal(response.status, 200);
});

test("POST /webhook ejecuta una transferencia válida", async () => {
  resetTransferenciaMock();

  analizarMensajeResultado = {
    tipo: "otro",
    monto: 20,
    categoria: "transferencia",
    descripcion: "transferencia de prueba",
    intencion: "transfer",
    cuentaOrigen: "Efectivo",
    cuentaDestino: "Banco Pichincha",
  };

  const response = await request(app)
    .post("/webhook")
    .send(
      crearMensaje(
        "transfiere 20 dólares de Efectivo a Banco Pichincha",
        "test-transfer-valid"
      )
    );

  assert.equal(response.status, 200);

  assert.equal(
    transferenciasEjecutadas,
    1
  );

  assert.deepEqual(
    ultimaTransferencia,
    {
      userId: "user-test",
      cuentaOrigen: "Efectivo",
      cuentaDestino: "Banco Pichincha",
      monto: 20,
      sourceMessageId: "test-transfer-valid",
    }
  );
});

test("POST /webhook rechaza una transferencia sin cuenta de origen", async () => {
  resetTransferenciaMock();

  analizarMensajeResultado = {
    tipo: "otro",
    monto: 10,
    categoria: "transferencia",
    descripcion: "transferencia sin origen",
    intencion: "transfer",
    cuentaOrigen: null,
    cuentaDestino: "Banco Pichincha",
  };

  const response = await request(app)
    .post("/webhook")
    .send(
      crearMensaje(
        "transfiere 10 dólares a Banco Pichincha",
        "test-transfer-no-origin"
      )
    );

  assert.equal(response.status, 200);

  assert.equal(
    transferenciasEjecutadas,
    0
  );
});

test("POST /webhook rechaza una transferencia sin cuenta de destino", async () => {
  resetTransferenciaMock();

  analizarMensajeResultado = {
    tipo: "otro",
    monto: 10,
    categoria: "transferencia",
    descripcion: "transferencia sin destino",
    intencion: "transfer",
    cuentaOrigen: "Efectivo",
    cuentaDestino: null,
  };

  const response = await request(app)
    .post("/webhook")
    .send(
      crearMensaje(
        "transfiere 10 dólares desde Efectivo",
        "test-transfer-no-destination"
      )
    );

  assert.equal(response.status, 200);

  assert.equal(
    transferenciasEjecutadas,
    0
  );
});

test("POST /webhook rechaza una transferencia con monto inválido", async () => {
  resetTransferenciaMock();

  analizarMensajeResultado = {
    tipo: "otro",
    monto: 0,
    categoria: "transferencia",
    descripcion: "transferencia con monto inválido",
    intencion: "transfer",
    cuentaOrigen: "Efectivo",
    cuentaDestino: "Banco Pichincha",
  };

  const response = await request(app)
    .post("/webhook")
    .send(
      crearMensaje(
        "transfiere 0 dólares de Efectivo a Banco Pichincha",
        "test-transfer-invalid-amount"
      )
    );

  assert.equal(response.status, 200);

  assert.equal(
    transferenciasEjecutadas,
    0
  );
});

test("los mocks del webhook están correctamente configurados", () => {
  assert.ok(analizarMensajeMock);
  assert.ok(accountServiceMock);
  assert.ok(userServiceMock);
  assert.ok(whatsappServiceMock);
  assert.ok(transactionServiceMock);
  assert.ok(financeServiceMock);
  assert.ok(supabaseMock);
});

test(
  "POST /webhook no procesa dos veces el mismo mensaje simultáneamente",
  async () => {
    resetTransferenciaMock();

    analizarMensajeResultado = {
      tipo: "otro",
      monto: 20,
      categoria: "transferencia",
      descripcion: "transferencia concurrente",
      intencion: "transfer",
      cuentaOrigen: "Efectivo",
      cuentaDestino: "Banco Pichincha",
    };

    const message = crearMensaje(
      "transfiere 20 dólares de Efectivo a Banco Pichincha",
      "test-transfer-concurrent"
    );

    const [responseA, responseB] = await Promise.all([
      request(app)
        .post("/webhook")
        .send(message),

      request(app)
        .post("/webhook")
        .send(message),
    ]);

    assert.equal(responseA.status, 200);
    assert.equal(responseB.status, 200);

    assert.equal(
      transferenciasEjecutadas,
      1
    );
  }
);

test(
  "POST /webhook ignora un mensaje que ya está procesado",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-already-processed";

    processedMessagesMock[messageId] = {
      id: `processed-${messageId}`,
      message_id: messageId,
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: null,
    };

    analizarMensajeResultado = {
      tipo: "otro",
      monto: 20,
      categoria: "transferencia",
      descripcion: "no debe ejecutarse",
      intencion: "transfer",
      cuentaOrigen: "Efectivo",
      cuentaDestino: "Banco Pichincha",
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "transfiere 20 dólares de Efectivo a Banco Pichincha",
          messageId
        )
      );

    assert.equal(response.status, 200);
    assert.equal(transferenciasEjecutadas, 0);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook ignora un mensaje que está en processing",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-already-processing";

    processedMessagesMock[messageId] = {
      id: `processed-${messageId}`,
      message_id: messageId,
      status: "processing",
      processed_at: null,
      error_message: null,
    };

    analizarMensajeResultado = {
      tipo: "otro",
      monto: 20,
      categoria: "transferencia",
      descripcion: "no debe ejecutarse",
      intencion: "transfer",
      cuentaOrigen: "Efectivo",
      cuentaDestino: "Banco Pichincha",
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "transfiere 20 dólares de Efectivo a Banco Pichincha",
          messageId
        )
      );

    assert.equal(response.status, 200);
    assert.equal(transferenciasEjecutadas, 0);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processing"
    );
  }
);

test(
  "POST /webhook recupera un mensaje que había fallado",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-retry-failed";

    processedMessagesMock[messageId] = {
      id: `processed-${messageId}`,
      message_id: messageId,
      status: "failed",
      processed_at: null,
      error_message: "Error anterior",
    };

    analizarMensajeResultado = {
      tipo: "otro",
      monto: 20,
      categoria: "transferencia",
      descripcion: "transferencia recuperada",
      intencion: "transfer",
      cuentaOrigen: "Efectivo",
      cuentaDestino: "Banco Pichincha",
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "transfiere 20 dólares de Efectivo a Banco Pichincha",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      transferenciasEjecutadas,
      1
    );

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );

    assert.equal(
      processedMessagesMock[messageId].error_message,
      null
    );

    assert.ok(
      processedMessagesMock[messageId].processed_at
    );
  }
);

test(
  "POST /webhook marca como processed una consulta de saldo",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-balance";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "cuánto tengo",
      intencion: "balance_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "cuánto tengo",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );

    assert.ok(
      processedMessagesMock[messageId].processed_at
    );
  }
);

test(
  "POST /webhook marca como processed una consulta de gastos del día",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-daily-expense";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "gastos de hoy",
      intencion: "daily_expense_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "cuánto he gastado hoy",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed una consulta de gastos del mes",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-monthly-expense";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "gastos de este mes",
      intencion: "monthly_expense_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "cuánto he gastado este mes",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed una consulta de ingresos del mes",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-monthly-income";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "ingresos de este mes",
      intencion: "monthly_income_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "cuánto he recibido este mes",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed un resumen financiero",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-summary";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "resumen financiero",
      intencion: "summary_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "dame un resumen de mis finanzas",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed una consulta de últimos movimientos",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-recent-transactions";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "últimos movimientos",
      intencion: "recent_transactions_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "cuáles son mis últimos movimientos",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed una consulta por categoría",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-category";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: "Transporte",
      descripcion: "gastos en transporte",
      intencion: "category_expense_query",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "cuánto he gastado en transporte",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed una consulta no reconocida",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-unknown-query";

    analizarMensajeResultado = {
      tipo: "consulta",
      monto: null,
      categoria: null,
      descripcion: "no sé qué preguntar",
      intencion: "otro",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "no sé qué preguntar",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed un mensaje que no es transacción ni consulta",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-ignored-message";

    analizarMensajeResultado = {
      tipo: "otro",
      monto: null,
      categoria: null,
      descripcion: "hola",
      intencion: "otro",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "hola",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );
  }
);

test(
  "POST /webhook marca como processed una transacción con monto inválido",
  async () => {
    resetTransferenciaMock();

    const messageId = "test-status-invalid-transaction";

    analizarMensajeResultado = {
      tipo: "gasto",
      monto: 0,
      categoria: "Entretenimiento",
      descripcion: "gasto inválido",
      intencion: "transaction",
      cuentaOrigen: null,
      cuentaDestino: null,
    };

    const response = await request(app)
      .post("/webhook")
      .send(
        crearMensaje(
          "gasté 0 dólares en entretenimiento",
          messageId
        )
      );

    assert.equal(response.status, 200);

    assert.equal(
      processedMessagesMock[messageId].status,
      "processed"
    );

    assert.equal(
      transferenciasEjecutadas,
      0
    );
  }
);