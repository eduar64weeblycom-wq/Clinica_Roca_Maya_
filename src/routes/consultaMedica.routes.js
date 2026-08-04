const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { registrarBitacora } = require('../services/bitacora.service');

router.get("/", async (req, res) => {
  try {
    // Obtener usuario de req.user (asignado por el middleware de app.js)
    const usuario = req.user || null;
    
    console.log(' Usuario en consultaMedica:', usuario);
    console.log(' Nombre:', usuario ? usuario.NOMBRE_USUARIO : 'No autenticado');
    console.log(' Rol:', usuario ? usuario.ROL : 'Sin rol');

    let citas = [];

    if (usuario && usuario.ROL === 'ADMINISTRADOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        ORDER BY c.FECHA_CITA DESC
      `);
      citas = rows;
      
    } else if (usuario && usuario.ROL === 'DOCTOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
          AND c.ID_DOCTOR = ?
        ORDER BY c.FECHA_CITA DESC
      `, [usuario.ID_USUARIO]);
      citas = rows;
    }

const [doctores] = await pool.query(`
  SELECT 
    u.ID_USUARIO, 
    u.NOMBRE_USUARIO 
  FROM TBL_MS_USUARIO u
  WHERE u.ESTADO = 'ACTIVO' 
    AND u.ID_ROL = (SELECT ID_ROL FROM TBL_MS_ROLES WHERE ROL = 'DOCTOR')
  GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO
  ORDER BY u.NOMBRE_USUARIO
`);

    res.render("consultaMedica", {
      citas: citas || [],
      doctores: doctores || [],
      user: usuario,
      nombreUsuario: usuario ? usuario.NOMBRE_USUARIO : 'Usuario',
      rol: usuario ? usuario.ROL : 'DOCTOR',
      title: "Consulta Médica - Clínicas Roca Maya"
    });

  } catch (err) {
    console.error("❌ Error en GET /consultaMedica:", err);
    res.status(500).render("consultaMedica", {
      citas: [],
      doctores: [],
      user: null,
      nombreUsuario: 'Usuario',
      rol: 'DOCTOR',
      error: "Error al cargar los datos de consulta médica",
      title: "Consulta Médica - Clínicas Roca Maya"
    });
  }
});
// ============================================================
// API: DATOS PARA CALENDARIO
// ============================================================
router.get("/api/calendario", async (req, res) => {
  try {
    const usuario = req.user || null;
    let citas = [];

    if (usuario && usuario.ROL === 'ADMINISTRADOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        ORDER BY c.FECHA_CITA ASC
      `);
      citas = rows;
    } else if (usuario && usuario.ROL === 'DOCTOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
          AND c.ID_DOCTOR = ?
        ORDER BY c.FECHA_CITA ASC
      `, [usuario.ID_USUARIO]);
      citas = rows;
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
  WHERE u.ESTADO = 'ACTIVO' 
    AND u.ID_ROL = (SELECT ID_ROL FROM TBL_MS_ROLES WHERE ROL = 'DOCTOR')
  GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO, u.CORREO_ELECTRONICO
  ORDER BY u.NOMBRE_USUARIO
`);
    res.json({
      success: true,
      citas: citas || [],
      doctores: doctores || []
    });

  } catch (err) {
    console.error("❌ Error en GET /consultaMedica/api/calendario:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener datos del calendario: " + err.message,
      citas: [],
      doctores: []
    });
  }
});

// ============================================================
// OBTENER CITA POR ID PARA EL CALENDARIO
// ============================================================
router.get("/api/cita-detalle/:idCita", async (req, res) => {
  const { idCita } = req.params;

  try {
    const [citaRows] = await pool.query(`
      SELECT 
        c.ID_CITA,
        c.ID_PACIENTE,
        c.ID_DOCTOR,
        c.FECHA_CITA,
        c.ESTADO,
        c.MOTIVO_CONSULTA,
        c.PRIORIDAD,
        c.TIPO_CITA,
        c.DURACION_ESTIMADA_MIN,
        c.OBSERVACIONES,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM TBL_CITAS c
      INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ID_CITA = ?
    `, [idCita]);

    if (citaRows.length === 0) {
      return res.status(404).json({ success: false, error: "Cita no encontrada" });
    }

    const cita = citaRows[0];

    // Verificar permisos
    const usuario = req.user || null;
    if (usuario && usuario.ROL === 'DOCTOR' && String(cita.ID_DOCTOR) !== String(usuario.ID_USUARIO)) {
      return res.status(403).json({ success: false, error: "No tienes permiso para ver esta cita" });
    }

    res.json({
      success: true,
      cita: cita
    });

  } catch (err) {
    console.error("❌ Error en GET /consultaMedica/api/cita-detalle/:idCita:", err);
    res.status(500).json({ success: false, error: "Error al obtener detalle de la cita" });
  }
});

// ============================================================
// OBTENER HISTORIAL RÁPIDO DEL PACIENTE
// ============================================================
router.get("/api/historial-rapido/:idPaciente", async (req, res) => {
  const { idPaciente } = req.params;

  try {
    // Últimas 5 consultas del paciente
    const [consultas] = await pool.query(`
      SELECT 
        cm.ID_CONSULTA,
        cm.FECHA_CONSULTA,
        cm.DIAGNOSTICO_PRINCIPAL,
        cm.TRATAMIENTO,
        cm.OBSERVACIONES,
        cm.TIPO_CONSULTA,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ?
      ORDER BY cm.FECHA_CONSULTA DESC
      LIMIT 5
    `, [idPaciente]);

    // Alergias y medicamentos actuales del historial médico
    const [historial] = await pool.query(`
      SELECT 
        ALERGIAS,
        MEDICAMENTOS_ACTUALES,
        ENFERMEDADES_CRONICAS,
        NOTAS_IMPORTANTES
      FROM TBL_HISTORIAL_MEDICO
      WHERE ID_PACIENTE = ?
    `, [idPaciente]);

    res.json({
      success: true,
      consultas: consultas || [],
      historial: historial.length > 0 ? historial[0] : null
    });

  } catch (err) {
    console.error("❌ Error en GET /consultaMedica/api/historial-rapido/:idPaciente:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener historial rápido: " + err.message
    });
  }
});

// ============================================================
// OBTENER DATOS PARA IMPRIMIR CONSULTA
// ============================================================
router.get("/api/imprimir-consulta/:idConsulta", async (req, res) => {
  const { idConsulta } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT 
        cm.*,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        p.FECHA_NACIMIENTO,
        p.GENERO,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
        c.FECHA_CITA,
        c.ESTADO AS ESTADO_CITA
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_PACIENTE p ON cm.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      INNER JOIN TBL_CITAS c ON cm.ID_CITA = c.ID_CITA
      WHERE cm.ID_CONSULTA = ?
    `, [idConsulta]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Consulta no encontrada" });
    }

    const consulta = rows[0];

    // Parsear arrays
    if (consulta.SINTOMAS && typeof consulta.SINTOMAS === 'string') {
      try { consulta.SINTOMAS = JSON.parse(consulta.SINTOMAS); } catch (e) { consulta.SINTOMAS = []; }
    }
    if (consulta.EXAMEN_FISICO && typeof consulta.EXAMEN_FISICO === 'string') {
      try { consulta.EXAMEN_FISICO = JSON.parse(consulta.EXAMEN_FISICO); } catch (e) { consulta.EXAMEN_FISICO = []; }
    }

    // Obtener preclínica
    const [preclinica] = await pool.query(`
      SELECT 
        TEMPERATURA,
        PRESION_SISTOLICA,
        PRESION_DIASTOLICA,
        FRECUENCIA_CARDIACA,
        FRECUENCIA_RESPIRATORIA,
        SATURACION_OXIGENO,
        PESO,
        TALLA,
        IMC,
        GLUCOSA,
        PERIMETRO_ABDOMINAL,
        ESTADO_GENERAL
      FROM TBL_PRECLINICA
      WHERE ID_CITA = ?
      ORDER BY FECHA_REGISTRO DESC
      LIMIT 1
    `, [consulta.ID_CITA]);

    res.json({
      success: true,
      consulta: consulta,
      preclinica: preclinica.length > 0 ? preclinica[0] : null
    });

  } catch (err) {
    console.error("❌ Error en GET /consultaMedica/api/imprimir-consulta/:idConsulta:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener datos para imprimir: " + err.message
    });
  }
});
// ============================================================
// API: /datos - Datos para el frontend
// ============================================================
router.get("/api/datos", async (req, res) => {
  try {
    const usuario = req.user || null;
    let citas = [];

    if (usuario && usuario.ROL === 'ADMINISTRADOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN,
          c.OBSERVACIONES
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
        ORDER BY c.FECHA_CITA ASC
      `);
      citas = rows;
      
    } else if (usuario && usuario.ROL === 'DOCTOR') {
      const [rows] = await pool.query(`
        SELECT 
          c.ID_CITA,
          CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
          p.ID_PACIENTE,
          p.TELEFONO AS TELEFONO_PACIENTE,
          p.CORREO_ELECTRONICO AS CORREO_PACIENTE,
          u.ID_USUARIO AS ID_DOCTOR,
          u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,
          c.FECHA_CITA,
          DATE_FORMAT(c.FECHA_CITA, '%H:%i') AS HORA_CITA,
          c.ESTADO,
          c.MOTIVO_CONSULTA,
          c.PRIORIDAD,
          c.TIPO_CITA,
          c.DURACION_ESTIMADA_MIN,
          c.OBSERVACIONES
        FROM TBL_CITAS c
        INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
        INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
        WHERE c.ESTADO IN ('CONSULTA_MEDICA', 'PRECLINICA')
          AND c.ID_DOCTOR = ?
        ORDER BY c.FECHA_CITA ASC
      `, [usuario.ID_USUARIO]);
      citas = rows;
    }

   const [doctores] = await pool.query(`
  SELECT 
    u.ID_USUARIO,
    u.NOMBRE_USUARIO,
    u.CORREO_ELECTRONICO,
    GROUP_CONCAT(DISTINCT COALESCE(e.NOMBRE_ESPECIALIDAD, 'Medicina General') SEPARATOR ', ') AS ESPECIALIDAD
  FROM TBL_MS_USUARIO u
  LEFT JOIN TBL_DOCTOR_ESPECIALIDAD de ON u.ID_USUARIO = de.ID_DOCTOR
  LEFT JOIN TBL_ESPECIALIDADES e ON de.ID_ESPECIALIDAD = e.ID_ESPECIALIDAD
  WHERE u.ESTADO = 'ACTIVO' 
    AND u.ID_ROL = (SELECT ID_ROL FROM TBL_MS_ROLES WHERE ROL = 'DOCTOR')
  GROUP BY u.ID_USUARIO, u.NOMBRE_USUARIO, u.CORREO_ELECTRONICO
  ORDER BY u.NOMBRE_USUARIO
`);

    const [pacientes] = await pool.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS, TELEFONO, CORREO_ELECTRONICO
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES, APELLIDOS
    `);

    const tipos = ["PRIMERA_VEZ", "CONTROL", "EMERGENCIA", "PROCEDIMIENTO"];
    const prioridades = ["NORMAL", "URGENTE", "ALTA"];
    const duraciones = [15, 20, 30, 45, 60];

    res.json({
      success: true,
      citas: citas || [],
      doctores: doctores || [],
      pacientes: pacientes || [],
      metadata: { tipos, prioridades, duraciones }
    });

  } catch (err) {
    console.error("❌ Error en GET /consultaMedica/api/datos:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener datos: " + err.message,
      citas: [],
      doctores: [],
      pacientes: [],
      metadata: {}
    });
  }
});
// ============================================================
// POST /nueva - Crear nueva consulta médica (CON AUTO-COMPLETADO)
// ============================================================
router.post("/nueva", async (req, res) => {
  try {
    const body = req.body;
    
    console.log(" Body recibido:", JSON.stringify(body, null, 2));

    // Extraer ID de la cita
    const idCita = body.idCita || body.citaId || body.ID_CITA;
    
    // ============================================================
    // 🔹 OBTENER DATOS FALTANTES DESDE LA BASE DE DATOS
    // ============================================================
    let idPaciente = body.idPaciente || body.pacienteId || body.ID_PACIENTE;
    let idDoctor = body.idDoctor || body.doctorId || body.ID_DOCTOR;
    
    // Si falta idPaciente o idDoctor, obtenerlos de la cita
    if (idCita && (!idPaciente || !idDoctor)) {
        const [citaData] = await pool.query(`
            SELECT ID_PACIENTE, ID_DOCTOR 
            FROM TBL_CITAS 
            WHERE ID_CITA = ?
        `, [idCita]);

        if (citaData.length > 0) {
            if (!idPaciente) {
                idPaciente = citaData[0].ID_PACIENTE;
                console.log(`🔹 ID_PACIENTE obtenido de la cita: ${idPaciente}`);
            }
            if (!idDoctor) {
                idDoctor = citaData[0].ID_DOCTOR;
                console.log(`🔹 ID_DOCTOR obtenido de la cita: ${idDoctor}`);
            }
        } else {
            return res.status(404).json({
                success: false,
                error: "La cita no existe"
            });
        }
    }
    
    // Extraer el resto de los datos
    const motivoConsulta = body.motivoConsulta || body.motivo || body.MOTIVO_CONSULTA || null;
    const sintomas = body.sintomas || body.SINTOMAS || [];
    const examenFisico = body.examenFisico || body.EXAMEN_FISICO || [];
    const diagnosticoPrincipal = body.diagnosticoPrincipal || body.diagnostico || body.DIAGNOSTICO_PRINCIPAL || null;
    const codigoCIE10Principal = body.codigoCIE10Principal || body.codigoCIE10 || body.CODIGO_CIE10_PRINCIPAL || null;
    const diagnosticoSecundario = body.diagnosticoSecundario || body.DIAGNOSTICO_SECUNDARIO || null;
    const codigoCIE10Secundario = body.codigoCIE10Secundario || body.CODIGO_CIE10_SECUNDARIO || null;
    const tratamiento = body.tratamiento || body.TRATAMIENTO || null;
    const recomendaciones = body.recomendaciones || body.RECOMENDACIONES || null;
    const observaciones = body.observaciones || body.OBSERVACIONES || body.examenesComplementarios || null;
    const tipoConsulta = body.tipoConsulta || body.TIPO_CONSULTA || 'GENERAL';
    const proximaCita = body.proximaCita || body.PROXIMA_CITA_RECOMENDADA || null;
    
    // Datos del historial médico
    const alergias = body.alergias || body.ALERGIAS || [];
    const enfermedadesCronicas = body.enfermedadesCronicas || body.ENFERMEDADES_CRONICAS || [];
    const cirugiasPrevias = body.cirugiasPrevias || body.CIRUGIAS_PREVIAS || [];
    const medicamentosActuales = body.medicamentosActuales || body.MEDICAMENTOS_ACTUALES || [];
    const antecedentesFamiliares = body.antecedentesFamiliares || body.ANTECEDENTES_FAMILIARES || [];
    const habitos = body.habitos || body.HABITOS || [];
    const vacunas = body.vacunas || body.VACUNAS || [];
    const notasImportantes = body.notasImportantes || body.NOTAS_IMPORTANTES || '';

    console.log(" Datos normalizados:", { idCita, idPaciente, idDoctor });

    // ============================================================
    // VALIDAR CAMPOS OBLIGATORIOS
    // ============================================================
    if (!idCita || !idPaciente || !idDoctor) {
        console.error(" Campos faltantes:", { idCita, idPaciente, idDoctor });
        return res.status(400).json({
            success: false,
            error: "Faltan campos obligatorios: idCita, idPaciente, idDoctor",
            recibido: { idCita, idPaciente, idDoctor }
        });
    }

    const usuarioCreacion = req.user?.USUARIO || 'SISTEMA';

    // ============================================================
    // 1. VERIFICAR QUE LA CITA EXISTA Y ESTÉ EN ESTADO CORRECTO
    // ============================================================
    const [citaExists] = await pool.query(
        "SELECT ID_CITA, ESTADO FROM TBL_CITAS WHERE ID_CITA = ?",
        [idCita]
    );

    if (citaExists.length === 0) {
        return res.status(404).json({
            success: false,
            error: "La cita no existe"
        });
    }

    if (citaExists[0].ESTADO !== 'CONSULTA_MEDICA' && citaExists[0].ESTADO !== 'PRECLINICA') {
        return res.status(400).json({
            success: false,
            error: `La cita está en estado "${citaExists[0].ESTADO}". Debe estar en "CONSULTA_MEDICA" o "PRECLINICA".`
        });
    }

    // ============================================================
    // 2. GUARDAR CONSULTA MÉDICA
    // ============================================================
    const [result] = await pool.query(`
        INSERT INTO TBL_CONSULTA_MEDICA (
            ID_CITA,
            ID_PACIENTE,
            ID_DOCTOR,
            MOTIVO_CONSULTA,
            SINTOMAS,
            EXAMEN_FISICO,
            DIAGNOSTICO_PRINCIPAL,
            CODIGO_CIE10_PRINCIPAL,
            DIAGNOSTICO_SECUNDARIO,
            CODIGO_CIE10_SECUNDARIO,
            TRATAMIENTO,
            RECOMENDACIONES,
            OBSERVACIONES,
            FECHA_CONSULTA,
            PROXIMA_CITA_RECOMENDADA,
            TIPO_CONSULTA,
            USUARIO_CREACION
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
    `, [
        idCita,
        idPaciente,
        idDoctor,
        motivoConsulta,
        sintomas && sintomas.length > 0 ? JSON.stringify(sintomas) : null,
        examenFisico && examenFisico.length > 0 ? JSON.stringify(examenFisico) : null,
        diagnosticoPrincipal,
        codigoCIE10Principal,
        diagnosticoSecundario,
        codigoCIE10Secundario,
        tratamiento,
        recomendaciones,
        observaciones,
        proximaCita,
        tipoConsulta,
        usuarioCreacion
    ]);

    const idConsulta = result.insertId;

    // ============================================================
    // 3. ACTUALIZAR ESTADO DE LA CITA A FINALIZADA
    // ============================================================
    await pool.query(`
        UPDATE TBL_CITAS 
        SET ESTADO = 'FINALIZADA', 
            USUARIO_MODIFICACION = ?,
            FECHA_MODIFICACION = CURRENT_TIMESTAMP
        WHERE ID_CITA = ?
    `, [usuarioCreacion, idCita]);

    console.log(` Cita ${idCita} actualizada a FINALIZADA`);

    // ============================================================
    // 4. REGISTRAR EN BITÁCORA
    // ============================================================
const usuarioCreacionStr = req.user ? req.user.USUARIO : "SISTEMA";
    
    // Opcional: Obtener nombre del paciente para una bitácora más descriptiva
    const [pacienteInfo] = await pool.query(`SELECT CONCAT(NOMBRES, ' ', APELLIDOS) AS NOMBRE FROM TBL_PACIENTE WHERE ID_PACIENTE = ?`, [idPaciente]);
    const nombrePaciente = pacienteInfo.length > 0 ? pacienteInfo.NOMBRE : `ID ${idPaciente}`;

    await registrarBitacora({
        usuario: usuarioCreacionStr,
        accion: "CREACION_CONSULTA_MEDICA",
        descripcion: `El usuario ${usuarioCreacionStr} registró la consulta médica ID #${idConsulta} para la cita ID #${idCita} (Paciente: ${nombrePaciente}). Diagnóstico principal: ${diagnosticoPrincipal || 'No especificado'}`,
        modulo: "CONSULTA_MEDICA",
        idRegistro: idConsulta,
        tabla: "TBL_CONSULTA_MEDICA",
        estado: "EXITO",
        req: req
    });

    // ============================================================
    // 5. GUARDAR/ACTUALIZAR HISTORIAL MÉDICO DEL PACIENTE
    // ============================================================
    try {
        const toArray = (value) => {
            if (!value) return [];
            if (Array.isArray(value)) return value;
            if (typeof value === 'string') {
                if (value.startsWith('[')) {
                    try { return JSON.parse(value); } catch { return []; }
                }
                return value.split(',').map(item => item.trim()).filter(item => item !== '');
            }
            return [];
        };

        const pacienteId = idPaciente;

        const historialData = {
            ALERGIAS: toArray(alergias),
            ENFERMEDADES_CRONICAS: toArray(enfermedadesCronicas),
            CIRUGIAS_PREVIAS: toArray(cirugiasPrevias),
            MEDICAMENTOS_ACTUALES: toArray(medicamentosActuales),
            ANTECEDENTES_FAMILIARES: toArray(antecedentesFamiliares),
            HABITOS: toArray(habitos),
            VACUNAS: toArray(vacunas),
            NOTAS_IMPORTANTES: notasImportantes || '',
            USUARIO_MODIFICACION: usuarioCreacion
        };

        const [existeHistorial] = await pool.query(
            "SELECT ID_HISTORIAL FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?",
            [pacienteId]
        );

        if (existeHistorial.length > 0) {
            await pool.query(`
                UPDATE TBL_HISTORIAL_MEDICO SET
                    ALERGIAS = ?,
                    ENFERMEDADES_CRONICAS = ?,
                    CIRUGIAS_PREVIAS = ?,
                    MEDICAMENTOS_ACTUALES = ?,
                    ANTECEDENTES_FAMILIARES = ?,
                    HABITOS = ?,
                    VACUNAS = ?,
                    NOTAS_IMPORTANTES = ?,
                    FECHA_ACTUALIZACION = CURRENT_TIMESTAMP,
                    USUARIO_MODIFICACION = ?
                WHERE ID_PACIENTE = ?
            `, [
                JSON.stringify(historialData.ALERGIAS),
                JSON.stringify(historialData.ENFERMEDADES_CRONICAS),
                JSON.stringify(historialData.CIRUGIAS_PREVIAS),
                JSON.stringify(historialData.MEDICAMENTOS_ACTUALES),
                JSON.stringify(historialData.ANTECEDENTES_FAMILIARES),
                JSON.stringify(historialData.HABITOS),
                JSON.stringify(historialData.VACUNAS),
                historialData.NOTAS_IMPORTANTES,
                historialData.USUARIO_MODIFICACION,
                pacienteId
            ]);
            console.log(` Historial médico ACTUALIZADO para paciente ${pacienteId}`);
        } else {
            await pool.query(`
                INSERT INTO TBL_HISTORIAL_MEDICO (
                    ID_PACIENTE,
                    ALERGIAS,
                    ENFERMEDADES_CRONICAS,
                    CIRUGIAS_PREVIAS,
                    MEDICAMENTOS_ACTUALES,
                    ANTECEDENTES_FAMILIARES,
                    HABITOS,
                    VACUNAS,
                    NOTAS_IMPORTANTES,
                    USUARIO_CREACION,
                    FECHA_ACTUALIZACION
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                pacienteId,
                JSON.stringify(historialData.ALERGIAS),
                JSON.stringify(historialData.ENFERMEDADES_CRONICAS),
                JSON.stringify(historialData.CIRUGIAS_PREVIAS),
                JSON.stringify(historialData.MEDICAMENTOS_ACTUALES),
                JSON.stringify(historialData.ANTECEDENTES_FAMILIARES),
                JSON.stringify(historialData.HABITOS),
                JSON.stringify(historialData.VACUNAS),
                historialData.NOTAS_IMPORTANTES,
                usuarioCreacion
            ]);
            console.log(` Historial médico CREADO para paciente ${pacienteId}`);
        }
    } catch (historialError) {
        console.error(" Error al guardar historial médico:", historialError);
    }

    // ============================================================
    // 6. RESPONDER CON ÉXITO
    // ============================================================
    res.json({
        success: true,
        message: "Consulta médica guardada exitosamente",
        idConsulta: idConsulta,
        idCita: idCita,
        idPaciente: idPaciente,
        estadoActualizado: 'FINALIZADA'
    });

  } catch (err) {
    console.error(" Error en POST /consultaMedica/nueva:", err);
    
    try {
        await registrarBitacora({
            usuario: req.user?.USUARIO || 'SISTEMA',
            accion: "ERROR_CREACION_CONSULTA",
            descripcion: `Error al guardar consulta médica: ${err.message}`,
            modulo: "CONSULTA_MEDICA",
            tabla: "TBL_CONSULTA_MEDICA",
            estado: "ERROR",
            detalleError: err.message,
            req: req
        });
    } catch (bitError) {
        console.error("Error registrando bitácora:", bitError);
    }

    res.status(500).json({
        success: false,
        error: "Error al guardar la consulta médica: " + err.message
    });
  }
});

// ============================================================
// Obtener consulta por ID de cita
// ============================================================
router.get("/por-cita/:idCita", async (req, res) => {
  const { idCita } = req.params;

  try {
    const [consultaRows] = await pool.query(`
      SELECT 
        cm.ID_CONSULTA,
        cm.ID_CITA,
        cm.ID_PACIENTE,
        cm.ID_DOCTOR,
        cm.MOTIVO_CONSULTA,
        cm.SINTOMAS,
        cm.EXAMEN_FISICO,
        cm.DIAGNOSTICO_PRINCIPAL,
        cm.CODIGO_CIE10_PRINCIPAL,
        cm.DIAGNOSTICO_SECUNDARIO,
        cm.CODIGO_CIE10_SECUNDARIO,
        cm.TRATAMIENTO,
        cm.RECOMENDACIONES,
        cm.OBSERVACIONES,
        cm.FECHA_CONSULTA,
        cm.PROXIMA_CITA_RECOMENDADA,
        cm.TIPO_CONSULTA,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_PACIENTE p ON cm.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_CITA = ?
    `, [idCita]);

    if (consultaRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontró consulta para esta cita"
      });
    }

    const consulta = consultaRows[0];

    if (consulta.SINTOMAS && typeof consulta.SINTOMAS === 'string') {
      try { consulta.SINTOMAS = JSON.parse(consulta.SINTOMAS); } catch (e) { consulta.SINTOMAS = []; }
    }

    if (consulta.EXAMEN_FISICO && typeof consulta.EXAMEN_FISICO === 'string') {
      try { consulta.EXAMEN_FISICO = JSON.parse(consulta.EXAMEN_FISICO); } catch (e) { consulta.EXAMEN_FISICO = []; }
    }

    res.json({
      success: true,
      consulta: consulta
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/por-cita/:idCita:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener consulta por cita: " + err.message
    });
  }
});

// ============================================================
// Obtener preclínica por ID de cita
// ============================================================
router.get("/preclinica/por-cita/:idCita", async (req, res) => {
  const { idCita } = req.params;

  try {
    const [preclinicaRows] = await pool.query(`
      SELECT 
        pr.ID_PRECLINICA,
        pr.ID_CITA,
        pr.ID_USUARIO_ENFERMERIA,
        pr.FECHA_REGISTRO,
        pr.TEMPERATURA,
        pr.PRESION_SISTOLICA,
        pr.PRESION_DIASTOLICA,
        pr.FRECUENCIA_CARDIACA,
        pr.FRECUENCIA_RESPIRATORIA,
        pr.SATURACION_OXIGENO,
        pr.PESO,
        pr.TALLA,
        pr.IMC,
        pr.GLUCOSA,
        pr.PERIMETRO_ABDOMINAL,
        pr.OBSERVACIONES,
        pr.ESTADO_GENERAL,
        u.NOMBRE_USUARIO AS NOMBRE_ENFERMERA
      FROM TBL_PRECLINICA pr
      LEFT JOIN TBL_MS_USUARIO u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      WHERE pr.ID_CITA = ?
      ORDER BY pr.FECHA_REGISTRO DESC
      LIMIT 1
    `, [idCita]);

    if (preclinicaRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontró preclínica para esta cita"
      });
    }

    res.json({
      success: true,
      preclinica: preclinicaRows[0]
    });

  } catch (err) {
    console.error(" Error en GET /consultaMedica/preclinica/por-cita/:idCita:", err);
    res.status(500).json({
      success: false,
      error: "Error al obtener preclínica por cita: " + err.message
    });
  }
});

// ============================================================
// API: Obtener datos de una cita específica
// ============================================================
router.get("/api/cita/:idCita", async (req, res) => {
  const { idCita } = req.params;

  try {
    const [citaRows] = await pool.query(`
      SELECT 
        c.ID_CITA,
        c.ID_PACIENTE,
        c.ID_DOCTOR,
        c.FECHA_CITA,
        c.ESTADO,
        c.MOTIVO_CONSULTA,
        c.PRIORIDAD,
        c.TIPO_CITA,
        c.DURACION_ESTIMADA_MIN,
        c.OBSERVACIONES,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        p.FECHA_NACIMIENTO,
        p.GENERO,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        p.DIRECCION,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM TBL_CITAS c
      INNER JOIN TBL_PACIENTE p ON c.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ID_CITA = ?
    `, [idCita]);

    if (citaRows.length === 0) {
      return res.status(404).json({ error: "Cita no encontrada" });
    }

    const cita = citaRows[0];

    const [preclinicaRows] = await pool.query(`
      SELECT 
        ID_PRECLINICA,
        TEMPERATURA,
        PRESION_SISTOLICA,
        PRESION_DIASTOLICA,
        FRECUENCIA_CARDIACA,
        FRECUENCIA_RESPIRATORIA,
        SATURACION_OXIGENO,
        PESO,
        TALLA,
        IMC,
        GLUCOSA,
        PERIMETRO_ABDOMINAL,
        ESTADO_GENERAL,
        OBSERVACIONES
      FROM TBL_PRECLINICA
      WHERE ID_CITA = ?
      ORDER BY FECHA_REGISTRO DESC
      LIMIT 1
    `, [idCita]);

    const [historialRows] = await pool.query(`
      SELECT 
        ALERGIAS,
        ENFERMEDADES_CRONICAS,
        CIRUGIAS_PREVIAS,
        MEDICAMENTOS_ACTUALES,
        ANTECEDENTES_FAMILIARES,
        HABITOS,
        VACUNAS,
        NOTAS_IMPORTANTES
      FROM TBL_HISTORIAL_MEDICO
      WHERE ID_PACIENTE = ?
    `, [cita.ID_PACIENTE]);

    const [consultasPrevias] = await pool.query(`
      SELECT 
        ID_CONSULTA,
        FECHA_CONSULTA,
        DIAGNOSTICO_PRINCIPAL,
        TRATAMIENTO,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ?
      ORDER BY cm.FECHA_CONSULTA DESC
      LIMIT 5
    `, [cita.ID_PACIENTE]);

    res.json({
      success: true,
      cita: cita,
      preclinica: preclinicaRows.length > 0 ? preclinicaRows[0] : null,
      historial: historialRows.length > 0 ? historialRows[0] : null,
      consultasPrevias: consultasPrevias || []
    });

  } catch (err) {
    console.error(" Error en GET /api/cita/:idCita:", err);
    res.status(500).json({ error: "Error al obtener datos de la cita" });
  }
});

// ============================================================
// OBTENER CONSULTA POR ID
// ============================================================
router.get("/api/consulta/:idConsulta", async (req, res) => {
  const { idConsulta } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT 
        cm.*,
        CONCAT(p.NOMBRES, ' ', p.APELLIDOS) AS NOMBRE_PACIENTE,
        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_PACIENTE p ON cm.ID_PACIENTE = p.ID_PACIENTE
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_CONSULTA = ?
    `, [idConsulta]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Consulta no encontrada" });
    }

    const consulta = rows[0];
    if (consulta.SINTOMAS && typeof consulta.SINTOMAS === 'string') {
      try { consulta.SINTOMAS = JSON.parse(consulta.SINTOMAS); } catch (e) { consulta.SINTOMAS = []; }
    }
    if (consulta.EXAMEN_FISICO && typeof consulta.EXAMEN_FISICO === 'string') {
      try { consulta.EXAMEN_FISICO = JSON.parse(consulta.EXAMEN_FISICO); } catch (e) { consulta.EXAMEN_FISICO = []; }
    }

    res.json(consulta);

  } catch (err) {
    console.error(" Error en GET /api/consulta/:idConsulta:", err);
    res.status(500).json({ error: "Error al obtener consulta" });
  }
});

// ============================================================
// ACTUALIZAR CONSULTA MÉDICA
// ============================================================
router.put("/api/consulta/:idConsulta", async (req, res) => {
  const { idConsulta } = req.params;
  const datos = req.body;

  try {
    const usuarioModificacion = req.user?.USUARIO || 'SISTEMA';

    await pool.query(`
      UPDATE TBL_CONSULTA_MEDICA SET
        MOTIVO_CONSULTA = ?,
        SINTOMAS = ?,
        EXAMEN_FISICO = ?,
        DIAGNOSTICO_PRINCIPAL = ?,
        CODIGO_CIE10_PRINCIPAL = ?,
        DIAGNOSTICO_SECUNDARIO = ?,
        CODIGO_CIE10_SECUNDARIO = ?,
        TRATAMIENTO = ?,
        RECOMENDACIONES = ?,
        OBSERVACIONES = ?,
        PROXIMA_CITA_RECOMENDADA = ?,
        TIPO_CONSULTA = ?,
        USUARIO_MODIFICACION = ?
      WHERE ID_CONSULTA = ?
    `, [
      datos.MOTIVO_CONSULTA || null,
      datos.SINTOMAS ? JSON.stringify(datos.SINTOMAS) : null,
      datos.EXAMEN_FISICO ? JSON.stringify(datos.EXAMEN_FISICO) : null,
      datos.DIAGNOSTICO_PRINCIPAL || null,
      datos.CODIGO_CIE10_PRINCIPAL || null,
      datos.DIAGNOSTICO_SECUNDARIO || null,
      datos.CODIGO_CIE10_SECUNDARIO || null,
      datos.TRATAMIENTO || null,
      datos.RECOMENDACIONES || null,
      datos.OBSERVACIONES || null,
      datos.PROXIMA_CITA_RECOMENDADA || null,
      datos.TIPO_CONSULTA || 'GENERAL',
      usuarioModificacion,
      idConsulta
    ]);

    res.json({
      success: true,
      message: "Consulta médica actualizada exitosamente"
    });

  } catch (err) {
    console.error(" Error en PUT /api/consulta/:idConsulta:", err);
    res.status(500).json({ error: "Error al actualizar consulta" });
  }
});

// ============================================================
// OBTENER HISTORIAL DEL PACIENTE
// ============================================================
router.get("/api/historial/:idPaciente", async (req, res) => {
  const { idPaciente } = req.params;

  try {
    const [historialRows] = await pool.query(`
      SELECT 
        ALERGIAS,
        ENFERMEDADES_CRONICAS,
        CIRUGIAS_PREVIAS,
        MEDICAMENTOS_ACTUALES,
        ANTECEDENTES_FAMILIARES,
        HABITOS,
        VACUNAS,
        NOTAS_IMPORTANTES,
        FECHA_ACTUALIZACION
      FROM TBL_HISTORIAL_MEDICO
      WHERE ID_PACIENTE = ?
    `, [idPaciente]);

    res.json({
      success: true,
      historial: historialRows.length > 0 ? historialRows[0] : null
    });

  } catch (err) {
    console.error(" Error en GET /api/historial/:idPaciente:", err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// ============================================================
// GUARDAR HISTORIAL MÉDICO
// ============================================================
router.post("/api/historial/:idPaciente", async (req, res) => {
  const { idPaciente } = req.params;
  const datos = req.body;

  try {
    const usuarioModificacion = req.user?.USUARIO || 'SISTEMA';

    const [existe] = await pool.query(
      "SELECT ID_HISTORIAL FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?",
      [idPaciente]
    );

    const toArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        if (value.startsWith('[')) {
          try { return JSON.parse(value); } catch { return []; }
        }
        return value.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    if (existe.length > 0) {
      await pool.query(`
        UPDATE TBL_HISTORIAL_MEDICO SET
          ALERGIAS = ?,
          ENFERMEDADES_CRONICAS = ?,
          CIRUGIAS_PREVIAS = ?,
          MEDICAMENTOS_ACTUALES = ?,
          ANTECEDENTES_FAMILIARES = ?,
          HABITOS = ?,
          VACUNAS = ?,
          NOTAS_IMPORTANTES = ?,
          FECHA_ACTUALIZACION = CURRENT_TIMESTAMP,
          USUARIO_MODIFICACION = ?
        WHERE ID_PACIENTE = ?
      `, [
        JSON.stringify(toArray(datos.ALERGIAS)),
        JSON.stringify(toArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(toArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(toArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(toArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(toArray(datos.HABITOS)),
        JSON.stringify(toArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        usuarioModificacion,
        idPaciente
      ]);

    } else {
      await pool.query(`
        INSERT INTO TBL_HISTORIAL_MEDICO (
          ID_PACIENTE,
          ALERGIAS,
          ENFERMEDADES_CRONICAS,
          CIRUGIAS_PREVIAS,
          MEDICAMENTOS_ACTUALES,
          ANTECEDENTES_FAMILIARES,
          HABITOS,
          VACUNAS,
          NOTAS_IMPORTANTES,
          USUARIO_CREACION,
          FECHA_ACTUALIZACION
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        idPaciente,
        JSON.stringify(toArray(datos.ALERGIAS)),
        JSON.stringify(toArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(toArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(toArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(toArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(toArray(datos.HABITOS)),
        JSON.stringify(toArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        usuarioModificacion
      ]);
    }

    res.json({
      success: true,
      message: "Historial médico actualizado correctamente"
    });

  } catch (err) {
    console.error(" Error en POST /api/historial/:idPaciente:", err);
    res.status(500).json({ error: "Error al guardar historial: " + err.message });
  }
});

// ============================================================
// OBTENER PRECLÍNICA POR ID DE CITA
// ============================================================
router.get("/api/preclinica/:idCita", async (req, res) => {
  const { idCita } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT 
        ID_PRECLINICA,
        TEMPERATURA,
        PRESION_SISTOLICA,
        PRESION_DIASTOLICA,
        FRECUENCIA_CARDIACA,
        FRECUENCIA_RESPIRATORIA,
        SATURACION_OXIGENO,
        PESO,
        TALLA,
        IMC,
        GLUCOSA,
        PERIMETRO_ABDOMINAL,
        ESTADO_GENERAL,
        OBSERVACIONES
      FROM TBL_PRECLINICA
      WHERE ID_CITA = ?
      ORDER BY FECHA_REGISTRO DESC
      LIMIT 1
    `, [idCita]);

    res.json({
      success: true,
      preclinica: rows.length > 0 ? rows[0] : null
    });

  } catch (err) {
    console.error(" Error en GET /api/preclinica/:idCita:", err);
    res.status(500).json({ error: "Error al obtener preclínica" });
  }
});

// ============================================================
// CAMBIAR ESTADO DE CITA
// ============================================================
router.post("/api/cambiar-estado", async (req, res) => {
  const { idCita, nuevoEstado } = req.body;

  if (!idCita || !nuevoEstado) {
    return res.status(400).json({
      success: false,
      error: "Faltan parámetros: idCita, nuevoEstado"
    });
  }

  try {
    const usuarioModificacion = req.user?.USUARIO || 'SISTEMA';

    await pool.query(`
      UPDATE TBL_CITAS SET 
        ESTADO = ?,
        USUARIO_MODIFICACION = ?,
        FECHA_MODIFICACION = CURRENT_TIMESTAMP
      WHERE ID_CITA = ?
    `, [nuevoEstado, usuarioModificacion, idCita]);

    await registrarBitacora({
      usuario: usuarioModificacion,
      accion: "CAMBIO_ESTADO_CITA",
      descripcion: `El usuario ${usuarioModificacion} actualizó el estado de la cita ID #${idCita} cambiando su estado a: '${nuevoEstado}' desde el módulo de Consulta Médica`,
      modulo: "CONSULTA_MEDICA",
      idRegistro: idCita,
      tabla: "TBL_CITAS",
      estado: "EXITO",
      req: req
    });

    res.json({
      success: true,
      message: `Cita cambiada a estado: ${nuevoEstado}`
    });

  } catch (err) {
    console.error(" Error en POST /api/cambiar-estado:", err);
    res.status(500).json({ error: "Error al cambiar estado de la cita" });
  }
});

// ============================================================
// POST /actualizar - Actualizar consulta médica existente
// ============================================================
router.post("/actualizar", async (req, res) => {
  try {
    const body = req.body;
    const idConsulta = body.idConsulta;

    if (!idConsulta) {
      return res.status(400).json({
        success: false,
        error: "ID de consulta requerido para actualizar"
      });
    }

    const usuarioModificacion = req.user?.NOMBRE_USUARIO || req.user?.USUARIO || 'SISTEMA';

    await pool.query(`
      UPDATE TBL_CONSULTA_MEDICA SET
        MOTIVO_CONSULTA = ?,
        SINTOMAS = ?,
        EXAMEN_FISICO = ?,
        DIAGNOSTICO_PRINCIPAL = ?,
        CODIGO_CIE10_PRINCIPAL = ?,
        DIAGNOSTICO_SECUNDARIO = ?,
        CODIGO_CIE10_SECUNDARIO = ?,
        TRATAMIENTO = ?,
        RECOMENDACIONES = ?,
        OBSERVACIONES = ?,
        TIPO_CONSULTA = ?,
        USUARIO_MODIFICACION = ?
      WHERE ID_CONSULTA = ?
    `, [
      body.motivoConsulta || null,
      body.sintomas && body.sintomas.length > 0 ? JSON.stringify(body.sintomas) : null,
      body.examenFisico && body.examenFisico.length > 0 ? JSON.stringify(body.examenFisico) : null,
      body.diagnosticoPrincipal || null,
      body.codigoCIE10Principal || null,
      body.diagnosticoSecundario || null,
      body.codigoCIE10Secundario || null,
      body.tratamiento || null,
      body.recomendaciones || null,
      body.observaciones || body.examenesComplementarios || null,
      body.tipoConsulta || 'GENERAL',
      usuarioModificacion,
      idConsulta
    ]);

    res.json({
      success: true,
      message: "Consulta médica actualizada exitosamente"
    });

  } catch (err) {
    console.error("❌ Error en POST /consultaMedica/actualizar:", err);
    res.status(500).json({
      success: false,
      error: "Error al actualizar la consulta médica: " + err.message
    });
  }
});

module.exports = router;