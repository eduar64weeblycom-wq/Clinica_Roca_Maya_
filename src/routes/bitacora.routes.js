const express = require("express");
const router = express.Router();
const pool = require("../database/db");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const db = require("../database/db");

// ============================================================
// Función global de registro con validación de estado (ON/OFF)
// ============================================================
async function registrarBitacora(poolInstance, idUsuario, accion, descripcion, modulo) {

    try {

        const activePool = poolInstance || pool;

        const [paramRows] = await activePool.query(
            `SELECT VALOR
             FROM TBL_MS_PARAMETROS
             WHERE PARAMETRO='BITACORA_ESTADO'`
        );

        const estado = paramRows.length ? paramRows[0].VALOR : "ON";

        if (estado === "OFF") {
            return;
        }

        await activePool.query(

            `INSERT INTO TBL_MS_BITACORA
            (FECHA_HORA,ID_USUARIO,ACCION,DESCRIPCION,MODULO)
            VALUES(NOW(),?,?,?,?)`,

            [
                idUsuario || null,
                accion,
                descripcion,
                modulo || "GENERAL"
            ]
        );

    } catch (err) {

        console.error(err);

    }

}
// ============================================================
// GET /bitacora - Página principal de bitácora
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.FECHA_HORA, u.USUARIO, b.ACCION, b.DESCRIPCION, b.MODULO
      FROM TBL_MS_BITACORA b
      LEFT JOIN TBL_MS_USUARIO u ON b.ID_USUARIO = u.ID_USUARIO
      ORDER BY b.FECHA_HORA DESC LIMIT 50
    `);

    const [paramRows] = await pool.query(
      `SELECT VALOR FROM TBL_MS_PARAMETROS WHERE PARAMETRO = 'BITACORA_ESTADO'`
    );
    const estadoBitacora = paramRows.length > 0 ? paramRows[0].VALOR : 'ON';

    res.render("bitacora", { 
      registros: rows, 
      bitacoraActiva: estadoBitacora 
    });
  } catch (error) {
    console.error("Error al cargar bitácora:", error);
    res.status(500).send("Error al cargar la bitácora");
  }
});

// ============================================================
// GET /bitacora/parametros - Página de parámetros
// ============================================================
router.get("/parametros", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ID_PARAMETRO, PARAMETRO, VALOR, DESCRIPCION
      FROM TBL_MS_PARAMETROS
      ORDER BY ID_PARAMETRO
    `);

    res.render("parametros", { parametros: rows });
  } catch (error) {
    console.error("Error al cargar parámetros:", error);
    res.status(500).send("Error al cargar los parámetros");
  }
});

// ============================================================
// POST /bitacora/parametros/guardar
// ============================================================
router.post("/parametros/guardar", async (req, res) => {
  try {
    const { parametros } = req.body;

    if (!parametros || !Array.isArray(parametros)) {
      return res.json({ ok: false, mensaje: "Datos inválidos" });
    }

    const promises = parametros.map(p => {
      return pool.query(
        "UPDATE TBL_MS_PARAMETROS SET VALOR = ?, FECHA_MODIFICACION = NOW() WHERE ID_PARAMETRO = ?",
        [p.valor, p.id]
      );
    });

    await Promise.all(promises);
    res.json({ ok: true, mensaje: "Todos los parámetros guardados correctamente" });
    
  } catch (err) {
    console.error("Error guardar parámetros:", err);
    res.json({ ok: false, mensaje: "Error al guardar los parámetros" });
  }
});

// ============================================================
// POST /bitacora/parametros/update
// ============================================================
router.post("/parametros/update", async (req, res) => {
  try {
    const { id, valor, usuario } = req.body;

    await pool.query(
      `UPDATE TBL_MS_PARAMETROS 
       SET VALOR = ?, FECHA_MODIFICACION = NOW(), USUARIO_MODIFICACION = ? 
       WHERE ID_PARAMETRO = ?`,
      [valor, usuario || 'system', id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error actualizar parámetro:", error);
    res.json({ ok: false, mensaje: "Error al actualizar el parámetro" });
  }
});

// ============================================================
// GET /bitacora/parametros/backup - Generar respaldo de la BD
// ============================================================
router.get("/parametros/backup", async (req, res) => {
  try {
    const idUsuario = req.user?.ID_USUARIO || null; 
    const nombreUsuario = req.user?.USUARIO || "ADMIN_SYSTEM";

    const dbConfig = {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "yair2003",
      database: process.env.DB_NAME || "Roca_Maya"
    };

    function encontrarMysqldump() {
      const rutas = [
        "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
        "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
        "C:\\Program Files\\MySQL\\MySQL Server 9.0\\bin\\mysqldump.exe",
        "C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe",
        "C:\\Program Files (x86)\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe",
        "C:\\Program Files\\MySQL\\MySQL Workbench 8.0\\mysqldump.exe",
        "C:\\xampp\\mysql\\bin\\mysqldump.exe",
        "C:\\wamp64\\bin\\mysql\\mysql8.0.31\\bin\\mysqldump.exe"
      ];

      for (const ruta of rutas) {
        if (fs.existsSync(ruta)) {
          return ruta;
        }
      }
      return null;
    }

    const rutaMysqldump = encontrarMysqldump();

    if (!rutaMysqldump) {
      return res.status(500).send(`
        <h2>Error: No se encontró mysqldump</h2>
        <p>No se encontró el ejecutable de mysqldump en tu sistema.</p>
      `);
    }

    const timestampRespaldo = new Date().toISOString()
      .replace(/T/, '_')
      .replace(/\..+/, '')
      .replace(/:/g, '-');
      
    const archivoRespaldoSql = `backup_rocamaya_${timestampRespaldo}.sql`;
    const rutaTemporalBackup = path.join(__dirname, "../", archivoRespaldoSql);

    const passwordSqlDump = dbConfig.password ? `-p${dbConfig.password}` : "";
    const comando = `"${rutaMysqldump}" -h ${dbConfig.host} -u ${dbConfig.user} ${passwordSqlDump} --skip-triggers --complete-insert --add-drop-table ${dbConfig.database} > "${rutaTemporalBackup}"`;

    exec(comando, { timeout: 120000 }, async (error, stdout, stderr) => {
      if (fs.existsSync(rutaTemporalBackup)) {
        const stats = fs.statSync(rutaTemporalBackup);
        if (stats.size > 0) {
          res.download(rutaTemporalBackup, archivoRespaldoSql, async (downloadError) => {
            try {
              if (fs.existsSync(rutaTemporalBackup)) {
                fs.unlinkSync(rutaTemporalBackup);
              }
            } catch (fsErr) {
              console.error("Error al limpiar archivo temporal:", fsErr);
            }

            if (!downloadError) {
              await registrarBitacora(
                pool,
                idUsuario,
                "GENERAR_BACKUP",
                `El usuario ${nombreUsuario} generó y descargó un respaldo de la base de datos (${archivoRespaldoSql}).`,
                "SEGURIDAD"
              );
            }
          });
          return;
        }
      }

      res.status(500).send(`Error al generar backup: ${error?.message || stderr}`);
    });

  } catch (error) {
    res.status(500).send("Error al generar el respaldo: " + error.message);
  }
});

// ============================================================
// POST /bitacora/limpiar - Borrar todos los registros de la bitácora
// ============================================================
router.post("/limpiar", async (req, res) => {
  try {
    const idUsuario = req.body.idUsuario || req.user?.ID_USUARIO || null;
    const nombreUsuario = req.body.usuario || req.user?.USUARIO || "ADMIN";

    await pool.query(`DELETE FROM TBL_MS_BITACORA`);

    await registrarBitacora(
      pool,
      idUsuario,
      "LIMPIAR_BITACORA",
      `El usuario ${nombreUsuario} vació por completo la bitácora del sistema.`,
      "SEGURIDAD"
    );

    res.json({ ok: true, mensaje: "Bitácora limpiada correctamente." });
  } catch (error) {
    console.error("Error al limpiar la bitácora:", error);
    res.status(500).json({ ok: false, mensaje: "Error al limpiar la bitácora." });
  }
});

const PDFDocument = require('pdfkit');

// ============================================================
// GET /bitacora/descargar/pdf - Exportar bitácora a PDF
// ============================================================
router.get("/descargar/pdf", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.FECHA_HORA, u.USUARIO, b.ACCION, b.DESCRIPCION, b.MODULO
      FROM TBL_MS_BITACORA b
      LEFT JOIN TBL_MS_USUARIO u ON b.ID_USUARIO = u.ID_USUARIO
      ORDER BY b.FECHA_HORA DESC
      LIMIT 50
    `);

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte_bitacora.pdf');

    doc.pipe(res);

    doc.fontSize(18).fillColor('#1f2937').text('Reporte General de Bitácora - Sistema Roca Maya', { align: 'center' });
    doc.fontSize(10).fillColor('#6b7280').text(`Generado el: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(1.5);

    const tableTop = 130;
    let position = tableTop;

    doc.fontSize(10).fillColor('#111827').font('Helvetica-Bold');
    doc.text('Fecha / Hora', 30, position, { width: 110 });
    doc.text('Usuario', 140, position, { width: 90 });
    doc.text('Módulo', 230, position, { width: 80 });
    doc.text('Acción', 310, position, { width: 110 });
    doc.text('Descripción', 425, position, { width: 330 });

    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    position += 15;
    doc.moveTo(30, position).lineTo(780, position).strokeColor('#d1d5db').stroke();
    position += 10;

    rows.forEach((row) => {
      if (position > 540) {
        doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
        position = 40;
      }

      const fechaStr = new Date(row.FECHA_HORA).toLocaleString();
      
      doc.text(fechaStr, 30, position, { width: 110 });
      doc.text(row.USUARIO || 'SISTEMA', 140, position, { width: 90 });
      doc.text(row.MODULO || 'N/D', 230, position, { width: 80 });
      doc.text(row.ACCION || 'N/D', 310, position, { width: 110 });
      doc.text(row.DESCRIPCION || '', 425, position, { width: 330 });

      position += 25;
    });

    doc.end();

    await registrarBitacora(
      pool,
      req.user?.ID_USUARIO || null,
      "EXPORTAR_PDF",
      "El usuario exportó la bitácora del sistema a formato PDF.",
      "SEGURIDAD"
    );

  } catch (error) {
    console.error("Error al exportar bitácora a PDF:", error);
    res.status(500).send("Error al generar el PDF de la bitácora.");
  }
});

// ============================================================
// POST /bitacora/estado - Activar o Desactivar la bitácora
// ============================================================
router.post("/estado", async (req,res)=>{

    try{

        const {estado}=req.body;

        if(estado!=="ON" && estado!=="OFF"){

            return res.json({
                ok:false,
                mensaje:"Estado inválido"
            });

        }

        await pool.query(

            `UPDATE TBL_MS_PARAMETROS
             SET VALOR=?,
             FECHA_MODIFICACION=NOW()
             WHERE PARAMETRO='BITACORA_ESTADO'`,

            [estado]

        );

        res.json({

            ok:true,
            mensaje:"Estado actualizado"

        });

    }catch(err){

        console.error(err);

        res.json({
            ok:false
        });

    }

});

module.exports = router;