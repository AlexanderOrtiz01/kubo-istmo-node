const ESTADOS = {
  registrado: "Registrado", en_bodega: "En bodega", en_transito: "En tránsito", en_aduana: "En aduana",
  en_reparto: "En reparto", entregado: "Entregado", devuelto: "Devuelto",
};
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (f) => new Date(f).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" });

async function api(url, opciones = {}) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opciones });
  const cuerpo = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(cuerpo?.errores?.join(" · ") || cuerpo?.error || `Error ${r.status}`);
  return cuerpo;
}

const opciones = (actual) => Object.entries(ESTADOS)
  .map(([v, t]) => `<option value="${v}" ${v === actual ? "selected" : ""}>${t}</option>`).join("");

async function cargar() {
  const filtro = $("#filtro").value;
  const envios = await api(`/api/envios${filtro ? `?estado=${filtro}` : ""}`);
  $("#filas").innerHTML = envios.length ? envios.map((e) => `
    <tr>
      <td><a href="#" data-ver="${esc(e.guia)}"><code>${esc(e.guia)}</code></a></td>
      <td>${esc(e.origen)} → ${esc(e.destino)}</td>
      <td>${esc(e.destinatario)}</td>
      <td class="num">${Number(e.peso_kg).toFixed(2)} kg</td>
      <td><select data-estado="${esc(e.guia)}" class="estado-${e.estado}">${opciones(e.estado)}</select></td>
      <td><button class="borrar" data-borrar="${esc(e.guia)}" aria-label="Eliminar ${esc(e.guia)}">Eliminar</button></td>
    </tr>`).join("") : `<tr><td colspan="6" class="vacio">Sin envíos.</td></tr>`;
}

async function ver(guia) {
  const d = $("#detalle");
  try {
    const e = await api(`/api/envios/${encodeURIComponent(guia)}`);
    d.innerHTML = `
      <div class="cabecera"><h2>Guía <code>${esc(e.guia)}</code></h2><span class="pastilla estado-${e.estado}">${ESTADOS[e.estado]}</span></div>
      <p>${esc(e.remitente)} → <b>${esc(e.destinatario)}</b> · ${esc(e.origen)} → ${esc(e.destino)} · ${Number(e.peso_kg).toFixed(2)} kg</p>
      <ol class="linea">${e.eventos.map((v) => `<li><b>${ESTADOS[v.estado] || v.estado}</b> <span>${fecha(v.fecha)}</span>${v.nota ? ` · ${esc(v.nota)}` : ""}</li>`).join("")}</ol>`;
  } catch (err) {
    d.innerHTML = `<p class="error">${esc(err.message)}: ${esc(guia)}</p>`;
  }
  d.hidden = false;
  d.scrollIntoView({ behavior: "smooth" });
}

$("#rastrear").addEventListener("submit", (ev) => { ev.preventDefault(); ver($("#guia").value.trim().toUpperCase()); });
$("#filtro").innerHTML += opciones("");
$("#filtro").addEventListener("change", cargar);

$("#filas").addEventListener("click", async (ev) => {
  const v = ev.target.closest("[data-ver]");
  if (v) { ev.preventDefault(); return ver(v.dataset.ver); }
  const b = ev.target.closest("[data-borrar]");
  if (b && confirm(`¿Eliminar la guía ${b.dataset.borrar}?`)) {
    await api(`/api/envios/${b.dataset.borrar}`, { method: "DELETE" });
    cargar();
  }
});
$("#filas").addEventListener("change", async (ev) => {
  const s = ev.target.closest("[data-estado]");
  if (!s) return;
  await api(`/api/envios/${s.dataset.estado}`, { method: "PATCH", body: JSON.stringify({ estado: s.value, nota: "Actualizado desde el panel" }) });
  cargar();
});

$("#nuevo").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("#errores").textContent = "";
  try {
    const e = await api("/api/envios", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(ev.target))) });
    ev.target.reset();
    await cargar();
    ver(e.guia);
  } catch (err) { $("#errores").textContent = err.message; }
});

api("/api/info").then((i) => {
  $("#stack").innerHTML = Object.entries(i).map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join("");
}).catch(() => {});
cargar();
