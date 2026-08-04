const express = require("express");
const router = express.Router();
const db = require('../database/db');
const { verificarSesion } = require("../middleware/auth.middleware");
const bcrypt = require('bcryptjs');

// Todas las rutas de dashboard requieren sesión
router.use(verificarSesion);

// Ruta del dashboard principal
router.get("/", async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    
    const [userData] = await db.query(`
      SELECT u.ID_USUARIO, u.USUARIO, u.NOMBRE_USUARIO, u.CORREO_ELECTRONICO, r.ROL, r.ID_ROL
      FROM TBL_MS_USUARIO u
      INNER JOIN TBL_MS_ROLES r ON u.ID_ROL = r.ID_ROL
      WHERE u.USUARIO = ?
    `, [usuario]);

    if (userData.length === 0) {
      return res.redirect("/auth/login");
    }

    const rol = userData[0].ROL;
    const nombreUsuario = userData[0].NOMBRE_USUARIO;
    const email = userData[0].CORREO_ELECTRONICO || null;

    // Estadísticas según el rol
    let stats = {
      pacientes: 0,
      citasHoy: 0,
      consultasDiarias: 0,
      medicamentos: 0
    };

    if (rol === 'ADMINISTRADOR' || rol === 'ENFERMERA') {
      const [pacientes] = await db.query(
        "SELECT COUNT(*) as total FROM TBL_PACIENTE WHERE ESTADO = 'ACTIVO'"
      );
      stats.pacientes = pacientes[0]?.total || 0;
    }

    if (rol === 'ADMINISTRADOR' || rol === 'RECEPCIONISTA') {
      const [citas] = await db.query(`
        SELECT COUNT(*) as total FROM TBL_CITAS 
        WHERE DATE(FECHA_CITA) = CURDATE()
      `);
      stats.citasHoy = citas[0]?.total || 0;
    }

    if (rol === 'ADMINISTRADOR' || rol === 'DOCTOR') {
      const [consultas] = await db.query(`
        SELECT COUNT(*) as total FROM TBL_CONSULTA_MEDICA 
        WHERE DATE(FECHA_CONSULTA) = CURDATE()
      `);
      stats.consultasDiarias = consultas[0]?.total || 0;
    }

    if (rol === 'ADMINISTRADOR') {
      const [medicamentos] = await db.query(
        "SELECT COUNT(*) as total FROM TBL_INVENTARIO_MEDICAMENTOS WHERE ESTADO = 'ACTIVO'"
      );
      stats.medicamentos = medicamentos[0]?.total || 0;
    }

    res.render("dashboard", {
      rol: rol,
      nombreUsuario: nombreUsuario,
      usuario: usuario,
      email: email,
      stats: stats
    });

  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).send("Error al cargar el dashboard");
  }
});

// Ruta de bienvenida (alias)
router.get("/dashboard", async (req, res) => {
  res.redirect("/dashboard");
});

// ============================================================
// RUTA PARA OBTENER PERMISOS DEL MENÚ (PARA EL DASHBOARD)
// ============================================================
router.get('/permisos', async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    
    if (!usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Obtener el ID_ROL del usuario actual
    const [userData] = await db.query(`
      SELECT ID_ROL 
      FROM TBL_MS_USUARIO 
      WHERE USUARIO = ?
    `, [usuario]);

    if (userData.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const idRol = userData[0].ID_ROL;

    // Obtener permisos del rol (SOLO CONSULTA para mostrar en menú)
    const [permisos] = await db.query(`
      SELECT 
        p.ID_OBJETO as id,
        p.PERMISO_CONSULTA as consulta,
        o.OBJETO as nombre,
        o.TIPO_OBJETO as tipo
      FROM TBL_PERMISOS p
      INNER JOIN TBL_OBJETOS o ON p.ID_OBJETO = o.ID_OBJETO
      WHERE p.ID_ROL = ?
      ORDER BY o.ID_OBJETO
    `, [idRol]);

    res.json({
      success: true,
      rol: idRol,
      permisos: permisos
    });

  } catch (error) {
    console.error('Error al obtener permisos:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al cargar los permisos' 
    });
  }
});

// ============================================================
// RUTA PARA CAMBIAR CONTRASEÑA
// ============================================================
router.post('/cambiar-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const usuario = req.usuarioActual;

    if (!usuario) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    // Validar nueva contraseña
    if (newPassword.length < 9 || newPassword.length > 15) {
      return res.status(400).json({ 
        success: false, 
        error: 'La contraseña debe tener entre 9 y 15 caracteres' 
      });
    }

    // Obtener usuario actual
    const [userData] = await db.query(`
      SELECT ID_USUARIO, CONTRASENA 
      FROM TBL_MS_USUARIO 
      WHERE USUARIO = ?
    `, [usuario]);

    if (userData.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const userId = userData[0].ID_USUARIO;
    const hashedPassword = userData[0].CONTRASENA;

    // Verificar contraseña actual
    const isMatch = await bcrypt.compare(currentPassword, hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Contraseña actual incorrecta' });
    }

    // Hashear nueva contraseña
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    await db.query(`
      UPDATE TBL_MS_USUARIO 
      SET CONTRASENA = ?, 
          FECHA_MODIFICACION = NOW(),
          USUARIO_MODIFICACION = ?
      WHERE ID_USUARIO = ?
    `, [newHashedPassword, usuario, userId]);

    // Registrar en bitácora
    await db.query(`
      CALL SP_REGISTRAR_BITACORA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      'CAMBIO_CONTRASENA',
      `Usuario ${usuario} cambió su contraseña`,
      'SEGURIDAD',
      userId,
      'TBL_MS_USUARIO',
      req.ip || null,
      req.headers['user-agent'] || null,
      'EXITO',
      null,
      usuario
    ]);

    res.json({ 
      success: true, 
      message: 'Contraseña cambiada exitosamente' 
    });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// Obtener estadísticas del dashboard para AJAX
router.get('/stats', async (req, res) => {
  try {
    const usuario = req.usuarioActual;
    
    const [userData] = await db.query(`
      SELECT r.ROL
      FROM TBL_MS_USUARIO u
      INNER JOIN TBL_MS_ROLES r ON u.ID_ROL = r.ID_ROL
      WHERE u.USUARIO = ?
    `, [usuario]);
    
    const rol = userData[0]?.ROL || '';
    
    let stats = {
      pacientesActivos: 0,
      citasHoy: 0,
      consultasHoy: 0,
      medicamentosActivos: 0
    };
    
    if (rol === 'ADMINISTRADOR' || rol === 'ENFERMERA') {
      const [pacientes] = await db.query(
        "SELECT COUNT(*) as total FROM TBL_PACIENTE WHERE ESTADO = 'ACTIVO'"
      );
      stats.pacientesActivos = pacientes[0]?.total || 0;
    }
    
    if (rol === 'ADMINISTRADOR' || rol === 'RECEPCIONISTA') {
      const [citas] = await db.query(`
        SELECT COUNT(*) as total FROM TBL_CITAS 
        WHERE DATE(FECHA_CITA) = CURDATE()
      `);
      stats.citasHoy = citas[0]?.total || 0;
    }
    
    if (rol === 'ADMINISTRADOR' || rol === 'DOCTOR') {
      const [consultas] = await db.query(`
        SELECT COUNT(*) as total FROM TBL_CONSULTA_MEDICA 
        WHERE DATE(FECHA_CONSULTA) = CURDATE()
      `);
      stats.consultasHoy = consultas[0]?.total || 0;
    }
    
    if (rol === 'ADMINISTRADOR') {
      const [medicamentos] = await db.query(
        "SELECT COUNT(*) as total FROM TBL_INVENTARIO_MEDICAMENTOS WHERE ESTADO = 'ACTIVO'"
      );
      stats.medicamentosActivos = medicamentos[0]?.total || 0;
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Error al cargar las estadísticas' });
  }
});

module.exports = router;