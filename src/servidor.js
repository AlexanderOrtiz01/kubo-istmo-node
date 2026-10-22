// Istmo Express: API REST de envíos y rastreo. Desplegada en Kubo PaaS (plan premium).
import express from "express";
import os from "node:os";
import { createRequire } from "node:module";
import { pool, ESTADOS, esperarBase, migrar } from "./bd.js";

const require = createRequire(import.meta.url);
const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(express.static(new URL("../public", import.meta.url).pathname));

const RE_GUIA = /^IX-\d{7}$/;
const texto = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

function validar(b, parcial = false) {
  const errores = [];
  const campos = { remitente: 120, destinatario: 120, origen: 80, destino: 80 };
  for (const [c, max] of Object.entries(campos))
    if ((!parcial || c in b) && !texto(b[c], max)) errores.push(`${c}: obligatorio, hasta ${max} caracteres`);
  if ((!parcial || "peso_kg" in b) && !(Number(b.peso_kg) > 0 && Number(b.peso_kg) < 100000)) errores.push("peso_kg: número mayor que 0");
  if ("estado" in b && !ESTADOS.includes(b.estado)) errores.push(`estado: uno de ${ESTADOS.join(", ")}`);
  return errores;
}

const envuelve = (fn) => (req, res, next) => fn(req, res).catch(next);

// ── CRUD de envíos ──
app.get("/api/envios", envuelve(async (req, res) => {
  const { estado } = req.query;
  const { rows } = estado
    ? await pool.query("SELECT * FROM envios WHERE estado = $1 ORDER BY actualizado DESC", [estado])
    : await pool.query("SELECT * FROM envios ORDER BY actualizado DESC LIMIT 200");
  res.json(rows);
}));

app.get("/api/envios/:guia", envuelve(async (req, res) => {
  const { rows: [envio] } = await pool.query("SELECT * FROM envios WHERE guia = $1", [req.params.guia]);
  if (!envio) return res.status(404).json({ error: "Guía no encontrada" });
  const { rows: eventos } = await pool.query("SELECT estado, nota, fecha FROM eventos WHERE envio_id = $1 ORDER BY fecha, id", [envio.id]);
  res.json({ ...envio, eventos });
}));

app.post("/api/envios", envuelve(async (req, res) => {
  const b = req.body || {};
  const errores = validar(b);
  if (errores.length) return res.status(400).json({ errores });
  const { rows: [{ n }] } = await pool.query("SELECT nextval(pg_get_serial_sequence('envios','id')) AS n");
  const guia = `IX-${String(240000 + Number(n) * 37).padStart(7, "0")}`;
  const { rows: [envio] } = await pool.query(
    "INSERT INTO envios (id, guia, remitente, destinatario, origen, destino, peso_kg) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [n, guia, b.remitente.trim(), b.destinatario.trim(), b.origen.trim(), b.destino.trim(), Number(b.peso_kg)]);
  await pool.query("INSERT INTO eventos (envio_id, estado, nota) VALUES ($1, 'registrado', 'Guía generada')", [envio.id]);
  res.status(201).location(`/api/envios/${guia}`).json(envio);
}));

app.patch("/api/envios/:guia", envuelve(async (req, res) => {
  const b = req.body || {};
  const errores = validar(b, true);
  if (errores.length) return res.status(400).json({ errores });
  const campos = ["remitente", "destinatario", "origen", "destino", "peso_kg", "estado"].filter((c) => c in b);
  if (!campos.length) return res.status(400).json({ errores: ["Nada que actualizar"] });
  const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const { rows: [envio] } = await pool.query(
    `UPDATE envios SET ${sets}, actualizado = now() WHERE guia = $1 RETURNING *`,
    [req.params.guia, ...campos.map((c) => (c === "peso_kg" ? Number(b[c]) : String(b[c]).trim()))]);
  if (!envio) return res.status(404).json({ error: "Guía no encontrada" });
  if ("estado" in b)
    await pool.query("INSERT INTO eventos (envio_id, estado, nota) VALUES ($1,$2,$3)", [envio.id, b.estado, texto(b.nota, 200) ? b.nota.trim() : null]);
  res.json(envio);
}));

app.delete("/api/envios/:guia", envuelve(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM envios WHERE guia = $1", [req.params.guia]);
  if (!rowCount) return res.status(404).json({ error: "Guía no encontrada" });
  res.status(204).end();
}));

// ── Plataforma: lo que corre de verdad (para comprobar el despliegue en Kubo) ──
async function info() {
  const { rows: [r] } = await pool.query("SHOW server_version");
  return {
    "Node.js": process.versions.node,
    Express: require("express/package.json").version,
    PostgreSQL: r.server_version.split(" ")[0],
    "pg (driver)": require("pg/package.json").version,
    Pod: process.env.KUBO_POD || os.hostname(),
    Commit: (process.env.KUBO_COMMIT || "local").slice(0, 7),
  };
}
app.get("/api/info", envuelve(async (req, res) => res.json(await info())));
app.get("/salud", envuelve(async (req, res) => res.json({ estado: "ok", ...(await info()) })));

app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ errores: ["JSON mal formado"] });
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

const PUERTO = Number(process.env.PORT || 3000);
await esperarBase();
await migrar();
const servidor = app.listen(PUERTO, () => console.log(`Istmo Express escuchando en :${PUERTO}`));
process.on("SIGTERM", () => servidor.close(() => pool.end().then(() => process.exit(0))));
