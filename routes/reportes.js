const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.get('/ping', (req, res) => {
  res.json({ ok: true, ping: 'reportes router ok' });
});


// =============================
// POST /api/reportes (GUARDAR)
// =============================
router.post('/', requireAuth, (req, res) => {

  const {
    fecha,
    id_tienda,
    efectivo = 0,
    transferencia = 0,
    tarjeta = 0
  } = req.body;

  const id_usuario = req.user.id_usuario;



  // Validación mínima
  if (!fecha || !id_tienda || !id_usuario) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Faltan datos obligatorios: fecha, id_tienda, id_usuario'
    });
  }

  const total =
    Number(efectivo) +
    Number(transferencia) +
    Number(tarjeta);

  const sql = `
    INSERT INTO reportes_diarios
      (fecha, id_tienda, id_usuario, efectivo, transferencia, tarjeta, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [fecha, id_tienda, id_usuario, efectivo, transferencia, tarjeta, total],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({
            ok: false,
            mensaje: 'Ya existe un reporte para esta tienda en esta fecha'
          });
        }

        return res.status(500).json({
          ok: false,
          error: err.message
        });
      }

      res.json({
        ok: true,
        mensaje: 'Reporte guardado correctamente',
        id_reporte: result.insertId,
        total
      });
    }
  );
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
      COALESCE(SUM(r.tarjeta), 0) AS tarjeta,
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

  db.query(sql, [anio, mes], (err, rows) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    // Totales globales del mes (sumando todas las tiendas)
    const totales = rows.reduce(
      (acc, r) => {
        acc.efectivo += Number(r.efectivo);
        acc.transferencia += Number(r.transferencia);
        acc.tarjeta += Number(r.tarjeta);
        acc.total += Number(r.total);
        return acc;
      },
      { efectivo: 0, transferencia: 0, tarjeta: 0, total: 0 }
    );

    res.json({
      ok: true,
      filtros: { anio, mes },
      totales,
      tiendas: rows
    });
  });
});





// ======================================
// GET /api/reportes (CONSULTAR + FILTROS)
// ======================================


router.get('/', (req, res) => {
  const { fecha, id_tienda, desde, hasta, anio, mes } = req.query;


  let sql = `
    SELECT
      r.id_reporte,
      r.fecha,
      r.id_tienda,
      r.id_usuario,
      r.efectivo,
      r.transferencia,
      r.tarjeta,
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
// Filtro por mes (anio + mes)
if (anio && mes) {
  sql += ' AND YEAR(r.fecha) = ? AND MONTH(r.fecha) = ?';
  params.push(anio, mes);
}



  sql += ' ORDER BY r.fecha DESC, r.id_tienda ASC';

  db.query(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    const totales = rows.reduce(
      (acc, r) => {
        acc.efectivo += Number(r.efectivo);
        acc.transferencia += Number(r.transferencia);
        acc.tarjeta += Number(r.tarjeta);
        acc.total += Number(r.total);
        return acc;
      },
      { efectivo: 0, transferencia: 0, tarjeta: 0, total: 0 }
    );

    res.json({
      ok: true,
      filtros: { fecha, id_tienda, desde, hasta },
      registros: rows.length,
      totales,
      data: rows
    });
  });
});
// =============================
// POST /api/reportes/diario
// Captura diaria por turno (auto)
// =============================
function calcularTurnoMexico() {
  const ahora = new Date();

  // Convertir a hora de México (CDMX)
  const horaMx = Number(
    ahora.toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "2-digit", hour12: false })
  );

  if (horaMx >= 8 && horaMx < 16) return 1;
  if (horaMx >= 16 && horaMx < 23) return 2;

  return 0;
}


router.post(
  '/diario',
  requireAuth,
  requireRole('TIENDA'),
  (req, res) => {

    const { id_usuario, id_tienda } = req.user;

    const turno = calcularTurnoMexico();
    if (turno === 0) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Fuera de horario (08:00 a 23:00)'
      });
    }
    // ============================================
// GET /api/reportes/diario/hoy
// Devuelve la captura del turno actual (si existe)
// ============================================
router.get('/diario/hoy', requireAuth, (req, res) => {

  // Solo TIENDA
  if (req.user.rol !== "TIENDA") {
    return res.status(403).json({
      ok: false,
      mensaje: "Acceso denegado. Solo TIENDA"
    });
  }

  const id_tienda = req.user.id_tienda;

  if (!id_tienda) {
    return res.status(400).json({
      ok: false,
      mensaje: "El usuario TIENDA no tiene id_tienda asignado"
    });
  }

  // Fecha CDMX YYYY-MM-DD
  const fecha = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Mexico_City"
  });

  // Turno CDMX
  const horaMx = Number(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      hour12: false
    })
  );

  let turno = 0;
  if (horaMx >= 8 && horaMx < 16) turno = 1;
  else if (horaMx >= 16 && horaMx < 23) turno = 2;

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
    SELECT
      id_reporte,
      fecha,
      turno,
      id_tienda,
      id_usuario,
      efectivo,
      transferencia,
      terminal1,
      terminal2,
      gastos,
      retiro,
      fondo_inicial,
      tarjeta,
      total,
      fecha_registro
    FROM reportes_diarios
    WHERE id_tienda = ?
      AND fecha = ?
      AND turno = ?
    LIMIT 1
  `;

  db.query(sql, [id_tienda, fecha, turno], (err, rows) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    // Si existe
    if (rows.length > 0) {
      return res.json({
        ok: true,
        existe: true,
        fecha,
        turno,
        data: rows[0]
      });
    }

    // Si NO existe, regresamos plantilla
    return res.json({
      ok: true,
      existe: false,
      fecha,
      turno,
      data: {
        efectivo: 0,
        transferencia: 0,
        terminal1: 0,
        terminal2: 0,
        gastos: 0,
        retiro: 0,
        fondo_inicial: 0,
        tarjeta: 0,
        total: 0
      }
    });
  });
});

    const {
      total = 0,
      efectivo = 0,
      transferencia = 0,
      terminal1 = 0,
      terminal2 = 0,
      gastos = 0,
      retiro = 0,
      fondo_inicial = 0
    } = req.body;

    // Validación: no negativos
    const valores = { total, efectivo, transferencia, terminal1, terminal2, gastos, retiro, fondo_inicial };
    for (const k in valores) {
      const v = Number(valores[k]);
      if (isNaN(v)) {
        return res.status(400).json({ ok: false, mensaje: `Campo inválido: ${k}` });
      }
      if (v < 0) {
        return res.status(400).json({ ok: false, mensaje: `No se permite negativo: ${k}` });
      }
    }

    const sql = `
      INSERT INTO reportes_diarios
      (fecha, turno, id_tienda, id_usuario,
       total, efectivo, transferencia,
       terminal1, terminal2,
       gastos, retiro, fondo_inicial)
      VALUES
      (CURDATE(), ?, ?, ?,
       ?, ?, ?,
       ?, ?,
       ?, ?, ?)
    `;

    const params = [
      turno, id_tienda, id_usuario,
      total, efectivo, transferencia,
      terminal1, terminal2,
      gastos, retiro, fondo_inicial
    ];

    db.query(sql, params, (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            ok: false,
            mensaje: 'Ya existe captura para este turno'
          });
        }

        return res.status(500).json({
          ok: false,
          error: err.message
        });
      }

      res.json({
        ok: true,
        mensaje: 'Captura guardada',
        id_reporte: result.insertId,
        turno
      });
    });
  }
);



module.exports = router;

