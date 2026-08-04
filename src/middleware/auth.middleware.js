// middleware/auth.middleware.js
const pool = require("../database/db");

// Middleware para verificar que el usuario tiene sesión activa
const verificarSesion = async (req, res, next) => {
  const usuario = req.cookies.user;
  
  if (!usuario) {
    return res.redirect("/auth/login");
  }
  
  try {
    const [rows] = await pool.query(
      "SELECT ESTADO FROM TBL_MS_USUARIO WHERE USUARIO = ?",
      [usuario]
    );
    
    if (rows.length === 0 || rows[0].ESTADO !== 'ACTIVO') {
      res.clearCookie("user");
      return res.redirect("/auth/login?error=Usuario inactivo o no existe");
    }
    
    req.usuarioActual = usuario;
    next();
  } catch (error) {
    console.error("Error en verificarSesion:", error);
    res.redirect("/auth/login");
  }
};

// Función para obtener el rol del usuario
const obtenerRolUsuario = async (usuario) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.ROL
      FROM TBL_MS_USUARIO u
      INNER JOIN TBL_MS_ROLES r ON u.ID_ROL = r.ID_ROL
      WHERE u.USUARIO = ?
    `, [usuario]);
    
    return rows.length > 0 ? rows[0].ROL : null;
  } catch (error) {
    console.error("Error obteniendo rol:", error);
    return null;
  }
};

// Middleware para verificar permisos específicos
const verificarPermiso = (rolesPermitidos) => {
  return async (req, res, next) => {
    const usuario = req.cookies.user;
    
    if (!usuario) {
      return res.redirect("/auth/login");
    }
    
    const rol = await obtenerRolUsuario(usuario);
    
    if (!rol || !rolesPermitidos.includes(rol)) {
      return res.status(403).render("error", {
        mensaje: "No tienes permiso para acceder a esta página",
        error: { status: 403 }
      });
    }
    
    next();
  };
};

module.exports = {
  verificarSesion,
  obtenerRolUsuario,
  verificarPermiso
};