const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ============================================================
// RUTA PRINCIPAL - Mostrar vista de historial médico
// ============================================================
router.get("/", async (req, res) => {
  try {
    const [pacientes] = await db.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS
      FROM TBL_PACIENTE
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES
    `);

    res.render("historial-medico", {
      pacientes: pacientes || [],
      pacienteSeleccionado: null,
      historial: null
    });
  } catch (err) {
    console.error("❌ Error al obtener pacientes:", err);
    res.render("historial-medico", {
      pacientes: [],
      pacienteSeleccionado: null,
      historial: null
    });
  }
});

// ============================================================
// API: Obtener pacientes activos (para AJAX)
// ============================================================
router.get("/pacientes", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ID_PACIENTE, NOMBRES, APELLIDOS 
      FROM TBL_PACIENTE 
      WHERE ESTADO = 'ACTIVO'
      ORDER BY NOMBRES
    `);
    res.json(rows || []);
  } catch (err) {
    console.error("❌ Error al obtener pacientes:", err);
    res.status(500).json({ error: "Error al obtener pacientes" });
  }
});

// ============================================================
// ENDPOINT: Obtener historial médico consolidado
// ============================================================
router.get("/consolidado/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;

  try {
    // 1. OBTENER DATOS DEL PACIENTE
    const [pacienteRows] = await db.query(`
      SELECT 
        p.ID_PACIENTE,
        p.NOMBRES,
        p.APELLIDOS,
        p.FECHA_NACIMIENTO,
        p.GENERO,
        p.TELEFONO,
        p.CORREO_ELECTRONICO,
        p.DIRECCION,
        p.ESTADO,
        p.RTN_PACIENTE,
        p.OCUPACION,
        p.ESTADO_CIVIL,
        p.FECHA_REGISTRO
      FROM TBL_PACIENTE p
      WHERE p.ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    const paciente = pacienteRows[0];

    //  NUEVO: si el paciente no tiene FECHA_REGISTRO guardada (pacientes
    // antiguos cargados antes de que existiera este dato), la recuperamos
    // desde la bitácora, donde un trigger registra la fecha exacta en la
    // que se creó el paciente (acción CREACION_PACIENTE).
    if (!paciente.FECHA_REGISTRO) {
      const [bitacoraRows] = await db.query(`
        SELECT FECHA_HORA
        FROM TBL_MS_BITACORA
        WHERE ACCION = 'CREACION_PACIENTE'
          AND TABLA_AFECTADA = 'TBL_PACIENTE'
          AND ID_REGISTRO_AFECTADO = ?
        ORDER BY FECHA_HORA ASC
        LIMIT 1
      `, [pacienteId]);

      if (bitacoraRows.length > 0) {
        paciente.FECHA_REGISTRO = bitacoraRows[0].FECHA_HORA;
      }
    }

    // 2. OBTENER HISTORIAL MÉDICO EXISTENTE
    const [historialRows] = await db.query(`
      SELECT 
        h.ID_HISTORIAL,
        h.ALERGIAS,
        h.ENFERMEDADES_CRONICAS,
        h.CIRUGIAS_PREVIAS,
        h.MEDICAMENTOS_ACTUALES,
        h.ANTECEDENTES_FAMILIARES,
        h.HABITOS,
        h.VACUNAS,
        h.NOTAS_IMPORTANTES,
        h.FECHA_ACTUALIZACION,
        h.USUARIO_CREACION,
        h.USUARIO_MODIFICACION
      FROM TBL_HISTORIAL_MEDICO h
      WHERE h.ID_PACIENTE = ?
    `, [pacienteId]);

    const historial = historialRows.length > 0 ? historialRows[0] : null;

    // 3. OBTENER ÚLTIMAS CONSULTAS MÉDICAS
    const [consultasRows] = await db.query(`
      SELECT 
        cm.ID_CONSULTA,
        cm.FECHA_CONSULTA,
        cm.MOTIVO_CONSULTA,
        cm.DIAGNOSTICO_PRINCIPAL,
        cm.CODIGO_CIE10_PRINCIPAL,
        cm.DIAGNOSTICO_SECUNDARIO,
        cm.CODIGO_CIE10_SECUNDARIO,
        cm.TRATAMIENTO,
        cm.RECOMENDACIONES,
        cm.OBSERVACIONES,
        cm.TIPO_CONSULTA,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CONSULTA_MEDICA cm
      INNER JOIN TBL_MS_USUARIO u ON cm.ID_DOCTOR = u.ID_USUARIO
      WHERE cm.ID_PACIENTE = ?
      ORDER BY cm.FECHA_CONSULTA DESC
      LIMIT 10
    `, [pacienteId]);

    // 4. OBTENER PRECLÍNICAS (signos vitales)
    const [preclinicasRows] = await db.query(`
      SELECT 
        pr.ID_PRECLINICA,
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
        pr.ESTADO_GENERAL,
        pr.OBSERVACIONES,
        u.NOMBRE_USUARIO AS ENFERMERA
      FROM TBL_PRECLINICA pr
      INNER JOIN TBL_MS_USUARIO u ON pr.ID_USUARIO_ENFERMERIA = u.ID_USUARIO
      WHERE pr.ID_CITA IN (
        SELECT ID_CITA FROM TBL_CITAS WHERE ID_PACIENTE = ?
      )
      ORDER BY pr.FECHA_REGISTRO DESC
      LIMIT 10
    `, [pacienteId]);

    // 5. OBTENER CITAS DEL PACIENTE
    const [citasRows] = await db.query(`
      SELECT 
        c.ID_CITA,
        c.FECHA_CITA,
        c.ESTADO,
        c.MOTIVO_CONSULTA,
        c.PRIORIDAD,
        c.TIPO_CITA,
        c.DURACION_ESTIMADA_MIN,
        u.NOMBRE_USUARIO AS DOCTOR
      FROM TBL_CITAS c
      INNER JOIN TBL_MS_USUARIO u ON c.ID_DOCTOR = u.ID_USUARIO
      WHERE c.ID_PACIENTE = ?
      ORDER BY c.FECHA_CITA DESC
      LIMIT 10
    `, [pacienteId]);

    // 6. OBTENER MEDICAMENTOS PRESCRITOS
    const [medicamentosRows] = await db.query(`
      SELECT 
        pr.ID_PRESCRIPCION,
        pr.FECHA_PRESCRIPCION,
        m.NOMBRE_MEDICAMENTO,
        pr.DOSIS,
        pr.FRECUENCIA,
        pr.DURACION,
        pr.INSTRUCCIONES_ADICIONALES,
        pr.ESTADO,
        cm.FECHA_CONSULTA
      FROM TBL_PRESCRIPCION pr
      INNER JOIN TBL_INVENTARIO_MEDICAMENTOS m ON pr.ID_MEDICAMENTO = m.ID_MEDICAMENTO
      INNER JOIN TBL_CONSULTA_MEDICA cm ON pr.ID_CONSULTA = cm.ID_CONSULTA
      WHERE cm.ID_PACIENTE = ?
      ORDER BY pr.FECHA_PRESCRIPCION DESC
      LIMIT 10
    `, [pacienteId]);

    // 7. OBTENER TOTAL DE CONSULTAS Y CITAS
    const [countRows] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM TBL_CONSULTA_MEDICA WHERE ID_PACIENTE = ?) AS TOTAL_CONSULTAS,
        (SELECT COUNT(*) FROM TBL_CITAS WHERE ID_PACIENTE = ?) AS TOTAL_CITAS
    `, [pacienteId, pacienteId]);

    // 8. CONSOLIDAR RESPUESTA
    res.json({
      success: true,
      paciente: paciente,
      historial: historial,
      consultas: consultasRows,
      preclinicas: preclinicasRows,
      citas: citasRows,
      medicamentos: medicamentosRows,
      totales: {
        consultas: countRows[0]?.TOTAL_CONSULTAS || 0,
        citas: countRows[0]?.TOTAL_CITAS || 0
      }
    });

  } catch (err) {
    console.error("❌ Error al obtener historial consolidado:", err);
    res.status(500).json({ 
      success: false, 
      error: "Error al obtener historial consolidado: " + err.message 
    });
  }
});

// ============================================================
// ENDPOINT: Guardar historial desde consulta médica
// ============================================================
router.post("/guardar-desde-consulta/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;
  const datos = req.body;

  try {
    const [paciente] = await db.query(
      "SELECT ID_PACIENTE FROM TBL_PACIENTE WHERE ID_PACIENTE = ?",
      [pacienteId]
    );
    if (paciente.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Paciente no encontrado" 
      });
    }

    const [existe] = await db.query(
      "SELECT ID_HISTORIAL FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?",
      [pacienteId]
    );

    const { 
      ALERGIAS = [],
      ENFERMEDADES_CRONICAS = [],
      CIRUGIAS_PREVIAS = [],
      MEDICAMENTOS_ACTUALES = [],
      ANTECEDENTES_FAMILIARES = [],
      HABITOS = [],
      VACUNAS = [],
      NOTAS_IMPORTANTES = '',
      USUARIO_MODIFICACION = 'SISTEMA'
    } = datos;

    const asegurarArray = (valor) => {
      if (Array.isArray(valor)) return valor;
      if (typeof valor === 'string') {
        if (valor.startsWith('[')) {
          try { return JSON.parse(valor); } catch { return []; }
        }
        return valor.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    const alergiasArray = asegurarArray(ALERGIAS);
    const enfermedadesArray = asegurarArray(ENFERMEDADES_CRONICAS);
    const cirugiasArray = asegurarArray(CIRUGIAS_PREVIAS);
    const medicamentosArray = asegurarArray(MEDICAMENTOS_ACTUALES);
    const antecedentesArray = asegurarArray(ANTECEDENTES_FAMILIARES);
    const habitosArray = asegurarArray(HABITOS);
    const vacunasArray = asegurarArray(VACUNAS);

    if (existe.length > 0) {
      await db.query(`
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
        JSON.stringify(alergiasArray),
        JSON.stringify(enfermedadesArray),
        JSON.stringify(cirugiasArray),
        JSON.stringify(medicamentosArray),
        JSON.stringify(antecedentesArray),
        JSON.stringify(habitosArray),
        JSON.stringify(vacunasArray),
        NOTAS_IMPORTANTES || '',
        USUARIO_MODIFICACION,
        pacienteId
      ]);

      res.json({ 
        success: true, 
        message: "Historial médico actualizado correctamente desde consulta" 
      });

    } else {
      await db.query(`
        INSERT INTO TBL_HISTORIAL_MEDICO 
        (ID_PACIENTE, ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, 
         MEDICAMENTOS_ACTUALES, ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS, 
         NOTAS_IMPORTANTES, USUARIO_CREACION, FECHA_ACTUALIZACION)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        pacienteId,
        JSON.stringify(alergiasArray),
        JSON.stringify(enfermedadesArray),
        JSON.stringify(cirugiasArray),
        JSON.stringify(medicamentosArray),
        JSON.stringify(antecedentesArray),
        JSON.stringify(habitosArray),
        JSON.stringify(vacunasArray),
        NOTAS_IMPORTANTES || '',
        USUARIO_MODIFICACION
      ]);

      res.json({ 
        success: true, 
        message: "Historial médico creado correctamente desde consulta" 
      });
    }

  } catch (err) {
    console.error("❌ Error al guardar historial desde consulta:", err);
    res.status(500).json({ 
      success: false, 
      error: "Error al guardar historial médico desde consulta: " + err.message 
    });
  }
});

// ============================================================
// Obtener historial médico + datos del paciente
// ============================================================
router.get("/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;
  try {
    const [pacienteRows] = await db.query(`
      SELECT * FROM TBL_PACIENTE WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    if (pacienteRows.length === 0) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    const [historialRows] = await db.query(`
      SELECT * FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?
    `, [pacienteId]);

    res.json({
      paciente: pacienteRows[0],
      historial: historialRows[0] || null
    });
  } catch (err) {
    console.error("❌ Error al obtener historial:", err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// ============================================================
// Crear o actualizar historial médico (guardar)
// ============================================================
router.post("/:pacienteId", async (req, res) => {
  const { pacienteId } = req.params;
  const datos = req.body;

  try {
    const [existe] = await db.query(
      "SELECT * FROM TBL_HISTORIAL_MEDICO WHERE ID_PACIENTE = ?",
      [pacienteId]
    );

    const asegurarArray = (valor) => {
      if (Array.isArray(valor)) return valor;
      if (typeof valor === 'string') {
        if (valor.startsWith('[')) {
          try { return JSON.parse(valor); } catch { return []; }
        }
        return valor.split(',').map(item => item.trim()).filter(item => item !== '');
      }
      return [];
    };

    if (existe.length > 0) {
      await db.query(`
        UPDATE TBL_HISTORIAL_MEDICO SET
          ALERGIAS = ?,
          ENFERMEDADES_CRONICAS = ?,
          CIRUGIAS_PREVIAS = ?,
          MEDICAMENTOS_ACTUALES = ?,
          ANTECEDENTES_FAMILIARES = ?,
          HABITOS = ?,
          VACUNAS = ?,
          NOTAS_IMPORTANTES = ?,
          USUARIO_MODIFICACION = ?
        WHERE ID_PACIENTE = ?
      `, [
        JSON.stringify(asegurarArray(datos.ALERGIAS)),
        JSON.stringify(asegurarArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(asegurarArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(asegurarArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(asegurarArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(asegurarArray(datos.HABITOS)),
        JSON.stringify(asegurarArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        datos.USUARIO_MODIFICACION || 'admin',
        pacienteId
      ]);

      res.json({ success: true, message: "Historial actualizado correctamente" });
    } else {
      await db.query(`
        INSERT INTO TBL_HISTORIAL_MEDICO 
        (ID_PACIENTE, ALERGIAS, ENFERMEDADES_CRONICAS, CIRUGIAS_PREVIAS, MEDICAMENTOS_ACTUALES, 
         ANTECEDENTES_FAMILIARES, HABITOS, VACUNAS, NOTAS_IMPORTANTES, USUARIO_CREACION)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        pacienteId,
        JSON.stringify(asegurarArray(datos.ALERGIAS)),
        JSON.stringify(asegurarArray(datos.ENFERMEDADES_CRONICAS)),
        JSON.stringify(asegurarArray(datos.CIRUGIAS_PREVIAS)),
        JSON.stringify(asegurarArray(datos.MEDICAMENTOS_ACTUALES)),
        JSON.stringify(asegurarArray(datos.ANTECEDENTES_FAMILIARES)),
        JSON.stringify(asegurarArray(datos.HABITOS)),
        JSON.stringify(asegurarArray(datos.VACUNAS)),
        datos.NOTAS_IMPORTANTES || '',
        datos.USUARIO_CREACION || 'admin'
      ]);

      res.json({ success: true, message: "Historial creado correctamente" });
    }
  } catch (err) {
    console.error("❌ Error al guardar historial:", err);
    res.status(500).json({ error: "Error al guardar historial: " + err.message });
  }
});

// ============================================================
// Exportar PDF del historial (opcional)
// ============================================================
router.get("/:pacienteId/exportar-pdf", async (req, res) => {
  const { pacienteId } = req.params;
  
  try {
    res.status(501).json({ error: "Funcionalidad en desarrollo" });
  } catch (err) {
    console.error("❌ Error al generar PDF:", err);
    res.status(500).json({ error: "Error al generar PDF" });
  }
});

module.exports = router;