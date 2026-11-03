import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createDatabase } from '../src/database/database.js';
import { migrate } from '../src/database/migrate.js';
import { createApplicationServices } from '../src/services/application.service.js';
import { createApp } from '../src/app.js';
import { createDemoPurchase } from '../src/utils/compra-prueba.js';
import { hashPassword } from '../src/utils/security.js';
import { compraSchema } from '../src/validators/compra.validator.js';
import { createIntegracionBoletosService } from '../src/services/integracion-boletos.service.js';
import { createEntregaService } from '../src/services/entrega.service.js';
import { createProcesamientoService } from '../src/services/procesamiento.service.js';
import { createDocumentosService } from '../src/services/documentos.service.js';
import { PDFDocument } from 'pdf-lib';

let database, services, config, server, baseUrl, directory;
const password = 'Clave-exclusiva-de-pruebas-2026';
const integrationKey = 'integration-key-exclusiva-tests-32-caracteres';
before(async () => {
  const postgresUrl = process.env.COMPROBANTES_TEST_DATABASE_URL;
  if (postgresUrl && !/^\/comprobantes_test_[a-z0-9_]+$/.test(new URL(postgresUrl).pathname)) {
    throw new Error(
      'La suite solo admite una BD externa dedicada cuyo nombre comience con comprobantes_test_.',
    );
  }
  directory = await mkdtemp(join(tmpdir(), 'comprobantes-test-'));
  config = {
    databaseDriver: postgresUrl ? 'postgres' : 'pglite',
    databaseUrl: postgresUrl,
    databasePoolMax: 5,
    dataDirectory: 'memory://',
    provider: 'simulado',
    documentDirectory: join(directory, 'documentos'),
    mailDirectory: join(directory, 'correo'),
    callbackDirectory: join(directory, 'callbacks'),
    callbackUrl: '',
    appOrigin: 'http://localhost:4205',
    integrationKey,
    adminUsername: 'contador',
    adminPasswordHash: hashPassword(password),
    sessionHours: 1,
    workerConcurrency: 3,
    leaseSeconds: 30,
    maxAttempts: 3,
  };
  database = await createDatabase(config);
  await migrate(database);
  services = createApplicationServices(database, config);
  const app = createApp({ services, database, config });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await database.exec(
    'TRUNCATE comprobantes,proveedor_simulado,documentos,entregas,auditoria,sesiones RESTART IDENTITY CASCADE',
  );
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await database?.close();
  // El unico borrado recursivo se limita al directorio temporal creado por esta suite.
  if (directory && resolve(directory).startsWith(`${resolve(tmpdir())}\\comprobantes-test-`))
    await rm(directory, { recursive: true, force: true });
});
async function request(path, { method = 'GET', body, key, cookie, origin } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'x-api-key': key } : {}),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function due() {
  await database.query(
    "UPDATE comprobantes SET proximo_intento=now() WHERE estado='PENDIENTE' RETURNING id",
  );
}
async function login() {
  const response = await request('/api/v1/auth/sesion', {
    method: 'POST',
    body: { usuario: 'contador', clave: password },
    origin: config.appOrigin,
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('la API exige autenticacion; recibe una vez y reconoce reenvios sin duplicar', async () => {
  const payload = createDemoPurchase({ cantidad: 3 });
  assert.equal(
    (await request('/api/v1/integraciones/boletos/compras', { method: 'POST', body: payload }))
      .status,
    401,
  );
  const first = await request('/api/v1/integraciones/boletos/compras', {
    method: 'POST',
    body: payload,
    key: integrationKey,
  });
  assert.equal(first.status, 202);
  const accepted = await first.json();
  assert.equal(accepted.comprobante.estado, 'PENDIENTE');
  const duplicate = await request('/api/v1/integraciones/boletos/compras', {
    method: 'POST',
    body: payload,
    key: integrationKey,
  });
  const repeated = await duplicate.json();
  assert.equal(repeated.duplicado, true);
  assert.equal(repeated.comprobante.id, accepted.comprobante.id);
  payload.comprador.nombre = 'Datos diferentes';
  assert.equal(
    (
      await request('/api/v1/integraciones/boletos/compras', {
        method: 'POST',
        body: payload,
        key: integrationKey,
      })
    ).status,
    409,
  );
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM comprobantes'))[0].total,
    1,
  );
});

test('valida factura, importes, cantidad y boletos repetidos antes de persistir', async () => {
  const unpaid = createDemoPurchase();
  unpaid.estadoPago = 'PENDIENTE';
  assert.equal(compraSchema.safeParse(unpaid).success, false);
  const invoice = createDemoPurchase({ tipoComprobante: 'FACTURA' });
  invoice.comprador.tipoDocumento = 'DNI';
  assert.equal(compraSchema.safeParse(invoice).success, false);
  const duplicate = createDemoPurchase({ cantidad: 2 });
  duplicate.detalle[1].boletoIds = duplicate.detalle[0].boletoIds;
  assert.equal(compraSchema.safeParse(duplicate).success, false);
  const wrongTotal = createDemoPurchase();
  wrongTotal.total = '29.99';
  const response = await request('/api/v1/integraciones/boletos/compras', {
    method: 'POST',
    body: wrongTotal,
    key: integrationKey,
  });
  assert.equal(response.status, 422);
  const decimal = createDemoPurchase();
  decimal.total = '30.001';
  assert.equal(compraSchema.safeParse(decimal).success, false);
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM comprobantes'))[0].total,
    0,
  );
});

test('normal y express con boleta/factura: varios boletos producen un comprobante y tres documentos', async () => {
  const ids = [];
  for (const modalidad of ['NORMAL', 'EXPRESS'])
    for (const tipoComprobante of ['BOLETA', 'FACTURA']) {
      ids.push(
        (
          await services.comprobantes.receive(
            createDemoPurchase({ modalidad, tipoComprobante, cantidad: 3 }),
          )
        ).comprobante.id,
      );
    }
  for (let tick = 0; tick < 4; tick++) await services.worker.tick();
  for (const id of ids) {
    const detail = await services.comprobantes.detail(id);
    assert.equal(detail.estado, 'PROCESADO');
    assert.equal(detail.cantidadBoletos, 3);
    assert.equal(detail.total, '90.00');
    assert.equal(detail.documentos.length, 3);
    assert.equal(detail.entregas.length, 2);
    assert.ok(detail.entregas.every((item) => item.estado === 'CAPTURADO_PRUEBA'));
    const pdf = await services.comprobantes.download(id, 'PDF');
    assert.equal(pdf.content.subarray(0, 4).toString(), '%PDF');
    const xml = await services.comprobantes.download(id, 'XML');
    assert.match(xml.content.toString(), /sinValidezTributaria="true"/);
  }
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM proveedor_simulado'))[0].total,
    4,
  );
});

test('una respuesta perdida se reconcilia con el proveedor sin emitir otra vez', async () => {
  const id = (
    await services.comprobantes.receive(
      createDemoPurchase({ escenarioPrueba: 'RESPUESTA_INCIERTA' }),
    )
  ).comprobante.id;
  await services.worker.tick();
  assert.equal((await services.model.get(id)).estado_fiscal, 'RESULTADO_INCIERTO');
  await due();
  await services.worker.tick();
  assert.equal((await services.model.get(id)).estado, 'PROCESADO');
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM proveedor_simulado'))[0].total,
    1,
  );
});

test('una falla temporal se reintenta y un rechazo requiere atencion sin envio de correo', async () => {
  const temporary = (
    await services.comprobantes.receive(createDemoPurchase({ escenarioPrueba: 'ERROR_TEMPORAL' }))
  ).comprobante.id;
  const rejected = (
    await services.comprobantes.receive(createDemoPurchase({ escenarioPrueba: 'RECHAZO' }))
  ).comprobante.id;
  await services.worker.tick();
  assert.equal((await services.model.get(temporary)).estado, 'PENDIENTE');
  const detail = await services.comprobantes.detail(rejected);
  assert.equal(detail.estado, 'REQUIERE_ATENCION');
  assert.equal(detail.estadoFiscal, 'RECHAZADO_SIMULADO');
  assert.ok(detail.entregas.every((item) => item.tipo !== 'CORREO'));
  await due();
  await services.worker.tick();
  assert.equal((await services.model.get(temporary)).estado, 'PROCESADO');
});

test('las reservas concurrentes no comparten trabajos; una reserva vencida se recupera', async () => {
  for (let index = 0; index < 12; index++)
    await services.comprobantes.receive(createDemoPurchase());
  const reservations = await Promise.all([
    services.model.claim(6, 30),
    services.model.claim(6, 30),
  ]);
  const ids = reservations.flat().map((row) => row.id);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12);
  const lost = reservations[0][0];
  await database.query(
    "UPDATE comprobantes SET reserva_hasta=now()-interval '1 second' WHERE id=$1 RETURNING id",
    [lost.id],
  );
  const recovered = await services.model.claim(1, 30);
  assert.equal(recovered[0].id, lost.id);
  assert.notEqual(recovered[0].reserva_token, lost.reserva_token);
  const stale = await services.model.complete(lost, [], 'simulado-v2');
  assert.equal(stale, false);
  await services.procesamiento.process(recovered[0]);
  assert.equal((await services.model.get(lost.id)).estado, 'PROCESADO');
});

test('reenviar correo conserva el comprobante y bloquea reenvios simultaneos', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  await services.worker.tick();
  const results = await Promise.allSettled([
    services.comprobantes.resend(id, 'contador'),
    services.comprobantes.resend(id, 'contador'),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  await services.worker.tick();
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM proveedor_simulado'))[0].total,
    1,
  );
  assert.equal(
    (await services.comprobantes.detail(id)).entregas.filter((item) => item.tipo === 'CORREO')
      .length,
    2,
  );
});

test('el fallo del almacenamiento recupera documentos de la misma emision', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  const [record] = await services.model.claim(1, 30);
  const failed = createProcesamientoService({
    model: services.model,
    provider: services.provider,
    documentos: {
      generate: async () => {
        throw new Error('Disco no disponible');
      },
    },
    config,
  });
  await failed.process(record);
  const checkpoint = await services.model.get(id);
  assert.equal(checkpoint.estado, 'PENDIENTE');
  assert.equal(checkpoint.estado_fiscal, 'SIMULADO');
  assert.equal(checkpoint.estado_documentos, 'ERROR');
  assert.equal(checkpoint.resultado_emision.operacionId, id);
  assert.equal((await services.comprobantes.detail(id)).documentos.length, 0);
  assert.equal((await services.comprobantes.detail(id)).entregas.length, 0);
  await due();
  await services.worker.tick();
  assert.equal((await services.model.get(id)).estado, 'PROCESADO');
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM proveedor_simulado'))[0].total,
    1,
  );
});

test('una confirmacion incompleta del proveedor no habilita PDF ni correo', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  const [record] = await services.model.claim(1, 30);
  let rendered = false;
  const processor = createProcesamientoService({
    model: services.model,
    config,
    provider: {
      consultarResultado: async () => ({ estado: 'COMPLETADO', serie: 'PRUEBA', numero: '1' }),
    },
    documentos: {
      generate: async () => {
        rendered = true;
      },
    },
  });
  await processor.process(record);
  const detail = await services.comprobantes.detail(id);
  assert.equal(rendered, false);
  assert.equal(detail.estadoFiscal, 'RESULTADO_INCIERTO');
  assert.equal(detail.estadoDocumentos, 'NO_HABILITADOS');
  assert.equal(detail.documentos.length, 0);
  assert.equal(detail.entregas.length, 0);
});

test('un resultado pendiente no habilita documentos ni correo', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  const [record] = await services.model.claim(1, 30);
  const processor = createProcesamientoService({
    model: services.model,
    config,
    provider: { consultarResultado: async () => ({ estado: 'PENDIENTE', operacionId: id }) },
    documentos: {
      generate: async () => {
        assert.fail('No debe generar documentos pendientes');
      },
    },
  });
  await processor.process(record);
  const detail = await services.comprobantes.detail(id);
  assert.equal(detail.estadoDocumentos, 'NO_HABILITADOS');
  assert.equal(detail.documentos.length, 0);
  assert.equal(detail.entregas.length, 0);
});

test('un PDF fallido agota reintentos conservando emision y luego se recupera sin proveedor', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  const [record] = await services.model.claim(1, 30);
  const processor = createProcesamientoService({
    model: services.model,
    provider: services.provider,
    config: { ...config, maxAttempts: 1 },
    documentos: createDocumentosService({
      files: services.files,
      pdf: {
        render: async () => {
          throw new Error('Motor PDF indisponible');
        },
      },
    }),
  });
  await processor.process(record);
  const failed = await services.model.get(id);
  assert.equal(failed.estado, 'REQUIERE_ATENCION');
  assert.equal(failed.estado_fiscal, 'SIMULADO');
  assert.equal(failed.estado_documentos, 'ERROR');
  await services.model.retry(id, 'contador');
  const [retry] = await services.model.claim(1, 30);
  const recovery = createProcesamientoService({
    model: services.model,
    config,
    documentos: services.documentos,
    provider: {
      consultarResultado: async () => {
        assert.fail('No debe volver al proveedor');
      },
      solicitarEmision: async () => {
        assert.fail('No debe emitir nuevamente');
      },
    },
  });
  await recovery.process(retry);
  const detail = await services.comprobantes.detail(id);
  assert.equal(detail.estadoDocumentos, 'DISPONIBLES');
  assert.equal(detail.numero, failed.resultado_emision.numero);
  assert.equal(detail.fechaEmision, failed.resultado_emision.fechaEmision);
  assert.equal(detail.versionPlantilla, 'simulado-v2');
  assert.equal(detail.entregas.filter((job) => job.tipo === 'CORREO').length, 1);
  assert.equal(detail.entregas.filter((job) => job.tipo === 'BOLETOS').length, 2);
});

test('una reserva vencida no puede persistir una emision ni iniciar documentos', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  const [old] = await services.model.claim(1, 30);
  const result = await services.provider.solicitarEmision(old.payload, id, 1);
  await database.query(
    "UPDATE comprobantes SET reserva_hasta=now()-interval '1 second' WHERE id=$1 RETURNING id",
    [id],
  );
  const [current] = await services.model.claim(1, 30);
  assert.equal(await services.model.saveEmission(old, result), null);
  await services.model.saveEmission(current, result);
  assert.equal(await services.model.startDocuments(old), null);
  await services.procesamiento.process(await services.model.get(id));
  assert.equal((await services.model.get(id)).estado, 'PROCESADO');
});

test('el PDF admite detalle extenso y su regeneracion conserva bytes y fecha de emision', async () => {
  const id = (
    await services.comprobantes.receive(
      createDemoPurchase({ tipoComprobante: 'FACTURA', cantidad: 30 }),
    )
  ).comprobante.id;
  const [record] = await services.model.claim(1, 30);
  const result = await services.provider.solicitarEmision(record.payload, id, 1);
  const confirmed = await services.model.saveEmission(record, result);
  const first = await services.pdf.render(confirmed);
  const second = await services.pdf.render(confirmed);
  assert.deepEqual(first.content, second.content);
  const pdf = await PDFDocument.load(first.content);
  assert.ok(pdf.getPageCount() > 1);
  assert.match(pdf.getTitle(), /FACTURA DE PRUEBA PRUEBA-/);
  assert.equal(
    pdf.getCreationDate().toISOString(),
    new Date(result.fechaEmision).toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  );
});

test('los documentos se protegen por autenticacion y verificacion de integridad', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  await services.worker.tick();
  const path = `/api/v1/comprobantes/${id}/documentos/PDF`;
  assert.equal((await request(path)).status, 401);
  const cookie = await login();
  const response = await request(path, { cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  const document = await services.model.document(id, 'PDF');
  await writeFile(join(config.documentDirectory, document.clave), 'archivo alterado');
  assert.equal((await request(path, { cookie })).status, 503);
});

test('el acceso humano usa cookie HttpOnly y las acciones verifican el origen', async () => {
  const cookie = await login();
  const payload = {
    modalidad: 'NORMAL',
    tipoComprobante: 'BOLETA',
    cantidad: 2,
    escenarioPrueba: 'EXITO',
  };
  assert.equal(
    (
      await request('/api/v1/pruebas/compras', {
        method: 'POST',
        cookie,
        body: payload,
        origin: 'https://otro.example',
      })
    ).status,
    403,
  );
  const response = await request('/api/v1/pruebas/compras', {
    method: 'POST',
    cookie,
    body: payload,
    origin: config.appOrigin,
  });
  assert.equal(response.status, 202);
  assert.equal((await request('/api/v1/auth/sesion', { cookie })).status, 200);
  assert.equal(
    (await request('/api/v1/auth/sesion', { method: 'DELETE', cookie, origin: config.appOrigin }))
      .status,
    204,
  );
  assert.equal((await request('/api/v1/auth/sesion', { cookie })).status, 401);
});

test('la consulta aplica fecha de Lima, filtros y paginacion estable', async () => {
  const first = await services.comprobantes.receive(
    createDemoPurchase({ modalidad: 'EXPRESS', tipoComprobante: 'FACTURA' }),
  );
  await services.comprobantes.receive(createDemoPurchase());
  await database.query(
    'UPDATE comprobantes SET creado_en=$2::timestamptz WHERE id=$1 RETURNING id',
    [first.comprobante.id, '2026-10-30T02:00:00Z'],
  );
  const query = {
    pagina: 1,
    limite: 1,
    fecha: '2026-10-29',
    modalidad: 'EXPRESS',
    tipo: 'FACTURA',
  };
  const result = await services.comprobantes.list(query);
  assert.equal(result.resumen.total, 1);
  assert.equal(result.datos[0].id, first.comprobante.id);
  assert.equal((await services.comprobantes.list({ pagina: 2, limite: 1 })).datos.length, 1);
});

test('la notificacion usa destino configurado, clave de integracion e identificador estable', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  await services.worker.tick();
  const detail = await services.comprobantes.detail(id);
  let sent;
  const callback = createIntegracionBoletosService(
    { callbackUrl: 'https://boletos.example/callback', callbackKey: integrationKey },
    async (url, options) => {
      sent = { url, options };
      return new Response(null, { status: 204 });
    },
  );
  const job = { id: randomUUID() };
  assert.equal(await callback.notify(job, detail), 'ENVIADO');
  assert.equal(sent.options.headers['idempotency-key'], job.id);
  assert.equal(sent.options.headers['x-api-key'], integrationKey);
  assert.equal(JSON.parse(sent.options.body).compraId, detail.compraId);
});

test('una falla de correo no altera la emision y su entrega se puede recuperar', async () => {
  const id = (await services.comprobantes.receive(createDemoPurchase())).comprobante.id;
  const [record] = await services.model.claim(1, 30);
  await services.procesamiento.process(record);
  const jobs = await services.deliveryModel.claim(10, 30);
  const mail = jobs.find((job) => job.tipo === 'CORREO');
  const sender = createEntregaService({
    model: services.deliveryModel,
    comprobantes: services.comprobantes,
    correo: {
      send: async () => {
        throw new Error('Correo indisponible');
      },
    },
    integracion: {},
    config: { maxAttempts: 1 },
  });
  await sender.process(mail);
  assert.equal((await services.model.get(id)).estado, 'PROCESADO');
  const recovered = await services.comprobantes.retryDeliveries(id, 'contador');
  assert.equal(recovered.entregas, 1);
  await services.worker.tick();
  const detail = await services.comprobantes.detail(id);
  assert.equal(detail.entregas.find((item) => item.tipo === 'CORREO').estado, 'CAPTURADO_PRUEBA');
});

test('la version corregida de uuid mantiene las funciones usadas por Sequelize', async () => {
  const require = createRequire(import.meta.url);
  const sequelizeRequire = createRequire(require.resolve('sequelize'));
  const uuid = sequelizeRequire('uuid');
  assert.match(uuid.v1(), /^[a-f0-9-]{36}$/);
  assert.match(uuid.v4(), /^[a-f0-9-]{36}$/);
});

test('recepciones simultaneas de una compra conservan un solo registro', async () => {
  const payload = createDemoPurchase({ cantidad: 4 });
  const received = await Promise.all(
    Array.from({ length: 10 }, () => services.comprobantes.receive(payload)),
  );
  assert.equal(new Set(received.map((item) => item.comprobante.id)).size, 1);
  assert.equal(received.filter((item) => !item.duplicado).length, 1);
  assert.equal(
    (await database.query('SELECT count(*)::int AS total FROM comprobantes'))[0].total,
    1,
  );
});

test('la compra pendiente sobrevive al cierre y reapertura de la base local', async () => {
  const path = join(directory, 'persistencia');
  const localConfig = { ...config, databaseDriver: 'pglite', dataDirectory: path };
  const first = await createDatabase(localConfig);
  await assert.rejects(createDatabase(localConfig), /Otro proceso usa esta base PGlite/);
  await migrate(first);
  const initial = createApplicationServices(first, config);
  const receipt = await initial.comprobantes.receive(createDemoPurchase({ cantidad: 2 }));
  await first.close();
  const reopened = await createDatabase(localConfig);
  try {
    await migrate(reopened);
    const recovered = createApplicationServices(reopened, config);
    assert.equal((await recovered.model.get(receipt.comprobante.id)).estado, 'PENDIENTE');
    await recovered.worker.tick();
    assert.equal((await recovered.model.get(receipt.comprobante.id)).estado, 'PROCESADO');
  } finally {
    await reopened.close();
  }
});

test('la confirmacion sobrevive al reinicio y recupera el PDF con el proveedor desconectado', async () => {
  const localConfig = {
    ...config,
    databaseDriver: 'pglite',
    dataDirectory: join(directory, 'confirmacion-persistente'),
  };
  const first = await createDatabase(localConfig);
  let id, result;
  try {
    await migrate(first);
    const initial = createApplicationServices(first, localConfig);
    id = (await initial.comprobantes.receive(createDemoPurchase({ cantidad: 2 }))).comprobante.id;
    const [record] = await initial.model.claim(1, 30);
    result = await initial.provider.solicitarEmision(record.payload, id, 1);
    await initial.model.saveEmission(record, result);
    // Simula interrupcion despues del commit de emision, sin PDF ni entregas.
  } finally {
    await first.close();
  }
  const reopened = await createDatabase(localConfig);
  try {
    await migrate(reopened);
    const recovered = createApplicationServices(reopened, localConfig);
    await reopened.query(
      "UPDATE comprobantes SET reserva_hasta=now()-interval '1 second' WHERE id=$1 RETURNING id",
      [id],
    );
    const [record] = await recovered.model.claim(1, 30);
    assert.equal(record.estado_documentos, 'PENDIENTES');
    const processor = createProcesamientoService({
      model: recovered.model,
      documentos: recovered.documentos,
      config: localConfig,
      provider: {
        consultarResultado: async () => {
          assert.fail('El proveedor no debe ser consultado tras recuperar la confirmacion');
        },
      },
    });
    await processor.process(record);
    const detail = await recovered.comprobantes.detail(id);
    assert.equal(detail.estado, 'PROCESADO');
    assert.equal(detail.estadoDocumentos, 'DISPONIBLES');
    assert.equal(detail.numero, result.numero);
    assert.equal(detail.fechaEmision, result.fechaEmision);
    assert.equal(detail.documentos.length, 3);
    assert.equal(detail.entregas.filter((job) => job.tipo === 'CORREO').length, 1);
    assert.equal(
      (await recovered.comprobantes.download(id, 'XML')).content.toString(),
      result.documentos.find((doc) => doc.tipo === 'XML').contenido,
    );
  } finally {
    await reopened.close();
  }
});
