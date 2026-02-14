const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireAuth, requireRole } = require('../middlewares/auth');

// =============================
// Ping
// =============================
router.get('/ping', (req, res) => {
  res.json({ ok: true, ping: 'reportes router ok' });
});

// =====================================================
// GET /api/reportes (CONSULTAR + FILTROS)
// =====================================================
router.get('/', requireAuth, (req, res) => {
  const { fecha, id_tienda, desde, hasta, anio, mes } = req.query;

  let sql = `
    SELECT
      r.id_reporte,
      r.fecha,
      r.turno,
      r.id_tienda,
      r.id_usuario,
      r.efectivo,
      r.transferencia,
      r.terminal1,
      r.terminal2,
      r.gastos,
      r.retiro,
      r.fondo_inicial,
      r.total,
      r.fecha_registro
    FROM reportes_diarios r
    WHERE 1=1
  `;

  const params = [];

  if (fecha) {
    sql += ' AND r.fecha = ?';
    params.push(fecha);
  }

  if (id_tienda) {
    sql += ' AND r.id_tienda = ?';
    params.push(id_tienda);
  }

  if (desde && hasta) {
    sql += ' AND r.fecha BETWEEN ? AND ?';
    params.push(desde, hasta);
  }

  if (anio && mes) {
    sql += ' AND YEAR(r.fecha) = ? AND MONTH(r.fecha) = ?';
    params.push(anio, mes);
  }

  sql += ' ORDER BY r.fecha DESC, r.id_tienda ASC, r.turno ASC';

  db.query(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    const totales = rows.reduce(
      (acc, r) => {
        acc.efectivo += Number(r.efectivo);
        acc.transferencia += Number(r.transferencia);
        acc.terminal1 += Number(r.terminal1);
        acc.terminal2 += Number(r.terminal2);
        acc.total += Number(r.total);
        return acc;
      },
      { efectivo: 0, transferencia: 0, terminal1: 0, terminal2: 0, total: 0 }
    );

    res.json({
      ok: true,
      filtros: { fecha, id_tienda, desde, hasta, anio, mes },
      registros: rows.length,
      totales,
      data: rows
    });
  });
});

// =====================================================
// GET /api/reportes/resumen-mes?anio=YYYY&mes=MM
// =====================================================
router.get('/resumen-mes', requireAuth, (req, res) => {
  const { anio, mes } = req.query;

  if (!anio || !mes) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Debes enviar anio y mes. Ej: ?anio=2026&mes=2'
    });
  }

  const sql = `
    SELECT
      t.id_tienda,
      t.nombre AS tienda,
      COALESCE(SUM(r.efectivo), 0) AS efectivo,
      COALESCE(SUM(r.transferencia), 0) AS transferencia,
      COALESCE(SUM(r.terminal1), 0) AS terminal1,
      COALESCE(SUM(r.terminal2), 0) AS terminal2,
      COALESCE(SUM(r.total), 0) AS total
    FROM tiendas t
    LEFT JOIN reportes_diarios r
      ON r.id_tienda = t.id_tienda
      AND YEAR(r.fecha) = ?
      AND MONTH(r.fecha) = ?
    WHERE t.activo = 1
    GROUP BY t.id_tienda, t.nombre
    ORDER BY t.id_tienda ASC
  `;
  // =====================================================
// GET /api/reportes/resumen-dia?fecha=YYYY-MM-DD
// =====================================================
router.get('/resumen-dia', requireAuth, requireRole('ADMIN'), (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({
      ok: false,
      mensaje: "Debes enviar fecha. Ej: ?fecha=2026-02-12"
    });
  }

  const sql = `
    SELECT
      t.id_tienda,
      t.nombre AS tienda,
      COALESCE(SUM(r.efectivo), 0) AS efectivo,
      COALESCE(SUM(r.transferencia), 0) AS transferencia,
      COALESCE(SUM(r.terminal1), 0) AS terminal1,
      COALESCE(SUM(r.terminal2), 0) AS terminal2,
      COALESCE(SUM(r.total), 0) AS total
    FROM tiendas t
    LEFT JOIN reportes_diarios r
      ON r.id_tienda = t.id_tienda
      AND r.fecha = ?
    WHERE t.activo = 1
    GROUP BY t.id_tienda, t.nombre
    ORDER BY t.id_tienda ASC
  `;

  db.query(sql, [fecha], (err, rows) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    const totales = rows.reduce(
      (acc, r) => {
        acc.efectivo += Number(r.efectivo);
        acc.transferencia += Number(r.transferencia);
        acc.terminal1 += Number(r.terminal1);
        acc.terminal2 += Number(r.terminal2);
        acc.total += Number(r.total);
        return acc;
      },
      { efectivo: 0, transferencia: 0, terminal1: 0, terminal2: 0, total: 0 }
    );

    res.json({
      ok: true,
      filtros: { fecha },
      totales,
      tiendas: rows
    });
  });
});

  db.query(sql, [anio, mes], (err, rows) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    const totales = rows.reduce(
      (acc, r) => {
        acc.efectivo += Number(r.efectivo);
        acc.transferencia += Number(r.transferencia);
        acc.terminal1 += Number(r.terminal1);
        acc.terminal2 += Number(r.terminal2);
        acc.total += Number(r.total);
        return acc;
      },
      { efectivo: 0, transferencia: 0, terminal1: 0, terminal2: 0, total: 0 }
    );

    res.json({
      ok: true,
      filtros: { anio, mes },
      totales,
      tiendas: rows
    });
  });
});

// =====================================================
// Helpers CDMX
// =====================================================
function getFechaCDMX() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function getHoraCDMX() {
  return Number(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      hour12: false
    })
  );
}

function calcularTurnoCDMX() {
  const h = getHoraCDMX();
  if (h >= 8 && h < 16) return 1;
  if (h >= 16 && h < 23) return 2;
  return 0;
}

// =====================================================
// GET /api/reportes/diario/hoy
// =====================================================
router.get('/diario/hoy', requireAuth, requireRole('TIENDA'), (req, res) => {
  const { id_tienda } = req.user;

  const fecha = getFechaCDMX();
  const turno = calcularTurnoCDMX();

  if (turno === 0) {
    return res.json({
      ok: true,
      existe: false,
      fueraHorario: true,
      mensaje: "Fuera de horario (08:00 a 23:00)",
      fecha,
      turno
    });
  }

  const sql = `
    SELECT *
    FROM reportes_diarios
    WHERE id_tienda = ?
      AND fecha = ?
      AND turno = ?
    LIMIT 1
  `;

  db.query(sql, [id_tienda, fecha, turno], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    if (rows.length > 0) {
      return res.json({
        ok: true,
        existe: true,
        fecha,
        turno,
        data: rows[0]
      });
    }

    return res.json({
      ok: true,
      existe: false,
      fecha,
      turno
    });
  });
});

// =====================================================
// POST /api/reportes/diario
// Captura diaria por turnos (retroactiva)
// ADMIN puede capturar cualquier tienda
// TIENDA solo su tienda
// =====================================================
router.post('/diario', requireAuth, (req, res) => {

  const { id_usuario, id_tienda: tiendaSesion, rol } = req.user;

  let {
    fecha,
    turno,
    id_tienda, // solo ADMIN
    efectivo = 0,
    transferencia = 0,
    terminal1 = 0,
    terminal2 = 0,
    gastos = 0,
    retiro = 0,
    fondo_inicial = 0
  } = req.body;

  // =========================
  // TIENDA FINAL SEGÚN ROL
  // =========================
  let tiendaFinal = null;

  if (rol === "ADMIN") {
    id_tienda = Number(id_tienda);
    if (!id_tienda) {
      return res.status(400).json({ ok: false, mensaje: "ADMIN: falta id_tienda" });
    }
    tiendaFinal = id_tienda;
  } else {
    // TIENDA
    tiendaFinal = Number(tiendaSesion);
  }

  // =========================
  // Fecha default = hoy CDMX
  // =========================
  const hoy = getFechaCDMX();
  if (!fecha) fecha = hoy;

  // Validar no futuro
  if (fecha > hoy) {
    return res.status(400).json({ ok: false, mensaje: "No se permite fecha futura" });
  }

  // =========================
  // Turno
  // =========================
  if (fecha === hoy) {
    // hoy = turno automático
    turno = calcularTurnoCDMX();
    if (turno === 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "Fuera de horario (08:00 a 23:00)"
      });
    }
  } else {
    // fecha pasada = turno obligatorio
    turno = Number(turno);
    if (![1, 2].includes(turno)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Para fecha retroactiva debes elegir turno (1 o 2)"
      });
    }
  }

  // =========================
  // Validar números
  // =========================
  const valores = { efectivo, transferencia, terminal1, terminal2, gastos, retiro, fondo_inicial };
  for (const k in valores) {
    const v = Number(valores[k]);
    if (isNaN(v)) return res.status(400).json({ ok: false, mensaje: `Campo inválido: ${k}` });
    if (v < 0) return res.status(400).json({ ok: false, mensaje: `No se permite negativo: ${k}` });
    valores[k] = v;
  }

  // =========================
  // Total CORRECTO
  // =========================
  const total =
    valores.efectivo +
    valores.transferencia +
    valores.terminal1 +
    valores.terminal2 -
    valores.gastos -
    valores.retiro;

  const sql = `
    INSERT INTO reportes_diarios
    (fecha, turno, id_tienda, id_usuario,
     efectivo, transferencia, terminal1, terminal2,
     gastos, retiro, fondo_inicial, total)
    VALUES (?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?)
  `;

  const params = [
    fecha, turno, tiendaFinal, id_usuario,
    valores.efectivo, valores.transferencia, valores.terminal1, valores.terminal2,
    valores.gastos, valores.retiro, valores.fondo_inicial, total
  ];

  db.query(sql, params, (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          ok: false,
          code: "DUPLICADO",
          mensaje: "Ya existe captura para este turno"
        });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }

    res.json({
      ok: true,
      mensaje: "Captura guardada",
      id_reporte: result.insertId,
      fecha,
      turno,
      id_tienda: tiendaFinal,
      total
    });
  });
});

module.exports = router;
