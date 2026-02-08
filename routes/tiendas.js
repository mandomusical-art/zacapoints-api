const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireAuth } = require('../middlewares/auth');

// GET /api/tiendas
router.get('/', requireAuth, (req, res) => {

  const sql = `
    SELECT id_tienda, nombre
    FROM tiendas
    WHERE activo = 1
    ORDER BY id_tienda ASC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    res.json({
      ok: true,
      tiendas: rows
    });
  });
});

module.exports = router;
