const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");
const fs = require("fs");
const EventEmitter = require("events");
const emitter = new EventEmitter();
const pool = require("./database/db");
const { registrarBitacora } = require("./services/bitacora.service");
const { enviarCorreo } = require("./services/email.service");
const { verificarSesion } = require("./middleware/auth.middleware");
const app = express();

// ============================================================
// MIDDLEWARES
// ============================================================

// ========== SEGURIDAD HELMET CON CSP ==========
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com"
        ],
        fontSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:"
        ]
      }
    }
  })
);

// ========== CORS ==========
app.use(cors());

// ========== LOGS ==========
app.use(morgan("dev"));

// ========== COOKIE PARSER ==========
app.use(cookieParser());

// ========== RATE LIMIT ==========
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Demasiadas solicitudes. Intenta más tarde.",
  })
);

// ========== JSON Y URL ENCODED ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========== VIEW ENGINE ==========
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname, "public")));

// ========== EMITTER ==========
app.set("emitter", emitter);

// ============================================================
// MIDDLEWARE DE AUTENTICACIÓN GLOBAL (MEJORADO)
// ============================================================
app.use(async (req, res, next) => {
  // Intentar obtener usuario desde cookie o session
  const usuario = req.cookies.user || req.session?.user?.usuario;
  
  if (usuario) {
    try {
      const [userData] = await pool.query(`
        SELECT 
          u.ID_USUARIO,
          u.USUARIO,
          u.NOMBRE_USUARIO,
          u.ESTADO,
          u.CORREO_ELECTRONICO,
          r.ROL,
          r.ID_ROL
        FROM TBL_MS_USUARIO u
        INNER JOIN TBL_MS_ROLES r ON u.ID_ROL = r.ID_ROL
        WHERE u.USUARIO = ?
      `, [usuario]);
      
      if (userData.length > 0) {
        // ========== ESTABLECER req.user ==========
        req.user = userData[0];
        req.usuarioActual = usuario;
        
        // ========== VARIABLES PARA VISTAS ==========
        res.locals.usuarioLogueado = usuario;
        res.locals.rolUsuario = userData[0].ROL;
        res.locals.nombreUsuario = userData[0].NOMBRE_USUARIO;
        res.locals.usuario = userData[0];
        res.locals.user = userData[0];
        res.locals.rol = userData[0].ROL;
        res.locals.email = userData[0].CORREO_ELECTRONICO;
        
        console.log(` Usuario autenticado: ${usuario} (${userData[0].ROL})`);
      } else {
        console.log(` Usuario no encontrado en BD: ${usuario}`);
        res.clearCookie('user');
        if (req.session) {
          delete req.session.user;
        }
      }
    } catch (err) {
      console.error(" Error obteniendo datos de usuario:", err);
    }
  }
  next();
});

// ============================================================
// RUTAS - Montaje de routers
// ============================================================

// ========== RUTA PRINCIPAL ==========
app.get("/", (req, res) => res.redirect("/dashboard"));

// ========== RUTAS DE AUTENTICACIÓN ==========
app.use("/auth", require("./routes/auth.routes"));
app.use("/2fa", require("./routes/twofa.routes"));

// ========== RUTAS DE DASHBOARD ==========
app.use("/dashboard", verificarSesion, require("./routes/dashboard.routes"));

// ========== RUTAS DE USUARIOS Y ROLES ==========
app.use("/users", require("./routes/users.routes"));
app.use("/roles", require("./routes/roles.routes"));

// ========== RUTAS DE BITÁCORA ==========
app.use("/bitacora", require("./routes/bitacora.routes"));
app.use("/bitacora/parametros", require("./routes/parametros.routes"));

// ========== RUTAS DE MÓDULOS MÉDICOS ==========
app.use("/especialidades", require("./routes/especialidades.routes"));
app.use("/historial", require("./routes/historial-medico.routes"));
app.use("/citas", require("./routes/citas.routes"));
app.use("/pacientes", require("./routes/pacientes.routes"));
app.use("/preclinica", require("./routes/preclinica.routes"));
app.use('/inventario', require('./routes/inventarioMedicamentos.routes'));
app.use("/excel", require("./routes/excel.routes"));

// ========== RUTAS DE CONSULTA MÉDICA ==========
const consultaRouter = require("./routes/consultaMedica.routes");
app.use("/consultaMedica", consultaRouter);
app.use("/consulta", consultaRouter);


// ============================================================
// RUTA DE LOGOUT
// ============================================================
app.get("/logout", (req, res) => {
  res.clearCookie("user");
  if (req.session) {
    req.session.destroy();
  }
  res.redirect("/auth/login");
});

// ============================================================
// RUTA DE DESCARGA DE BACKUP (MEJORADA)
// ============================================================
app.get("/descargar-backup", (req, res) => {
  try {
    // Intentar diferentes rutas posibles
    const posiblesRutas = [
      "C:/Users/esthe/Desktop/BACKEND/src/Roca_Maya.sql",
      path.join(__dirname, "Roca_Maya.sql"),
      path.join(__dirname, "backups", "Roca_Maya.sql"),
      path.join(__dirname, "../Roca_Maya.sql")
    ];
    
    let rutaEncontrada = null;
    for (const ruta of posiblesRutas) {
      if (fs.existsSync(ruta)) {
        rutaEncontrada = ruta;
        break;
      }
    }
    
    if (rutaEncontrada) {
      res.setHeader("Content-Type", "application/sql");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Roca_Maya_${new Date().toISOString().split('T')[0]}.sql"`
      );
      res.sendFile(rutaEncontrada);
    } else {
      // Crear backup temporal si no existe archivo
      const backupContent = `-- Backup Clínicas Roca Maya\n-- Fecha: ${new Date().toLocaleString()}\n-- Backup temporal\n\n-- ============================================================\n-- USUARIO ADMIN: admin / Admin123!\n-- ============================================================`;
      res.setHeader("Content-Type", "application/sql");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Backup_Temporal_${new Date().toISOString().split('T')[0]}.sql"`
      );
      res.send(backupContent);
    }
  } catch (error) {
    console.error(" Error en descargar-backup:", error);
    res.status(500).send("Error: " + error.message);
  }
});

// ============================================================
// MIDDLEWARE DE SESSION FLASH
// ============================================================
app.use((req, res, next) => {
  res.locals.success = req.query.success || req.flash?.success;
  res.locals.error = req.query.error || req.flash?.error;
  next();
});

// ============================================================
// INICIALIZAR TAREAS PROGRAMADAS (CRON)
// ============================================================
try {
  const { iniciarCronRecordatorios } = require("./services/reminder.service");
  iniciarCronRecordatorios();
  console.log(" CRON de recordatorios iniciado");
} catch (error) {
  console.warn(" CRON de recordatorios no disponible:", error.message);
}

// ============================================================
// EVENT LISTENER PARA EMAILS (CITA CREADA)
// ============================================================
emitter.on("cita:creada", async (payload) => {
  try {
    const {
      idCita,
      pacienteId,
      doctorId,
      fecha,
      durMin,
      canal,
      motivo,
      usuario,
    } = payload;
    const usuarioStr = usuario || "SISTEMA";

    const [pacRows] = await pool.query(
      `SELECT NOMBRES, APELLIDOS, CORREO_ELECTRONICO, TELEFONO FROM TBL_PACIENTE WHERE ID_PACIENTE = ? LIMIT 1`,
      [pacienteId]
    );
    const pacienteRow = pacRows && pacRows[0] ? pacRows[0] : null;

    const [docRows] = await pool.query(
      `SELECT NOMBRE_USUARIO, CORREO_ELECTRONICO FROM TBL_MS_USUARIO WHERE ID_USUARIO = ? LIMIT 1`,
      [doctorId]
    );
    const doctorRow = docRows && docRows[0] ? docRows[0] : null;

    if (!pacienteRow || !pacienteRow.CORREO_ELECTRONICO) {
      await registrarBitacora({
        usuario: usuarioStr,
        accion: "ENVIO_EMAIL_CITA",
        descripcion: `No se envió email: paciente ID ${pacienteId} no tiene correo registrado`,
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "TBL_PACIENTE",
        estado: "ADVERTENCIA",
        req: null,
      });
      return;
    }

    const pacienteNombre = `${pacienteRow.NOMBRES} ${pacienteRow.APELLIDOS}`.trim();
    const doctorNombre = doctorRow && doctorRow.NOMBRE_USUARIO
        ? doctorRow.NOMBRE_USUARIO
        : "Dr/a. (sin especificar)";
    
    const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
    const fechaReadable = fechaObj.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const horaReadable = fechaObj.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const duracionReadable = `${durMin || 30} minutos`;

    const esc = (s) =>
      s === undefined || s === null
        ? ""
        : String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const subjectPaciente = `Confirmación de cita - Clínicas Roca Maya (${fechaReadable} ${horaReadable})`;
    const htmlPaciente = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
        <p>Estimado(a) <strong>${esc(pacienteNombre)}</strong>,</p>
        <p>Se ha programado una cita médica en <strong>Clínicas Roca Maya</strong> con los siguientes detalles:</p>
        <ul>
          <li><strong>Fecha:</strong> ${esc(fechaReadable)}</li>
          <li><strong>Hora:</strong> ${esc(horaReadable)}</li>
          <li><strong>Doctor(a):</strong> ${esc(doctorNombre)}</li>
          <li><strong>Duración estimada:</strong> ${esc(duracionReadable)}</li>
          <li><strong>Canal:</strong> ${esc(canal || "PRESENCIAL")}</li>
          <li><strong>Motivo:</strong> ${esc(motivo || "No especificado")}</li>
        </ul>
        <p>Por favor llegue con 10 minutos de anticipación y lleve su identificación.</p>
        <p>Saludos cordiales,<br/>Clínicas Roca Maya</p>
      </div>
    `;

    let sentPaciente = false;
    try {
      const resultPaciente = await enviarCorreo(
        pacienteRow.CORREO_ELECTRONICO,
        subjectPaciente,
        htmlPaciente
      );
      sentPaciente = resultPaciente === true;
    } catch (errSend) {
      console.error("Error en enviarCorreo al paciente:", errSend);
      sentPaciente = false;
    }

    if (sentPaciente) {
      await registrarBitacora({
        usuario: usuarioStr,
        accion: "ENVIO_EMAIL_CITA_PACIENTE",
        descripcion: `Email de confirmación enviado a ${pacienteRow.CORREO_ELECTRONICO} para cita ID ${idCita}`,
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "TBL_PACIENTE",
        estado: "EXITO",
        req: null,
      });
    } else {
      await registrarBitacora({
        usuario: usuarioStr,
        accion: "ENVIO_EMAIL_CITA_PACIENTE",
        descripcion: `Error enviando email a ${pacienteRow.CORREO_ELECTRONICO} para cita ID ${idCita}`,
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "TBL_PACIENTE",
        estado: "ERROR",
        detalleError: "Falló enviarCorreo()",
        req: null,
      });
    }

    if (doctorRow && doctorRow.CORREO_ELECTRONICO) {
      const subjectDoctor = `Nueva cita asignada - Clínicas Roca Maya (${fechaReadable} ${horaReadable})`;
      const htmlDoctor = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
          <p>Estimado/a Dr./Dra. <strong>${esc(doctorNombre)}</strong>,</p>
          <p>Se le ha asignado una nueva cita médica en <strong>Clínicas Roca Maya</strong> con los siguientes detalles:</p>
          <ul>
            <li><strong>Paciente:</strong> ${esc(pacienteNombre)}</li>
            <li><strong>Fecha:</strong> ${esc(fechaReadable)}</li>
            <li><strong>Hora:</strong> ${esc(horaReadable)}</li>
            <li><strong>Duración estimada:</strong> ${esc(duracionReadable)}</li>
            <li><strong>Canal:</strong> ${esc(canal || "PRESENCIAL")}</li>
            <li><strong>Motivo:</strong> ${esc(motivo || "No especificado")}</li>
            <li><strong>Teléfono del paciente:</strong> ${esc(pacienteRow.TELEFONO || "No registrado")}</li>
            <li><strong>Correo del paciente:</strong> ${esc(pacienteRow.CORREO_ELECTRONICO || "No registrado")}</li>
          </ul>
          <p>Por favor confirme su disponibilidad para esta cita.</p>
          <p>Saludos cordiales,<br/>Clínicas Roca Maya</p>
        </div>
      `;

      let sentDoctor = false;
      try {
        const resultDoctor = await enviarCorreo(
          doctorRow.CORREO_ELECTRONICO,
          subjectDoctor,
          htmlDoctor
        );
        sentDoctor = resultDoctor === true;
      } catch (errSend) {
        console.error("Error en enviarCorreo al doctor:", errSend);
        sentDoctor = false;
      }

      if (sentDoctor) {
        await registrarBitacora({
          usuario: usuarioStr,
          accion: "ENVIO_EMAIL_CITA_DOCTOR",
          descripcion: `Email de confirmación enviado al doctor ${doctorRow.CORREO_ELECTRONICO} para cita ID ${idCita}`,
          modulo: "CITAS",
          idRegistro: idCita,
          tabla: "TBL_MS_USUARIO",
          estado: "EXITO",
          req: null,
        });
        console.log(` Correo enviado al doctor: ${doctorRow.CORREO_ELECTRONICO}`);
      } else {
        await registrarBitacora({
          usuario: usuarioStr,
          accion: "ENVIO_EMAIL_CITA_DOCTOR",
          descripcion: `Error enviando email al doctor ${doctorRow.CORREO_ELECTRONICO} para cita ID ${idCita}`,
          modulo: "CITAS",
          idRegistro: idCita,
          tabla: "TBL_MS_USUARIO",
          estado: "ERROR",
          detalleError: "Falló enviarCorreo()",
          req: null,
        });
      }
    } else {
      console.warn(` No se encontró correo del doctor para cita ${idCita}`);
      await registrarBitacora({
        usuario: usuarioStr,
        accion: "ENVIO_EMAIL_CITA_DOCTOR",
        descripcion: `No se envió email: doctor ID ${doctorId} no tiene correo registrado para cita ${idCita}`,
        modulo: "CITAS",
        idRegistro: idCita,
        tabla: "TBL_MS_USUARIO",
        estado: "ADVERTENCIA",
        req: null,
      });
    }

  } catch (err) {
    console.error(" Listener cita:creada error:", err);
    try {
      await registrarBitacora({
        usuario: "SISTEMA",
        accion: "ERROR_ENVIO_EMAIL_CITA",
        descripcion: err.message || String(err),
        modulo: "CITAS",
        idRegistro: null,
        tabla: "TBL_MS_USUARIO",
        estado: "ERROR",
        detalleError: err.message || String(err),
        req: null,
      });
    } catch (inner) {
      console.error("Error registrando bitácora desde listener:", inner);
    }
  }
});

// ============================================================
// EVENT LISTENER PARA EMAILS (RECORDATORIOS)
// ============================================================
emitter.on("email:recordatorio", async (payload) => {
  try {
    const { email, nombre, mensaje, subject } = payload;
    if (!email) return;
    
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
        <p>Estimado(a) <strong>${nombre || 'Usuario'}</strong>,</p>
        <p>${mensaje || 'Este es un recordatorio de Clínicas Roca Maya.'}</p>
        <br>
        <p>Saludos cordiales,<br/>Clínicas Roca Maya</p>
      </div>
    `;
    
    await enviarCorreo(email, subject || 'Recordatorio - Clínicas Roca Maya', html);
    console.log(` Email de recordatorio enviado a: ${email}`);
  } catch (error) {
    console.error(" Error enviando email recordatorio:", error);
  }
});

// ============================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================================================
app.use(errorHandler);

// ============================================================
// EXPORTAR APP
// ============================================================
module.exports = app;