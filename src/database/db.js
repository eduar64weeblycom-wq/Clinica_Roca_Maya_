const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.sqlite'); // Ajusta la ruta de tu db si es diferente
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar a la base de datos', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
    }
});

// Agregar un método .query compatible para que funcione con tu código actual
db.query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        // Si es un SELECT
        if (sql.trim().toUpperCase().startsWith("SELECT")) {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve([rows]); // Se retorna como [rows] para mantener la desestructuración de Node.js ([rows] = await db.query(...))
            });
        } else {
            // Si es INSERT, UPDATE, DELETE
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve([{ insertId: this.lastID, affectedRows: this.changes }]);
            });
        }
    });
};

module.exports = db;