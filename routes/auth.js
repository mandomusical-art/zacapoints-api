const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({
      ok: false,
      mensaje: 'Faltan datos: usuario y password'
    });
  }

  const sql = `
    SELECT
      id_usuario,
      nombre,
      usuario,
      password,
      rol,
      id_tienda,
      activo
    FROM usuarios
    WHERE usuario = ?
    LIMIT 1
  `;

  db.query(sql, [usuario], async (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario o password incorrectos' });
    }

    const u = rows[0];

    if (u.activo !== 1) {
      return res.status(403).json({ ok: false, mensaje: 'Usuario desactivado' });
    }

    const okPass = await bcrypt.compare(password, u.password);

    if (!okPass) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario o password incorrectos' });
    }

    const payload = {
      id_usuario: u.id_usuario,
      rol: u.rol,
      id_tienda: u.id_tienda
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '12h'
    });

    res.json({
      ok: true,
      mensaje: 'Login correcto',
      token,
      usuario: {
        id_usuario: u.id_usuario,
        nombre: u.nombre,
        usuario: u.usuario,
        rol: u.rol,
        id_tienda: u.id_tienda
      }
    });
  });
});

module.exports = router;
