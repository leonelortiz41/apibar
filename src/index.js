import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql2 from "mysql2";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import {
  DB_HOST,
  DB_USER,
  DB_DATABASE,
  DB_PASSWORD,
  DB_PORT,
  PORT
} from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROOT = path.join(__dirname, "uploads");
const MENU_UPLOADS_DIR = path.join(UPLOADS_ROOT, "menu");
fs.mkdirSync(MENU_UPLOADS_DIR, { recursive: true });

const MIME_A_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const app = express();

const ZONA_HORARIA = "America/Argentina/Tucuman";

const CATEGORIAS_PERMITIDAS = new Set([
  "milanesas",
  "hamburguesas",
  "lomitos",
  "pizzas",
  "empanadas",
  "papas",
  "platos",
  "bebidas"
]);

const pedidosPorIP = new Map();
const pedidosPorTelefono = new Map();

// Mapa en memoria sincronizado con la tabla `mesas_tokens` (no se expone en GET /configuracion-web)
let mapaTokensMesa = new Map();

function generarTokenCorto() {
  return crypto.randomInt(100000, 999999).toString();
}

const esTokenMesaValido = (tokenRecibido, tokenVigente) => {
  const recibido = String(tokenRecibido || "").trim();
  const vigente = String(tokenVigente || "").trim();
  if (!recibido || !vigente) return false;

  const bufRecibido = Buffer.from(recibido, "utf8");
  const bufVigente = Buffer.from(vigente, "utf8");
  if (bufRecibido.length !== bufVigente.length) return false;

  return crypto.timingSafeEqual(bufRecibido, bufVigente);
};

const guardarImagenMenuEnDisco = (inputImagen, categoria, idProducto) => {
  if (!inputImagen || typeof inputImagen !== "string") {
    return { error: null, ruta: null };
  }

  const trimmed = inputImagen.trim();
  if (trimmed.startsWith("/uploads/menu/")) {
    return { error: null, ruta: trimmed };
  }

  let mimeType = "image/webp";
  let base64Limpio = trimmed;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Limpio = dataUrlMatch[2];
  } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { error: null, ruta: trimmed };
  }

  const extension = MIME_A_EXTENSION[mimeType];
  if (!extension) {
    return {
      error: "Formato de imagen no permitido. Usá JPG, PNG o WEBP.",
      ruta: null
    };
  }

  const buffer = Buffer.from(base64Limpio, "base64");
  const maxBytes = 2.5 * 1024 * 1024;
  if (!buffer.length || buffer.length > maxBytes) {
    return {
      error: "La imagen supera el tamaño máximo permitido (2.5 MB).",
      ruta: null
    };
  }

  const nombreArchivo = `${categoria}-${idProducto}-${Date.now()}-${crypto
    .randomBytes(3)
    .toString("hex")}${extension}`;
  const rutaAbsoluta = path.join(MENU_UPLOADS_DIR, nombreArchivo);
  fs.writeFileSync(rutaAbsoluta, buffer);

  return {
    error: null,
    ruta: `/uploads/menu/${nombreArchivo}`
  };
};

const eliminarArchivoMenuSiExiste = (rutaRelativa) => {
  if (!rutaRelativa || typeof rutaRelativa !== "string") return;
  if (!rutaRelativa.startsWith("/uploads/menu/")) return;

  const nombreSeguro = path.basename(rutaRelativa);
  const rutaAbsoluta = path.join(MENU_UPLOADS_DIR, nombreSeguro);
  if (rutaAbsoluta.startsWith(MENU_UPLOADS_DIR) && fs.existsSync(rutaAbsoluta)) {
    try {
      fs.unlinkSync(rutaAbsoluta);
    } catch (err) {
      console.error("No se pudo eliminar imagen anterior:", err);
    }
  }
};

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(UPLOADS_ROOT, { maxAge: "7d" }));

const conection = mysql2.createConnection({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  port: DB_PORT
});

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    conection.query(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const cargarMapaTokensMesa = async () => {
  const rows = await queryAsync(
    "SELECT numero_mesa, token, activa FROM mesas_tokens"
  );
  const nuevoMapa = new Map();
  for (const row of rows) {
    const num = Number(row.numero_mesa);
    if (Number.isInteger(num) && num > 0) {
      nuevoMapa.set(num, {
        token: String(row.token || "").trim(),
        activa: Boolean(row.activa)
      });
    }
  }
  mapaTokensMesa = nuevoMapa;
  return mapaTokensMesa;
};

const rotarTokensMesa = async (numeroMesa = null) => {
  const mesaPuntual =
    numeroMesa != null && Number.isInteger(Number(numeroMesa)) && Number(numeroMesa) > 0
      ? Number(numeroMesa)
      : null;

  if (mesaPuntual !== null) {
    const nuevoToken = generarTokenCorto();
    await queryAsync(
      "UPDATE mesas_tokens SET token = ? WHERE numero_mesa = ?",
      [nuevoToken, mesaPuntual]
    );
    await cargarMapaTokensMesa();
    return { [String(mesaPuntual)]: nuevoToken };
  }

  const rows = await queryAsync("SELECT numero_mesa FROM mesas_tokens");
  const actualizados = {};
  for (const row of rows) {
    const num = Number(row.numero_mesa);
    const nuevoToken = generarTokenCorto();
    await queryAsync(
      "UPDATE mesas_tokens SET token = ? WHERE numero_mesa = ?",
      [nuevoToken, num]
    );
    actualizados[String(num)] = nuevoToken;
  }
  await cargarMapaTokensMesa();
  return actualizados;
};

conection.connect(async (err) => {
  if (err) {
    console.error("Error de conexión a MySQL:", err);
    process.exit(1);
  }
  console.log("La conexión a la base de datos es exitosa");
  try {
    await cargarMapaTokensMesa();
  } catch (loadErr) {
    console.error("Error al cargar mesas_tokens:", loadErr);
  }
});

const limpiarTelefono = (tel = "") => String(tel).replace(/\D/g, "");

const esTelefonoValido = (tel = "") => {
  const limpio = limpiarTelefono(tel);
  if (limpio.length < 8 || limpio.length > 13) return false;
  if (/^(.)\1+$/.test(limpio)) return false;
  if (["12345678", "123456789", "1234567890", "0987654321"].includes(limpio)) {
    return false;
  }
  return true;
};

const registrarIntento = (mapa, clave, ventanaMs = 15 * 60 * 1000) => {
  const ahora = Date.now();
  const previos = (mapa.get(clave) || []).filter((ts) => ahora - ts < ventanaMs);
  previos.push(ahora);
  mapa.set(clave, previos);
  return previos.length;
};

const parseIdsPausados = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const obtenerHoraMinutoZona = (timeZone = ZONA_HORARIA) => {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  return {
    hora: Number(partes.find((p) => p.type === "hour")?.value || 0),
    minuto: Number(partes.find((p) => p.type === "minute")?.value || 0)
  };
};

const esHoraCorteExacta = (timeZone = ZONA_HORARIA) => {
  const { hora, minuto } = obtenerHoraMinutoZona(timeZone);
  return hora === 0 && minuto === 30;
};

const verificarCorteAutomaticoWeb = async () => {
  if (!esHoraCorteExacta()) return;

  const rows = await queryAsync(
    "SELECT id, tienda_abierta FROM configuracion_web WHERE id = 1 LIMIT 1"
  );

  if (rows.length && Boolean(rows[0].tienda_abierta)) {
    await queryAsync(
      "UPDATE configuracion_web SET tienda_abierta = 0 WHERE id = 1"
    );
    await rotarTokensMesa();
    console.log("[Auto-Cierre] Tienda web deshabilitada y tokens de mesa rotados a las 00:30.");
  }
};

app.get("/", (req, res) => {
  res.send("welcome");
});

// --- ENVÍO DE REPORTE ---
app.post("/enviar-reporte", async (req, res) => {
  const { pdfBase64, fecha } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "c.leonelortiz10@gmail.com",
      pass: "weqr xjfb lyzn upiq"
    }
  });

  const mailOptions = {
    from: "Bar Los Primos <c.leonelortiz10@gmail.com>",
    to: "zulmalugones21@gmail.com, carlitoleonel@gmail.com",
    subject: `Cierre de Caja - ${fecha}`,
    text: "Se adjunta el reporte de cierre de caja en formato PDF.",
    attachments: [
      {
        filename: `CIERRE_${fecha}.pdf`,
        content: pdfBase64,
        encoding: "base64"
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send("Correo enviado");
  } catch (error) {
    console.error("Error al enviar correo:", error);
    res.status(500).send(error.message);
  }
});

// --- VALIDACIÓN DE MESA AL CARGAR ---
app.get("/validar-mesa", async (req, res) => {
  try {
    const numeroMesa = Number.parseInt(String(req.query?.mesa ?? ""), 10);
    const tokenRecibido = String(req.query?.token ?? "").trim();

    if (
      !Number.isInteger(numeroMesa) ||
      numeroMesa <= 0 ||
      numeroMesa > 200 ||
      !tokenRecibido
    ) {
      return res.json({ valida: false });
    }

    if (mapaTokensMesa.size === 0) {
      await cargarMapaTokensMesa();
    }

    const registroMesa = mapaTokensMesa.get(numeroMesa);
    const valida = Boolean(
      registroMesa &&
      registroMesa.activa &&
      esTokenMesaValido(tokenRecibido, registroMesa.token)
    );

    res.json({ valida });
  } catch (err) {
    console.error("Error en GET /validar-mesa:", err);
    res.status(500).json({ valida: false });
  }
});

// --- CONFIGURACIÓN APP DE CLIENTES ---
app.get("/configuracion-web", async (req, res) => {
  try {
    const rows = await queryAsync("SELECT * FROM configuracion_web WHERE id = 1 LIMIT 1");

    if (!rows.length) {
      return res.json({
        tiendaAbierta: false,
        envioActivo: true,
        retiroActivo: true,
        mensajeCierre: "Estamos cerrados por el momento. Volvé a intentar más tarde.",
        idsPausadosWeb: []
      });
    }
    const row = rows[0];
    res.json({
      tiendaAbierta: Boolean(row.tienda_abierta),
      envioActivo: Boolean(row.envio_activo),
      retiroActivo: Boolean(row.retiro_activo),
      mensajeCierre: row.mensaje_cierre || "",
      idsPausadosWeb: parseIdsPausados(row.ids_pausados_web)
    });
  } catch (err) {
    console.error("Error en GET /configuracion-web:", err);
    res.status(500).json({ error: "Error al leer configuración web" });
  }
});

app.put("/configuracion-web", async (req, res) => {
  try {
    const {
      tiendaAbierta = false,
      envioActivo = true,
      retiroActivo = true,
      mensajeCierre = "Estamos cerrados por el momento. Volvé a intentar más tarde.",
      idsPausadosWeb = [],
      rotarTokens = false
    } = req.body || {};

    const pausadosLimpios = Array.isArray(idsPausadosWeb) ? idsPausadosWeb : [];

    await queryAsync(
      `INSERT INTO configuracion_web
        (id, tienda_abierta, envio_activo, retiro_activo, mensaje_cierre, ids_pausados_web)
       VALUES (1, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        tienda_abierta = VALUES(tienda_abierta),
        envio_activo = VALUES(envio_activo),
        retiro_activo = VALUES(retiro_activo),
        mensaje_cierre = VALUES(mensaje_cierre),
        ids_pausados_web = VALUES(ids_pausados_web)`,
      [
        tiendaAbierta ? 1 : 0,
        envioActivo ? 1 : 0,
        retiroActivo ? 1 : 0,
        String(mensajeCierre).trim(),
        JSON.stringify(pausadosLimpios)
      ]
    );

    if (rotarTokens) {
      await rotarTokensMesa();
    }

    res.json({
      ok: true,
      tiendaAbierta: Boolean(tiendaAbierta),
      envioActivo: Boolean(envioActivo),
      retiroActivo: Boolean(retiroActivo),
      mensajeCierre: String(mensajeCierre).trim(),
      idsPausadosWeb: pausadosLimpios
    });
  } catch (err) {
    console.error("Error en PUT /configuracion-web:", err);
    res.status(500).json({ error: "Error al guardar configuración web" });
  }
});

app.post("/configuracion-web/rotar-tokens", async (req, res) => {
  try {
    const mesaPuntual = req.body?.mesa ?? null;
    const tokensActualizados = await rotarTokensMesa(mesaPuntual);
    res.json({
      ok: true,
      tokensActualizados,
      actualizadoEn: Date.now()
    });
  } catch (err) {
    console.error("Error en POST /configuracion-web/rotar-tokens:", err);
    res.status(500).json({ error: "Error al rotar tokens de mesa" });
  }
});

// --- PEDIDOS ---
app.get("/pedidos", async (req, res) => {
  try {
    const rows = await queryAsync("SELECT * FROM pedidos");
    res.json(rows);
  } catch (err) {
    console.error("Error en GET /pedidos:", err);
    res.status(500).send("Error de servidor");
  }
});

app.post("/pedidos", async (req, res) => {
  try {
    const body = req.body || {};

    // 1. Honeypot anti-bots
    if (body.honeypot && String(body.honeypot).trim() !== "") {
      return res.status(200).json({ ok: true, ignorado: true });
    }

    const esPedidoMesa =
      String(body.tipoEntrega || "").toUpperCase() === "MESA" ||
      String(body.origen || "").toUpperCase() === "MESA_QR" ||
      body.mesa != null;

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      "sin-ip";

    if (esPedidoMesa) {
      const numeroMesa = Number.parseInt(String(body.mesa ?? ""), 10);
      const tokenRecibido = body.token;

      if (!Number.isInteger(numeroMesa) || numeroMesa <= 0 || numeroMesa > 200) {
        return res.status(400).json({ error: "Número de mesa inválido." });
      }

      if (mapaTokensMesa.size === 0) {
        await cargarMapaTokensMesa();
      }

      const registroMesa = mapaTokensMesa.get(numeroMesa);
      if (
        !registroMesa ||
        !registroMesa.activa ||
        !esTokenMesaValido(tokenRecibido, registroMesa.token)
      ) {
        return res.status(403).json({
          error: "El código de mesa venció o no es válido. Escaneá el QR de la mesa nuevamente."
        });
      }

      if (registrarIntento(pedidosPorIP, `mesa:${ip}`) > 10) {
        return res.status(429).json({
          error: "Se alcanzó el límite de pedidos desde esta mesa. Consultá en caja."
        });
      }
    } else {
      // 2. Si viene desde la tienda web (envío o retiro), validar teléfono y rate limit
      const esPedidoWeb = body.origen === "WEB" || body.telefono !== undefined;
      if (esPedidoWeb) {
        if (!esTelefonoValido(body.telefono)) {
          return res.status(400).json({
            error: "Ingresá un número de teléfono válido con código de área."
          });
        }

        const telLimpio = limpiarTelefono(body.telefono);

        if (
          registrarIntento(pedidosPorIP, ip) > 3 ||
          registrarIntento(pedidosPorTelefono, telLimpio) > 3
        ) {
          return res.status(429).json({
            error: "Se alcanzó el límite de pedidos recientes. Esperá unos minutos o llamá al local."
          });
        }
      }
    }

    const items = Array.isArray(body.pedido) ? body.pedido : [];
    const detalle = items.map((item) => JSON.stringify(item)).join(",");

    await queryAsync(
      `INSERT INTO pedidos
        (cantidad, cliente, detalle, importe, detalleTicket, statu, pagado, pj)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.cantidad ?? 0,
        body.cliente ?? "",
        detalle,
        body.importe ?? 0,
        body.detalleTicket ?? "",
        body.statu ?? "0",
        body.pagado ?? "0",
        body.pj ?? ""
      ]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Error en POST /pedidos:", err);
    res.status(500).json({ error: "Error al guardar el pedido" });
  }
});

app.put("/pedidos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const items = Array.isArray(body.pedido) ? body.pedido : [];
    const detalle = items.map((item) => JSON.stringify(item)).join(",");

    await queryAsync(
      `UPDATE pedidos
       SET cliente = ?, detalle = ?, importe = ?, detalleTicket = ?, cantidad = ?
       WHERE id = ?`,
      [
        body.cliente ?? "",
        detalle,
        body.importe ?? 0,
        body.detalleTicket ?? "",
        body.cantidad ?? 0,
        id
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en PUT /pedidos/:id:", err);
    res.status(500).send("Error al actualizar el pedido");
  }
});

app.delete("/pedidos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await queryAsync("DELETE FROM pedidos WHERE id = ?", [id]);
    res.json({ mensaje: "Pedido eliminado", id });
  } catch (err) {
    console.error("Error al borrar de la DB:", err);
    res.status(500).json({ error: "Error al borrar el pedido" });
  }
});

app.delete("/pedidos", async (req, res) => {
  try {
    await queryAsync("TRUNCATE TABLE pedidos");
    res.send("se borraron los registros");
  } catch (err) {
    console.error("Error al truncar pedidos:", err);
    res.status(500).send("Error al borrar pedidos");
  }
});

app.put("/pj/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await queryAsync("UPDATE pedidos SET pj = ? WHERE id = ?", [req.body?.pj ?? "", id]);
    res.json(req.body);
  } catch (err) {
    console.error("Error en PUT /pj/:id:", err);
    res.status(500).send("Error al actualizar pj");
  }
});

app.put("/statu/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await queryAsync("UPDATE pedidos SET statu = ? WHERE id = ?", [req.body?.statu ?? "", id]);
    res.json(req.body);
  } catch (err) {
    console.error("Error en PUT /statu/:id:", err);
    res.status(500).send("Error al actualizar statu");
  }
});

app.put("/pagado/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await queryAsync("UPDATE pedidos SET pagado = ? WHERE id = ?", [req.body?.pagado ?? "", id]);
    res.json(req.body);
  } catch (err) {
    console.error("Error en PUT /pagado/:id:", err);
    res.status(500).send("Error al actualizar pagado");
  }
});

// --- FECHA ---
app.get("/date", async (req, res) => {
  try {
    const rows = await queryAsync("SELECT * FROM date");
    res.json(rows || "sin fecha");
  } catch (err) {
    console.error("Error en GET /date:", err);
    res.status(500).send("Error al obtener fecha");
  }
});

app.post("/date", async (req, res) => {
  try {
    const { fecha } = req.body || {};
    await queryAsync("INSERT INTO date (fecha) VALUES (?)", [fecha]);
    res.json(req.body);
  } catch (err) {
    console.error("Error en POST /date:", err);
    res.status(500).send("Error al guardar fecha");
  }
});

app.delete("/date", async (req, res) => {
  try {
    await queryAsync("DELETE FROM date");
    res.send("se borro la fecha");
  } catch (err) {
    console.error("Error en DELETE /date:", err);
    res.status(500).send("Error al borrar fecha");
  }
});

// --- REPARTIDORES ---
app.get("/repartidores", async (req, res) => {
  try {
    const rows = await queryAsync("SELECT * FROM repartidores");
    res.json(rows);
  } catch (err) {
    console.error("Error en GET /repartidores:", err);
    res.status(500).send("Error de servidor");
  }
});

app.post("/repartidores", async (req, res) => {
  try {
    const { nombre } = req.body || {};
    if (!nombre) return res.status(400).send("Falta el nombre");
    const result = await queryAsync("INSERT INTO repartidores (nombre) VALUES (?)", [
      String(nombre).trim()
    ]);
    res.status(201).json({ id: result.insertId, nombre: String(nombre).trim() });
  } catch (err) {
    console.error("Error en POST /repartidores:", err);
    res.status(500).send("Error de DB");
  }
});

app.put("/repartidores/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body || {};
    if (!nombre) return res.status(400).send("Falta el nombre");
    await queryAsync("UPDATE repartidores SET nombre = ? WHERE id = ?", [
      String(nombre).trim().toUpperCase(),
      id
    ]);
    res.status(200).send("Repartidor actualizado");
  } catch (err) {
    console.error("Error en PUT /repartidores/:id:", err);
    res.status(500).send("Error al actualizar");
  }
});

app.delete("/repartidores/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await queryAsync("DELETE FROM repartidores WHERE id = ?", [id]);
    res.status(200).send("Repartidor eliminado");
  } catch (err) {
    console.error("Error en DELETE /repartidores/:id:", err);
    res.status(500).send("Error al eliminar repartidor");
  }
});

// --- CONFIGURACIÓN GENERAL ---
app.get("/configuracion", async (req, res) => {
  try {
    const rows = await queryAsync("SELECT * FROM configuracion");
    res.json(rows);
  } catch (err) {
    console.error("Error en GET /configuracion:", err);
    res.status(500).send("Error de servidor");
  }
});

app.post("/configuracion", async (req, res) => {
  try {
    const { atributo, valor, tipo } = req.body || {};
    if (!atributo || valor === undefined || !tipo) {
      return res.status(400).send("Faltan datos: atributo, valor y tipo son obligatorios");
    }

    const atr = String(atributo).trim().toUpperCase();
    const tip = String(tipo).trim().toLowerCase();
    const val = String(valor);

    const result = await queryAsync(
      `INSERT INTO configuracion (atributo, valor, tipo)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor), tipo = VALUES(tipo)`,
      [atr, val, tip]
    );

    const status = result.affectedRows === 1 ? 201 : 200;
    res.status(status).json({
      id: result.insertId || null,
      atributo: atr,
      valor: val,
      tipo: tip
    });
  } catch (err) {
    console.error("Error en POST /configuracion:", err);
    res.status(500).send("Error de base de datos");
  }
});

app.delete("/configuracion/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await queryAsync("DELETE FROM configuracion WHERE id = ?", [id]);
    res.status(200).send("Configuración eliminada");
  } catch (err) {
    console.error("Error en DELETE /configuracion/:id:", err);
    res.status(500).send("Error al eliminar");
  }
});

// --- CATEGORÍAS DE PRODUCTOS ---
app.get("/:product", async (req, res) => {
  const { product } = req.params;
  if (!CATEGORIAS_PERMITIDAS.has(product)) {
    return res.status(404).json({ message: "no se obtuvo respuesta..." });
  }
  try {
    const rows = await queryAsync(`SELECT * FROM ${product}`);
    res.json(rows);
  } catch (err) {
    console.error(`Error en GET /${product}:`, err);
    res.status(500).send("Error de servidor");
  }
});

app.post("/:product", async (req, res) => {
  const { product } = req.params;
  if (!CATEGORIAS_PERMITIDAS.has(product)) {
    return res.status(404).json({ message: "Categoría no válida" });
  }
  const { nombre, precio, imagenBase64, imagen } = req.body || {};
  const nombreLimpio = String(nombre || "").trim();
  if (!nombreLimpio || precio === undefined) {
    return res.status(400).send("Faltan datos");
  }

  try {
    const result = await queryAsync(
      `INSERT INTO ${product} (nombre, precio, imagen) VALUES (?, ?, NULL)`,
      [nombreLimpio, precio]
    );
    const nuevoId = result.insertId;

    const entradaImagen = imagenBase64 ?? imagen ?? null;
    let rutaImagenFinal = null;

    if (entradaImagen) {
      const guardada = guardarImagenMenuEnDisco(entradaImagen, product, nuevoId);
      if (guardada.error) {
        await queryAsync(`DELETE FROM ${product} WHERE id = ?`, [nuevoId]);
        return res.status(400).json({ error: guardada.error });
      }
      rutaImagenFinal = guardada.ruta;
      if (rutaImagenFinal) {
        await queryAsync(
          `UPDATE ${product} SET imagen = ? WHERE id = ?`,
          [rutaImagenFinal, nuevoId]
        );
      }
    }

    res.status(201).json({
      id: nuevoId,
      nombre: nombreLimpio,
      precio,
      imagen: rutaImagenFinal
    });
  } catch (err) {
    console.error(`Error en POST /${product}:`, err);
    res.status(500).send("Error al insertar");
  }
});

app.put("/:product/:id", async (req, res) => {
  const { product, id } = req.params;
  if (!CATEGORIAS_PERMITIDAS.has(product)) {
    return res.status(404).json({ message: "Categoría no válida" });
  }

  try {
    const rows = await queryAsync(
      `SELECT id, nombre, precio, imagen FROM ${product} WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    const actual = rows[0];
    const body = req.body || {};

    const nuevoNombre =
      body.nombre !== undefined ? String(body.nombre).trim() : actual.nombre;
    const nuevoPrecio =
      body.precio !== undefined ? body.precio : actual.precio;

    let nuevaImagen = actual.imagen;
    const entradaImagen = body.imagenBase64 ?? body.imagen;

    if (body.quitarImagen === true || entradaImagen === "") {
      eliminarArchivoMenuSiExiste(actual.imagen);
      nuevaImagen = null;
    } else if (typeof entradaImagen === "string" && entradaImagen.trim() !== "") {
      if (entradaImagen.trim() !== actual.imagen) {
        const guardada = guardarImagenMenuEnDisco(entradaImagen, product, id);
        if (guardada.error) {
          return res.status(400).json({ error: guardada.error });
        }
        if (guardada.ruta && guardada.ruta !== actual.imagen) {
          eliminarArchivoMenuSiExiste(actual.imagen);
          nuevaImagen = guardada.ruta;
        }
      }
    }

    await queryAsync(
      `UPDATE ${product} SET nombre = ?, precio = ?, imagen = ? WHERE id = ?`,
      [nuevoNombre, nuevoPrecio, nuevaImagen, id]
    );

    res.json({
      ...body,
      id: Number(id) || id,
      nombre: nuevoNombre,
      precio: nuevoPrecio,
      imagen: nuevaImagen
    });
  } catch (err) {
    console.error(`Error en PUT /${product}/${id}:`, err);
    res.status(500).send("Error al actualizar producto");
  }
});

app.delete("/:product/:id", async (req, res) => {
  const { product, id } = req.params;
  if (!CATEGORIAS_PERMITIDAS.has(product)) {
    return res.status(404).json({ message: "Categoría no válida" });
  }
  try {
    const rows = await queryAsync(
      `SELECT imagen FROM ${product} WHERE id = ? LIMIT 1`,
      [id]
    );
    await queryAsync(`DELETE FROM ${product} WHERE id = ?`, [id]);
    if (rows.length && rows[0].imagen) {
      eliminarArchivoMenuSiExiste(rows[0].imagen);
    }
    res.status(200).send("Eliminado correctamente");
  } catch (err) {
    console.error(`Error en DELETE /${product}/${id}:`, err);
    res.status(500).send("Error al eliminar");
  }
});

app.use((req, res) => {
  res.status(404).json({
    message: "no se obtuvo respuesta..."
  });
});

setInterval(async () => {
  try {
    await verificarCorteAutomaticoWeb();
  } catch (err) {
    console.error("[Auto-Cierre] Error al verificar horario de corte:", err);
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`funcionando en el puerto ${PORT}`);
});