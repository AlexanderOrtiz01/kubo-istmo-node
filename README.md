# Istmo Express · Rastreo de envíos (Node.js + Express + PostgreSQL)

Cliente 2 de **Kubo PaaS** (plan premium). API RESTful de envíos entre El Salvador, Guatemala y Honduras, con una
página de rastreo que la consume.

| | |
|---|---|
| Stack | Node.js 22 · Express 5 · PostgreSQL 17 (base administrada por Kubo) · driver `pg` |
| URL pública | https://istmo.kubo.dpdns.org |
| Despliegue | Kubo vigila la rama `main`: cada `git push` construye la imagen con este `Dockerfile` y la despliega |

## Variables de entorno

| Variable | Quién la define | Dónde |
|---|---|---|
| `DATABASE_URL` (y `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) | Kubo | Secret de la base administrada, inyectado en el pod |
| `TZ` u otras de la empresa | El cliente | Panel de Kubo → *Variables de entorno* |
| `KUBO_COMMIT`, `KUBO_POD` | Kubo | Commit desplegado y réplica que atiende |

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/envios?estado=` | Lista de envíos (filtro opcional) |
| GET | `/api/envios/:guia` | Un envío con su historial de eventos |
| POST | `/api/envios` | Crea un envío (`remitente`, `destinatario`, `origen`, `destino`, `peso_kg`) y genera la guía |
| PATCH | `/api/envios/:guia` | Actualiza campos o el `estado` (registra un evento) |
| DELETE | `/api/envios/:guia` | Elimina el envío |
| GET | `/api/info`, `/salud` | Versiones de Node, Express y PostgreSQL, pod y commit |

```bash
curl -X POST https://istmo.kubo.dpdns.org/api/envios -H 'Content-Type: application/json' \
  -d '{"remitente":"Café Montaña","destinatario":"Hotel Copán","origen":"Santa Ana, SV","destino":"Copán, HN","peso_kg":12}'
```

La imagen corre sin root (UID 1000) en el puerto 3000. Las tablas se crean al arrancar si no existen.
El pie de la página muestra el commit en línea: así se comprueba que cada `git push` llegó a producción.
