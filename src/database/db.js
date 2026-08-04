const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar a la base de datos', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
        inicializarTablas();
    }
});

function inicializarTablas() {
    db.serialize(() => {
        // 1. Tabla de Roles
        db.run(`
            CREATE TABLE IF NOT EXISTS TBL_MS_ROLES (
                ID_ROL INTEGER PRIMARY KEY AUTOINCREMENT,
                ROL TEXT NOT NULL,
                DESCRIPCION TEXT
            )
        `);

        // 2. Tabla de Usuarios
        db.run(`
            CREATE TABLE IF NOT EXISTS TBL_MS_USUARIO (
                ID_USUARIO INTEGER PRIMARY KEY AUTOINCREMENT,
                USUARIO TEXT UNIQUE NOT NULL,
                NOMBRE_USUARIO TEXT NOT NULL,
                CONTRASENA TEXT NOT NULL,
                CORREO_ELECTRONICO TEXT UNIQUE NOT NULL,
                ESTADO TEXT DEFAULT 'ACTIVO',
                ID_ROL INTEGER DEFAULT 5,
                INTENTOS_FALLIDOS INTEGER DEFAULT 0,
                FECHA_ULTIMA_CONEXION DATETIME,
                SECRET_2FA TEXT,
                ACTIVO_2FA INTEGER DEFAULT 0,
                CODIGO_RECUPERACION TEXT,
                EXPIRA_CODIGO DATETIME
            )
        `, async (err) => {
            if (!err) {
                db.get("SELECT COUNT(*) as count FROM TBL_MS_USUARIO", async (err, row) => {
                    if (row && row.count === 0) {
                        const hashedPassword = await bcrypt.hash("Admin123*", 10);
                        db.run(
                            `INSERT INTO TBL_MS_USUARIO (USUARIO, NOMBRE_USUARIO, CONTRASENA, CORREO_ELECTRONICO, ESTADO, ID_ROL) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            ["ADMIN", "Administrador Principal", hashedPassword, "admin@clinicarocamaya.com", "ACTIVO", 1]
                        );
                        console.log(" Usuario ADMIN por defecto creado (ADMIN / Admin123*)");
                    }
                });
            }
        });

        // 3. Tabla de Bitácora
        db.run(`
            CREATE TABLE IF NOT EXISTS TBL_MS_BITACORA (
                ID_BITACORA INTEGER PRIMARY KEY AUTOINCREMENT,
                FECHA DATETIME DEFAULT CURRENT_TIMESTAMP,
                USUARIO TEXT,
                ACCION TEXT,
                DESCRIPCION TEXT,
                MODULO TEXT,
                ESTADO TEXT
            )
        `);

        // ========================================================
        // 4. AGREGA AQUÍ EL RESTO DE TUS TABLAS (Pacientes, Citas, etc.)
        // ========================================================
        /*
        db.run(`
            CREATE TABLE IF NOT EXISTS TBL_PACIENTES (
                ID_PACIENTE INTEGER PRIMARY KEY AUTOINCREMENT,
                NOMBRE TEXT NOT NULL,
                -- tus campos restantes aquí adaptados a SQLite
            )
        `);
        */

        console.log(" Tablas y base de datos SQLite inicializadas correctamente.");
    });
}

// Método .query compatible con promesas
db.query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith("SELECT")) {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve([rows]);
            });
        } else {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve([{ insertId: this.lastID, affectedRows: this.changes }]);
            });
        }
    });
};

module.exports = db;