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
  // FECHA DEFAULT CDMX
  // =========================
  const hoy = getFechaCDMX();
  if (!fecha) fecha = hoy;

  // Validar no futuro
  if (fecha > hoy) {
    return res.status(400).json({ ok: false, mensaje: "No se permite fecha futura" });
  }

  // =========================
  // TURNO
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
  // VALIDAR NÚMEROS
  // =========================
  const valores = { efectivo, transferencia, terminal1, terminal2, gastos, retiro, fondo_inicial };
  for (const k in valores) {
    const v = Number(valores[k]);
    if (isNaN(v)) return res.status(400).json({ ok: false, mensaje: `Campo inválido: ${k}` });
    if (v < 0) return res.status(400).json({ ok: false, mensaje: `No se permite negativo: ${k}` });
    valores[k] = v;
  }

  // =========================
  // TOTAL CORRECTO
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


