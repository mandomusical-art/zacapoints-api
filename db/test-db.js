console.log('⏳ Iniciando prueba de MySQL...');

const db = require('./mysql');

db.query('SELECT 1 AS resultado', (err, results) => {
  if (err) {
    console.error('❌ ERROR MySQL:', err);
    process.exit(1);
  }

  console.log('✅ MySQL respondió correctamente:', results);
  process.exit(0);
});
