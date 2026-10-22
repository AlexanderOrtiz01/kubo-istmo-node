// Conexión a la base de datos administrada de Kubo (PostgreSQL 17).
// Kubo inyecta DATABASE_URL (y DB_HOST, DB_PORT…) desde el Secret de la base: nada va en el código.
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL: en Kubo la inyecta la base de datos administrada del plan");
  process.exit(1);
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

export const ESTADOS = ["registrado", "en_bodega", "en_transito", "en_aduana", "en_reparto", "entregado", "devuelto"];

export async function esperarBase() {
  for (let i = 1; ; i++) {
    try { await pool.query("SELECT 1"); return; } catch (e) {
      if (i >= 60) throw e;
      console.log(`Esperando a PostgreSQL (${i})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Migración idempotente + datos de ejemplo la primera vez
export async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS envios (
      id           serial PRIMARY KEY,
      guia         varchar(16) UNIQUE NOT NULL,
      remitente    varchar(120) NOT NULL,
      destinatario varchar(120) NOT NULL,
      origen       varchar(80) NOT NULL,
      destino      varchar(80) NOT NULL,
      peso_kg      numeric(8,2) NOT NULL CHECK (peso_kg > 0),
      estado       varchar(20) NOT NULL DEFAULT 'registrado',
      creado       timestamptz NOT NULL DEFAULT now(),
      actualizado  timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS eventos (
      id       serial PRIMARY KEY,
      envio_id integer NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
      estado   varchar(20) NOT NULL,
      nota     varchar(200),
      fecha    timestamptz NOT NULL DEFAULT now()
    );`);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM envios");
  if (rows[0].n > 0) return;
  const ejemplos = [
    ["Ferretería La Bisagra", "Constructora Maya", "San Miguel, SV", "Ciudad de Guatemala, GT", 42.5, "en_aduana"],
    ["Café Montaña Alta", "Tostaduría Copán", "Santa Ana, SV", "Copán Ruinas, HN", 18, "en_transito"],
    ["Textiles del Lempa", "Boutique Zona 10", "San Salvador, SV", "Ciudad de Guatemala, GT", 7.25, "entregado"],
    ["Farmacia San Rafael", "Clínica Los Próceres", "San Salvador, SV", "Tegucigalpa, HN", 3.4, "en_reparto"],
    ["Distribuidora Chorti", "Agroservicio El Sol", "Chiquimula, GT", "Usulután, SV", 25, "registrado"],
  ];
  for (const [i, [rem, des, ori, dst, peso, estado]] of ejemplos.entries()) {
    const guia = `IX-${String(240100 + i * 37).padStart(7, "0")}`;
    const { rows: [e] } = await pool.query(
      "INSERT INTO envios (guia, remitente, destinatario, origen, destino, peso_kg, estado) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [guia, rem, des, ori, dst, peso, estado]);
    for (const paso of ESTADOS.slice(0, ESTADOS.indexOf(estado) + 1).filter((s) => s !== "devuelto"))
      await pool.query("INSERT INTO eventos (envio_id, estado, nota) VALUES ($1,$2,$3)", [e.id, paso, "Carga inicial"]);
  }
  console.log("Datos de ejemplo cargados");
}
