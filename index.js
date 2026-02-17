require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));


// 🔥 MONTAJE CORRECTO Y ÚNICO
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tiendas', require('./routes/tiendas'));

app.get('/test123', (req, res) => {
  res.send('TEST123 OK 🔥');
});

const PORT = process.env.PORT || 3000;
app.get('/version', (req, res) => {
  res.json({
    ok: true,
    app: "zacapoints-api",
    version: "etapa2-diario-hoy",
    fecha: new Date().toISOString()
  });
});



app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});



