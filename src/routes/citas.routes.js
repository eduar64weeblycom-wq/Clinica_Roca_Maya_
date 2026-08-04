const express = require("express");
const router = express.Router(); 
const pool = require("../database/db");
const { registrarBitacora } = require("../services/bitacora.service");

router.get("/", async (req, res) => {
  try {
    res.render("citas", { title: "Citas Médicas - Roca Maya" });
  } catch (err) {
    console.error("GET /citas error:", err);
    res.status(500).send("Error interno");
  }
});

router.get("/api/datos", async (req, res) => {
  try {
    // Citas: mostrar Programada, Confirmada, Finalizada, Cancelada, No_Asistio
    const [citas] = await pool.query(`
      SELECT 
        c.ID_CITA,
        c.ID_PACIENTE,
        CONCAT(p.NOMBRES,' ',p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.TELEFONO AS TELEFONO_PACIENTE,
        p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
        p.NUMERO_DOCUMENTO_IDENTIDAD AS IDENTIDAD_PACIENTE,
        d.ID_USUARIO AS ID_DOCTOR,
        d.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
        d.CORREO_ELECTRONICO AS CORREO_DOCTOR,
        (SELECT GROUP_CONCAT(DISTINCT e.NOMBRE_ESPECIALIDAD SEPARATOR ', ')
         FROM TBL_DOCTOR_ESPECIALIDAD de2
         INNER JOIN TBL_ESPECIALIDADES e ON de2.ID_ESPECIALIDAD = e.ID_ESPECIALIDAD
         WHERE de2.ID_DOCTOR = d.ID_USUARIO) AS ESPECIALIDAD,
        c.FECHA_CITA,
        DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
        c.ESTADO,
        COALESCE(c.TIPO_CITA,'PRIMERA_VEZ') AS TIPO_CITA,
        COALESCE(c.PRIORIDAD,'NORMAL') AS PRIORIDAD,
        COALESCE(c.MOTIVO_CONSULTA,'') AS MOTIVO_CONSULTA,
        c.DURACION_ESTIMADA_MIN,
        c.FECHA_FIN_ESTIMADA,
        c.CANAL_REGISTRO
      FROM TBL_CITAS c
      INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO d ON c.ID_DOCTOR = d.ID_USUARIO
      WHERE c.ESTADO IN ('PROGRAMADA','CONFIRMADA','FINALIZADA','CANCELADA','NO_ASISTIO')
      GROUP BY c.ID_CITA
      ORDER BY 
        FIELD(c.ESTADO,'CONFIRMADA','PROGRAMADA','FINALIZADA','NO_ASISTIO','CANCELADA'),
        c.FECHA_CITA DESC
    `);

    // DEBUG para verificar que la especialidad llega
    if (citas.length > 0) {
      console.log('📋 Primera cita - ESPECIALIDAD:', citas[0].ESPECIALIDAD);
    }

    const [doctores] = await pool.query(`
      SELECT 
        u.ID_USUARIO AS ID_DOCTOR,
        u.NOMBRE_USUARIO AS NOMBRE,
        GROUP_CONCAT(DISTINCT COALESCE(e.NOMBRE_ESPECIALIDAD, 'Medicina General') SEPARATOR ', ') AS ESPECIALIDAD,
        u.CORREO_ELECTRONICO
      FROM TBL_MS_USUARIO u
      LEFT JOIN TBL_DOCTOR_ESPECIALIDAD de ON u.ID_USUARIO = de.ID_DOCTOR
      LEFT JOIN TBL_ESPECIALIDADES e ON de.ID_ESPECIALIDAD = e.ID_ESPECIALIDAD
      WHERE u.ESTADO = 'ACTIVO' AND u.ID_ROL = (SELECT ID_ROL FROM TBL_MS_ROLES WHERE ROL = 'DOCTOR')
      GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO, u.CORREO_ELECTRONICO
      ORDER BY u.NOMBRE_USUARIO
    `);

    const [pacientes] = await pool.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS, TELEFONO, CORREO_ELECTRONICO, NUMERO_DOCUMENTO_IDENTIDAD
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES, APELLIDOS
    `);

    const tipos = ["PRIMERA_VEZ", "CONTROL", "EMERGENCIA", "PROCEDIMIENTO"];
    const prioridades = ["NORMAL", "URGENTE", "ALTA"];
    const canales = ["PRESENCIAL", "TELEFONO", "WEB", "MOVIL", "API"];
    const duraciones = [15, 20, 30, 45, 60];

    res.json({
      citas,
      doctores,
      pacientes,
      metadata: { tipos, prioridades, canales, duraciones },
    });
  } catch (err) {
    console.error("Error GET /citas/api/datos:", err);
    res.status(500).json({
      citas: [],
      doctores: [],
      pacientes: [],
      metadata: {},
      error: err.message,
    });
  }
});

// CREAR CITA
router.post("/nueva", async (req, res) => {
  try {
    const {
      paciente,
      doctor,
      fechaCita,
      tipoCita,
      prioridad,
      motivo,
      duracion,
      canal,
    } = req.body;

    if (!paciente || !doctor || !fechaCita) {
      return res
        .status(400)
        .json({ success: false, message: "Faltan campos obligatorios" });
    }

    const fecha = new Date(fechaCita);
    if (isNaN(fecha.getTime()))
      return res
        .status(400)
        .json({ success: false, message: "Fecha inválida" });
    if (fecha < new Date())
      return res.status(400).json({
        success: false,
        message: "No se puede programar en el pasado",
      });

    const durMin = Number(duracion) || Number(req.body.duracion) || 30;
    const fechaFin = new Date(fecha.getTime() + durMin * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const mysqlFecha = `${fecha.getFullYear()}-${pad(
      fecha.getMonth() + 1
    )}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(
      fecha.getMinutes()
    )}:${pad(fecha.getSeconds())}`;
    const mysqlFin = `${fechaFin.getFullYear()}-${pad(
      fechaFin.getMonth() + 1
    )}-${pad(fechaFin.getDate())} ${pad(fechaFin.getHours())}:${pad(
      fechaFin.getMinutes()
    )}:${pad(fechaFin.getSeconds())}`;

    // Obtener nombres detallados del paciente y doctor para la bitácora
    const [pacienteInfo] = await pool.query(
      `SELECT NOMBRES, APELLIDOS FROM TBL_PACIENTE WHERE ID_PACIENTE = ?`,
      [paciente]
    );
    const [doctorInfo] = await pool.query(
      `SELECT NOMBRE_USUARIO FROM TBL_MS_USUARIO WHERE ID_USUARIO = ?`,
      [doctor]
    );

    const nombrePacienteStr = pacienteInfo.length > 0 ? `${pacienteInfo[0].NOMBRES} ${pacienteInfo[0].APELLIDOS}` : `ID ${paciente}`;
    const nombreDoctorStr = doctorInfo.length > 0 ? doctorInfo[0].NOMBRE_USUARIO : `ID ${doctor}`;

    const [dupRows] = await pool.query(
      `
      SELECT ID_CITA
      FROM TBL_CITAS
      WHERE ESTADO <> 'CANCELADA'
        AND
        (
          ID_DOCTOR = ?
          OR
          ID_PACIENTE = ?
        )
        AND
        (
          (? < FECHA_FIN_ESTIMADA)
          AND
          (? > FECHA_CITA)
        )
      LIMIT 1
    `,
      [doctor, paciente, mysqlFecha, mysqlFin]
    );

    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CITA",
        message: "Ya existe una cita programada para ese paciente o doctor en ese horario.",
      });
    }

    const idUsuarioCreador =
      req.user && req.user.ID_USUARIO ? req.user.ID_USUARIO : 1;
    const usuarioCreacionStr =
      req.user && req.user.USUARIO ? req.user.USUARIO : "SISTEMA";

    const [result] = await pool.query(
      `INSERT INTO TBL_CITAS (ID_PACIENTE, ID_DOCTOR, FECHA_CITA, FECHA_FIN_ESTIMADA, DURACION_ESTIMADA_MIN, MOTIVO_CONSULTA, ESTADO, TIPO_CITA, PRIORIDAD, CANAL_REGISTRO, ID_USUARIOCREADOR, USUARIO_CREACION)
        VALUES (?, ?, ?, ?, ?, ?, 'PROGRAMADA', ?, ?, ?, ?, ?)`,
      [
        paciente,
        doctor,
        mysqlFecha,
        mysqlFin,
        durMin,
        motivo || null,
        tipoCita || "PRIMERA_VEZ",
        prioridad || "NORMAL",
        canal || "PRESENCIAL",
        idUsuarioCreador,
        usuarioCreacionStr,
      ]
    );

    await registrarBitacora({
      usuario: usuarioCreacionStr,
      accion: "CREACION_CITA",
      descripcion: `El usuario '${usuarioCreacionStr}' creó la cita ID ${result.insertId} para el paciente '${nombrePacienteStr}' (ID: ${paciente}) con el doctor '${nombreDoctorStr}' (ID: ${doctor})`,
      modulo: "CITAS",
      idRegistro: result.insertId,
      tabla: "TBL_CITAS",
      estado: "EXITO",
      req,
    });

    try {
      const emitter = req.app.get("emitter");
      if (emitter && typeof emitter.emit === "function") {
        emitter.emit("cita:creada", {
          idCita: result.insertId,
          pacienteId: paciente,
          doctorId: doctor,
          fecha,
          durMin,
          canal,
          motivo,
          usuario: usuarioCreacionStr,
        });
      }
    } catch (emitErr) {
      console.warn("Emitter no disponible:", emitErr);
    }

    res.json({
      success: true,
      message: "Cita creada correctamente",
      idCita: result.insertId,
    });
  } catch (err) {
    console.error("POST /citas/nueva error:", err);
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CITA",
        message: "Cita duplicada (DB).",
      });
    }
    await registrarBitacora({
      usuario: req.user ? req.user.USUARIO : "SISTEMA",
      accion: "ERROR_CREACION_CITA",
      descripcion: err.message,
      modulo: "CITAS",
      tabla: "TBL_CITAS",
      estado: "ERROR",
      detalleError: err.message,
      req,
    });
    res.status(500).json({
      success: false,
      message: "Error creando la cita: " + err.message,
    });
  }
});

async function handleCambiarEstado(req, res) {
  try {
    const { idCita, nuevoEstado } = req.body;
    if (!idCita || !nuevoEstado)
      return res
        .status(400)
        .json({ success: false, message: "Parámetros requeridos" });

    const usuario = req.user ? req.user.USUARIO : "SISTEMA";

    // Obtener datos de la cita, paciente y doctor para detallar la bitácora
    const [citaInfo] = await pool.query(
      `SELECT c.ID_PACIENTE, c.ID_DOCTOR, p.NOMBRES, p.APELLIDOS, d.NOMBRE_USUARIO 
       FROM TBL_CITAS c
       INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
       INNER JOIN TBL_MS_USUARIO d ON c.ID_DOCTOR = d.ID_USUARIO
       WHERE c.ID_CITA = ?`,
      [idCita]
    );

    const [result] = await pool.query(
      `UPDATE TBL_CITAS SET ESTADO = ?, FECHA_MODIFICACION = CURRENT_TIMESTAMP, USUARIO_MODIFICACION = ? WHERE ID_CITA = ?`,
      [nuevoEstado, usuario, idCita]
    );
    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ success: false, message: "Cita no encontrada" });

    let descripcionBitacora = `El usuario '${usuario}' cambió el estado de la cita ID ${idCita} a '${nuevoEstado}'`;
    if (citaInfo.length > 0) {
      const { NOMBRES, APELLIDOS, NOMBRE_USUARIO, ID_PACIENTE, ID_DOCTOR } = citaInfo[0];
      descripcionBitacora = `El usuario '${usuario}' cambió el estado de la cita ID ${idCita} del paciente '${NOMBRES} ${APELLIDOS}' (ID: ${ID_PACIENTE}) con el doctor '${NOMBRE_USUARIO}' (ID: ${ID_DOCTOR}) a '${nuevoEstado}'`;
    }

    await registrarBitacora({
      usuario,
      accion: "CAMBIO_ESTADO_CITA",
      descripcion: descripcionBitacora,
      modulo: "CITAS",
      idRegistro: idCita,
      tabla: "TBL_CITAS",
      estado: "EXITO",
      req,
    });

    res.json({ success: true, message: "Estado actualizado" });
  } catch (err) {
    console.error("POST /citas/cambiar-estado error:", err);
    await registrarBitacora({
      usuario: req.user ? req.user.USUARIO : "SISTEMA",
      accion: "ERROR_CAMBIO_ESTADO_CITA",
      descripcion: err.message,
      modulo: "CITAS",
      tabla: "TBL_CITAS",
      estado: "ERROR",
      detalleError: err.message,
      req,
    });
    res.status(500).json({
      success: false,
      message: "Error cambiando estado: " + err.message,
    });
  }
}

// EDITAR CITA
router.post("/editar", async (req, res) => {
  try {
    const {
      idCita,
      paciente,
      doctor,
      fechaCita,
      tipoCita,
      prioridad,
      motivo,
      duracion,
      canal,
      estado
    } = req.body;

    if (!idCita || !paciente || !doctor || !fechaCita) {
      return res.status(400).json({ 
        success: false, 
        message: "Faltan campos obligatorios" 
      });
    }

    const fecha = new Date(fechaCita);
    if (isNaN(fecha.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: "Fecha inválida" 
      });
    }

    if (fecha < new Date()) {
      return res.status(400).json({
        success: false,
        message: "No se puede programar en el pasado",
      });
    }

    const durMin = Number(duracion) || 30;
    const fechaFin = new Date(fecha.getTime() + durMin * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const mysqlFecha = `${fecha.getFullYear()}-${pad(
      fecha.getMonth() + 1
    )}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(
      fecha.getMinutes()
    )}:${pad(fecha.getSeconds())}`;
    const mysqlFin = `${fechaFin.getFullYear()}-${pad(
      fechaFin.getMonth() + 1
    )}-${pad(fechaFin.getDate())} ${pad(fechaFin.getHours())}:${pad(
      fechaFin.getMinutes()
    )}:${pad(fechaFin.getSeconds())}`;

    // Obtener nombres detallados del paciente y doctor para la bitácora
    const [pacienteInfo] = await pool.query(
      `SELECT NOMBRES, APELLIDOS FROM TBL_PACIENTE WHERE ID_PACIENTE = ?`,
      [paciente]
    );
    const [doctorInfo] = await pool.query(
      `SELECT NOMBRE_USUARIO FROM TBL_MS_USUARIO WHERE ID_USUARIO = ?`,
      [doctor]
    );

    const nombrePacienteStr = pacienteInfo.length > 0 ? `${pacienteInfo[0].NOMBRES} ${pacienteInfo[0].APELLIDOS}` : `ID ${paciente}`;
    const nombreDoctorStr = doctorInfo.length > 0 ? doctorInfo[0].NOMBRE_USUARIO : `ID ${doctor}`;

    // Verificar duplicados (excepto la misma cita)
    const [dupRows] = await pool.query(
      `
      SELECT ID_CITA
      FROM TBL_CITAS
      WHERE ESTADO <> 'CANCELADA'
        AND ID_CITA <> ?
        AND (
          ID_DOCTOR = ?
          OR ID_PACIENTE = ?
        )
        AND (
          (? < FECHA_FIN_ESTIMADA)
          AND
          (? > FECHA_CITA)
        )
      LIMIT 1
      `,
      [idCita, doctor, paciente, mysqlFecha, mysqlFin]
    );

    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CITA",
        message: "Ya existe una cita programada para ese paciente o doctor en ese horario.",
      });
    }

    const usuario = req.user ? req.user.USUARIO : "SISTEMA";

    const [result] = await pool.query(
      `UPDATE TBL_CITAS SET
        ID_PACIENTE = ?,
        ID_DOCTOR = ?,
        FECHA_CITA = ?,
        FECHA_FIN_ESTIMADA = ?,
        DURACION_ESTIMADA_MIN = ?,
        MOTIVO_CONSULTA = ?,
        TIPO_CITA = ?,
        PRIORIDAD = ?,
        CANAL_REGISTRO = ?,
        ESTADO = ?,
        FECHA_MODIFICACION = CURRENT_TIMESTAMP,
        USUARIO_MODIFICACION = ?
      WHERE ID_CITA = ?`,
      [
        paciente,
        doctor,
        mysqlFecha,
        mysqlFin,
        durMin,
        motivo || null,
        tipoCita || "PRIMERA_VEZ",
        prioridad || "NORMAL",
        canal || "PRESENCIAL",
        estado || "PROGRAMADA",
        usuario,
        idCita
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Cita no encontrada"
      });
    }

    await registrarBitacora({
      usuario: usuario,
      accion: "EDICION_CITA",
      descripcion: `El usuario '${usuario}' editó la cita ID ${idCita} para el paciente '${nombrePacienteStr}' (ID: ${paciente}) con el doctor '${nombreDoctorStr}' (ID: ${doctor})`,
      modulo: "CITAS",
      idRegistro: idCita,
      tabla: "TBL_CITAS",
      estado: "EXITO",
      req,
    });

    res.json({
      success: true,
      message: "Cita actualizada correctamente",
      idCita: idCita,
    });
  } catch (err) {
    console.error("POST /citas/editar error:", err);
    await registrarBitacora({
      usuario: req.user ? req.user.USUARIO : "SISTEMA",
      accion: "ERROR_EDICION_CITA",
      descripcion: err.message,
      modulo: "CITAS",
      tabla: "TBL_CITAS",
      estado: "ERROR",
      detalleError: err.message,
      req,
    });
    res.status(500).json({
      success: false,
      message: "Error actualizando la cita: " + err.message,
    });
  }
});

// ELIMINAR CITA
router.delete("/eliminar/:id", async (req, res) => {
  try {
    const idCita = req.params.id;
    
    if (!idCita) {
      return res.status(400).json({
        success: false,
        message: "ID de cita requerido"
      });
    }

    const usuario = req.user ? req.user.USUARIO : "SISTEMA";

    // Verificar que la cita existe y obtener datos del paciente y doctor
    const [cita] = await pool.query(
      `SELECT c.ID_CITA, c.ESTADO, c.ID_PACIENTE, c.ID_DOCTOR, p.NOMBRES, p.APELLIDOS, d.NOMBRE_USUARIO 
       FROM TBL_CITAS c
       INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
       INNER JOIN TBL_MS_USUARIO d ON c.ID_DOCTOR = d.ID_USUARIO
       WHERE c.ID_CITA = ?`,
      [idCita]
    );

    if (cita.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cita no encontrada"
      });
    }

    const { ID_PACIENTE, ID_DOCTOR, NOMBRES, APELLIDOS, NOMBRE_USUARIO } = cita[0];

    // Eliminar la cita
    const [result] = await pool.query(
      `DELETE FROM TBL_CITAS WHERE ID_CITA = ?`,
      [idCita]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Cita no encontrada"
      });
    }

    await registrarBitacora({
      usuario: usuario,
      accion: "ELIMINACION_CITA",
      descripcion: `El usuario '${usuario}' eliminó la cita ID ${idCita} del paciente '${NOMBRES} ${APELLIDOS}' (ID: ${ID_PACIENTE}) con el doctor '${NOMBRE_USUARIO}' (ID: ${ID_DOCTOR})`,
      modulo: "CITAS",
      idRegistro: idCita,
      tabla: "TBL_CITAS",
      estado: "EXITO",
      req,
    });

    res.json({
      success: true,
      message: "Cita eliminada correctamente",
      idCita: idCita,
    });
  } catch (err) {
    console.error("DELETE /citas/eliminar/:id error:", err);
    await registrarBitacora({
      usuario: req.user ? req.user.USUARIO : "SISTEMA",
      accion: "ERROR_ELIMINACION_CITA",
      descripcion: err.message,
      modulo: "CITAS",
      tabla: "TBL_CITAS",
      estado: "ERROR",
      detalleError: err.message,
      req,
    });
    res.status(500).json({
      success: false,
      message: "Error eliminando la cita: " + err.message,
    });
  }
});

router.post("/cambiar-estado", handleCambiarEstado);
router.post("/estado", handleCambiarEstado); // alias (frontend antiguo)

module.exports = router;