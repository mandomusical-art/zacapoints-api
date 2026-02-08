require('dotenv').config();
const db = require('./db/mysql');
const bcrypt = require('bcryptjs');

async function run() {
  console.log('🔐 Iniciando hash de passwords...');

  db.query("SELECT id_usuario, usuario, password FROM usuarios", async (err, rows) => {
    if (err) {
      console.log("❌ Error:", err.message);
      process.exit(1);
    }

    for (const u of rows) {
      // Si ya es bcrypt, lo saltamos
      if (u.password && u.password.startsWith('$2')) {
        console.log(`⏭️  ${u.usuario} ya está hasheado`);
        continue;
      }

      const hash = await bcrypt.hash(u.password, 10);

      await new Promise((resolve, reject) => {
        db.query(
          "UPDATE usuarios SET password = ? WHERE id_usuario = ?",
          [hash, u.id_usuario],
          (err2) => {
            if (err2) return reject(err2);
            console.log(`✅ ${u.usuario} hasheado`);
            resolve();
          }
        );
      });
    }

    console.log("🎉 Listo. Todos los passwords están hasheados.");
    process.exit(0);
  });
}

run();
