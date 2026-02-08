const jwt = require('jsonwebtoken');

// ==============================
// Middleware: token obligatorio
// ==============================
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';

  // Formato esperado: "Bearer TOKEN"
  const parts = auth.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      ok: false,
      mensaje: 'Falta token (Authorization: Bearer ...)'
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id_usuario, rol, id_tienda }
    next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Token inválido o expirado'
    });
  }
}

// ==============================
// Middleware: rol obligatorio
// ==============================
function requireRole(rolNecesario) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, mensaje: 'No autenticado' });
    }

    if (req.user.rol !== rolNecesario) {
      return res.status(403).json({
        ok: false,
        mensaje: `Acceso denegado. Requiere rol: ${rolNecesario}`
      });
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };
