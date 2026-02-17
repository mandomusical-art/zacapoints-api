const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { requireAuth, requireRole } = require('../middlewares/auth');

// ==============================
// POST /api/auth/login
// ==============================
router.post('/login', (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({
      ok: false,
      mensaje: "Faltan datos: usuario y password"
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
      activo,
      debe_cambiar_password
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

    try {
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
          id_tienda: u.id_tienda,
          debe_cambiar_password: u.debe_cambiar_password === 1
        }
      });

    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: "Error validando password",
        error: e.message
      });
    }
  });
});


// ==============================
// POST /api/auth/fijar-admin
// Convierte id_usuario=1 a rol ADMIN
// ==============================
router.post('/fijar-admin', requireAuth, (req, res) => {

  if (req.user.id_usuario !== 1) {
    return res.status(403).json({
      ok: false,
      mensaje: "Solo el usuario principal puede ejecutar esto"
    });
  }

  const sql = `UPDATE usuarios SET rol='ADMIN' WHERE id_usuario=1`;

  db.query(sql, (err) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    res.json({
      ok: true,
      mensaje: "Rol actualizado a ADMIN. Vuelve a iniciar sesión."
    });
  });
});

// ==============================
// POST /api/auth/crear-usuario
// Solo ADMIN
// ==============================
router.post('/crear-usuario', requireAuth, requireRole('ADMIN'), (req, res) => {
  const { nombre, usuario, password, rol, id_tienda } = req.body;

  if (!nombre || !usuario || !password || !rol) {
    return res.status(400).json({
      ok: false,
      mensaje: "Faltan datos: nombre, usuario, password, rol"
    });
  }

  if (password.length < 4) {
    return res.status(400).json({
      ok: false,
      mensaje: "Password demasiado corto (mínimo 4 caracteres)"
    });
  }

  if (!['ADMIN', 'TIENDA'].includes(rol)) {
    return res.status(400).json({
      ok: false,
      mensaje: "Rol inválido. Usa ADMIN o TIENDA"
    });
  }

  if (rol === 'TIENDA' && !id_tienda) {
    return res.status(400).json({
      ok: false,
      mensaje: "Para rol TIENDA debes enviar id_tienda"
    });
  }

  db.query(
    "SELECT id_usuario FROM usuarios WHERE usuario = ? LIMIT 1",
    [usuario],
    async (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });

      if (rows.length > 0) {
        return res.status(400).json({ ok: false, mensaje: "Ese usuario ya existe" });
      }

      const hash = await bcrypt.hash(password, 10);

      const sql = `
        INSERT INTO usuarios (
          nombre,
          usuario,
          password,
          rol,
          id_tienda,
          activo,
          debe_cambiar_password
        )
        VALUES (?, ?, ?, ?, ?, 1, 1)
      `;

      db.query(sql, [nombre, usuario, hash, rol, id_tienda || null], (err2, result) => {
        if (err2) return res.status(500).json({ ok: false, error: err2.message });

        res.json({
          ok: true,
          mensaje: "Usuario creado",
          id_usuario: result.insertId
        });
      });
    }
  );
});


module.exports = router;

// ==============================
// POST /api/auth/cambiar-password
// Requiere token
// ==============================
router.post('/cambiar-password', requireAuth, (req, res) => {
  const { password_actual, password_nueva } = req.body;

  if (!password_actual || !password_nueva) {
    return res.status(400).json({
      ok: false,
      mensaje: "Faltan datos: password_actual y password_nueva"
    });
  }

  if (password_nueva.length < 4) {
    return res.status(400).json({
      ok: false,
      mensaje: "Password nueva demasiado corta (mínimo 4 caracteres)"
    });
  }

  const sql = `
    SELECT id_usuario, password
    FROM usuarios
    WHERE id_usuario = ?
    LIMIT 1
  `;

  db.query(sql, [req.user.id_usuario], async (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Usuario no encontrado" });
    }

    const u = rows[0];

    // Blindaje: password inválido en BD
    if (!u.password || !u.password.startsWith("$2")) {
      return res.status(500).json({
        ok: false,
        mensaje: "Password inválido en BD (no está hasheado)"
      });
    }

    try {
      const ok = await bcrypt.compare(password_actual, u.password);

      if (!ok) {
        return res.status(401).json({
          ok: false,
          mensaje: "Password actual incorrecta"
        });
      }

      const hash = await bcrypt.hash(password_nueva, 10);

      const sql2 = `
        UPDATE usuarios
        SET password = ?,
            debe_cambiar_password = 0
        WHERE id_usuario = ?
      `;

      db.query(sql2, [hash, req.user.id_usuario], (err2) => {
        if (err2) return res.status(500).json({ ok: false, error: err2.message });

        res.json({
          ok: true,
          mensaje: "Password actualizada correctamente"
        });
      });

    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: "Error cambiando password",
        error: e.message
      });
    }
  });
});


