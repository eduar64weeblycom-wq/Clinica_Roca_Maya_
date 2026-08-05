const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Configuración de la ruta para desarrollo local o producción con Disco Persistente en Render
const dbFolder = process.env.RENDER ? '/opt/render/project/data' : path.resolve(__dirname, '../../');
const dbPath = path.join(dbFolder, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar a la base de datos', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite en:', dbPath);
        inicializarTablas();
    }
});

function inicializarTablas() {
    // Usamos db.exec para crear todas las tablas de golpe de manera ordenada y síncrona
    const schema = `
        CREATE TABLE IF NOT EXISTS TBL_MS_ROLES (
            ID_ROL INTEGER PRIMARY KEY AUTOINCREMENT,
            ROL TEXT NOT NULL,
            DESCRIPCION TEXT
        );

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
        );

        CREATE TABLE IF NOT EXISTS TBL_MS_BITACORA (
            ID_BITACORA INTEGER PRIMARY KEY AUTOINCREMENT,
            FECHA DATETIME DEFAULT CURRENT_TIMESTAMP,
            USUARIO TEXT,
            ACCION TEXT,
            DESCRIPCION TEXT,
            MODULO TEXT,
            ESTADO TEXT
        );

        CREATE TABLE IF NOT EXISTS TBL_MS_PARAMETROS (
            ID_PARAMETRO INTEGER PRIMARY KEY AUTOINCREMENT,
            PARAMETRO TEXT UNIQUE NOT NULL,
            VALOR TEXT NOT NULL,
            DESCRIPCION TEXT
        );
    `;

    db.exec(schema, async (err) => {
        if (err) {
            console.error("Error al inicializar el esquema de tablas:", err.message);
        } else {
            console.log("Tablas y base de datos SQLite inicializadas correctamente.");
            
            // 1. Insertar parámetro por defecto de la bitácora si no existe
            db.get("SELECT COUNT(*) as count FROM TBL_MS_PARAMETROS WHERE PARAMETRO = 'BITACORA_ESTADO'", (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO TBL_MS_PARAMETROS (PARAMETRO, VALOR, DESCRIPCION) VALUES ('BITACORA_ESTADO', 'ACTIVO', 'Estado global de la bitacora')`);
                }
            });

            // 2. Insertar usuario ADMIN por defecto si la tabla está vacía
            db.get("SELECT COUNT(*) as count FROM TBL_MS_USUARIO", async (err, row) => {
                if (row && row.count === 0) {
                    const hashedPassword = await bcrypt.hash("Admin123*", 10);
                    db.run(
                        `INSERT INTO TBL_MS_USUARIO (USUARIO, NOMBRE_USUARIO, CONTRASENA, CORREO_ELECTRONICO, ESTADO, ID_ROL) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        ["ADMIN", "Administrador Principal", hashedPassword, "admin@clinicarocamaya.com", "ACTIVO", 1],
                        (insertErr) => {
                            if (!insertErr) {
                                console.log("Usuario ADMIN por defecto creado (ADMIN / Admin123*)");
                            }
                        }
                    );
                }
            });
        }
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