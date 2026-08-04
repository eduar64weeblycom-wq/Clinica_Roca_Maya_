// routes/especialidades.routes.js

const express = require("express");
const router = express.Router();

const pool = require("../database/db");
const {
  registrarBitacora
} = require("../services/bitacora.service");

/* ============================================================
   FUNCIONES AUXILIARES
============================================================ */

function getUsuario(req) {
  return (
    req.user?.USUARIO ||
    req.user?.NOMBRE_USUARIO ||
    req.user?.nombre ||
    "SISTEMA"
  );
}

function convertirId(valor) {
  const id = Number(valor);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function normalizarTexto(valor) {
  return String(valor ?? "").trim();
}

function normalizarColor(valor) {
  const color = String(valor ?? "").trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color.toUpperCase();
  }

  return "#3498DB";
}

function normalizarIcono(valor) {
  const icono = String(valor ?? "").trim();

  if (!icono) {
    return "fas fa-stethoscope";
  }

  if (!/^[a-zA-Z0-9\s-]+$/.test(icono)) {
    return "fas fa-stethoscope";
  }

  return icono;
}

function normalizarEstado(valor) {
  const estado = String(valor ?? "")
    .trim()
    .toUpperCase();

  return estado === "INACTIVA"
    ? "INACTIVA"
    : "ACTIVA";
}

async function registrarEventoBitacora(datos) {
  try {
    await registrarBitacora(datos);
  } catch (error) {
    console.error(
      "Error registrando evento en bitácora:",
      error
    );
  }
}

async function registrarErrorBitacora({
  req,
  accion,
  error,
  idRegistro = null
}) {
  await registrarEventoBitacora({
    usuario: getUsuario(req),
    accion,
    descripcion: error.message,
    modulo: "ESPECIALIDADES",
    idRegistro,
    tabla: "TBL_ESPECIALIDADES",
    estado: "ERROR",
    detalleError: error.message,
    req
  });
}

/* ============================================================
   GET /especialidades
   MOSTRAR VISTA PRINCIPAL
============================================================ */

router.get("/", async (req, res) => {
  try {
    res.render("especialidades", {
      title: "Especialidades Médicas"
    });
  } catch (error) {
    console.error(
      "GET /especialidades error:",
      error
    );

    res.status(500).send(
      "Error interno del servidor."
    );
  }
});

/* ============================================================
   GET /especialidades/api/datos

   RELACIÓN UTILIZADA:

   TBL_ESPECIALIDADES
         ↓
   TBL_DOCTOR_ESPECIALIDAD
         ↓
   TBL_MS_USUARIO
         ↓
   TBL_CITAS
         ↓
   TBL_PACIENTE

   IMPORTANTE:
   TBL_CITAS no contiene ID_ESPECIALIDAD. Por eso, cuando un
   doctor tenga varias especialidades, sus pacientes aparecerán
   dentro de cada especialidad asignada a ese doctor.
============================================================ */

router.get("/api/datos", async (req, res) => {
  try {
    console.log(
      "✅ Ejecutando API de especialidades V5"
    );

    const [databaseRows] = await pool.query(`
      SELECT DATABASE() AS BASE_DATOS
    `);

    const baseDatos =
      databaseRows[0]?.BASE_DATOS ||
      "DESCONOCIDA";

    console.log(
      "📦 Base de datos conectada:",
      baseDatos
    );

    /*
      La subconsulta de citas usa DISTINCT para evitar que un
      paciente aparezca repetido cuando tiene varias citas con
      el mismo médico.
    */
    const [rows] = await pool.query(`
      SELECT
        e.ID_ESPECIALIDAD,
        e.NOMBRE_ESPECIALIDAD,
        e.DESCRIPCION,

        COALESCE(
          e.COLOR_HEXADECIMAL,
          '#3498DB'
        ) AS COLOR_HEXADECIMAL,

        COALESCE(
          e.ICONO,
          'fas fa-stethoscope'
        ) AS ICONO,

        e.ESTADO AS ESTADO_ESPECIALIDAD,

        de.ID_DOCTOR,

        u.NOMBRE_USUARIO AS NOMBRE_DOCTOR,

        COALESCE(
          u.CORREO_ELECTRONICO,
          ''
        ) AS CORREO_DOCTOR,

        COALESCE(
          u.ESTADO,
          'INACTIVO'
        ) AS ESTADO_DOCTOR,

        p.ID_PACIENTE,
        p.NOMBRES,
        p.APELLIDOS,

        TRIM(
          CONCAT(
            COALESCE(p.NOMBRES, ''),
            ' ',
            COALESCE(p.APELLIDOS, '')
          )
        ) AS NOMBRE_COMPLETO,

        COALESCE(
          p.CORREO_ELECTRONICO,
          ''
        ) AS CORREO_PACIENTE,

        COALESCE(
          p.TELEFONO,
          ''
        ) AS TELEFONO_PACIENTE,

        COALESCE(
          p.NUMERO_DOCUMENTO_IDENTIDAD,
          ''
        ) AS IDENTIDAD_PACIENTE,

        COALESCE(
          p.ESTADO,
          ''
        ) AS ESTADO_PACIENTE

      FROM TBL_ESPECIALIDADES e

      LEFT JOIN TBL_DOCTOR_ESPECIALIDAD de
        ON de.ID_ESPECIALIDAD =
           e.ID_ESPECIALIDAD

      LEFT JOIN TBL_MS_USUARIO u
        ON u.ID_USUARIO =
           de.ID_DOCTOR

      LEFT JOIN (
        SELECT DISTINCT
          ID_DOCTOR,
          ID_PACIENTE
        FROM TBL_CITAS
        WHERE ESTADO NOT IN (
          'CANCELADA',
          'NO_ASISTIO'
        )
      ) citas
        ON citas.ID_DOCTOR =
           de.ID_DOCTOR

      LEFT JOIN TBL_PACIENTE p
        ON p.ID_PACIENTE =
           citas.ID_PACIENTE
        AND p.ESTADO = 'ACTIVO'

      ORDER BY
        CASE
          WHEN e.ESTADO = 'ACTIVA'
            THEN 1
          ELSE 2
        END,

        e.NOMBRE_ESPECIALIDAD ASC,
        u.NOMBRE_USUARIO ASC,
        p.APELLIDOS ASC,
        p.NOMBRES ASC
    `);

    console.log(
      "📋 Filas obtenidas:",
      rows.length
    );

    const especialidadesMap =
      new Map();

    for (const row of rows) {
      const idEspecialidad =
        Number(row.ID_ESPECIALIDAD);

      const especialidadKey =
        String(idEspecialidad);

      /*
        Crear la especialidad una sola vez.
      */
      if (
        !especialidadesMap.has(
          especialidadKey
        )
      ) {
        especialidadesMap.set(
          especialidadKey,
          {
            ID_ESPECIALIDAD:
              idEspecialidad,

            NOMBRE_ESPECIALIDAD:
              row.NOMBRE_ESPECIALIDAD ||
              "Especialidad sin nombre",

            DESCRIPCION:
              row.DESCRIPCION || "",

            COLOR_HEXADECIMAL:
              row.COLOR_HEXADECIMAL ||
              "#3498DB",

            ICONO:
              row.ICONO ||
              "fas fa-stethoscope",

            ESTADO:
              row.ESTADO_ESPECIALIDAD ||
              "ACTIVA",

            CANTIDAD_MEDICOS: 0,
            CANTIDAD_PACIENTES: 0,

            medicos: [],

            /*
              Propiedades temporales para evitar registros
              duplicados durante la agrupación.
            */
            _medicosMap: new Map(),
            _pacientesUnicos: new Set()
          }
        );
      }

      const especialidad =
        especialidadesMap.get(
          especialidadKey
        );

      /*
        Una especialidad puede existir sin médicos.
      */
      if (
        row.ID_DOCTOR === null ||
        row.ID_DOCTOR === undefined
      ) {
        continue;
      }

      const idDoctor =
        Number(row.ID_DOCTOR);

      const doctorKey =
        String(idDoctor);

      /*
        Crear el médico una sola vez dentro de cada
        especialidad.
      */
      if (
        !especialidad._medicosMap.has(
          doctorKey
        )
      ) {
        const nuevoDoctor = {
          ID_DOCTOR:
            idDoctor,

          NOMBRE_DOCTOR:
            row.NOMBRE_DOCTOR ||
            "Médico sin nombre",

          CORREO_DOCTOR:
            row.CORREO_DOCTOR || "",

          ESTADO_DOCTOR:
            row.ESTADO_DOCTOR ||
            "INACTIVO",

          CANTIDAD_PACIENTES: 0,

          pacientes: [],

          _pacientesMap: new Set()
        };

        especialidad._medicosMap.set(
          doctorKey,
          nuevoDoctor
        );

        especialidad.medicos.push(
          nuevoDoctor
        );
      }

      const doctor =
        especialidad._medicosMap.get(
          doctorKey
        );

      /*
        El médico puede existir sin pacientes asociados.
      */
      if (
        row.ID_PACIENTE === null ||
        row.ID_PACIENTE === undefined
      ) {
        continue;
      }

      const idPaciente =
        Number(row.ID_PACIENTE);

      const pacienteKey =
        String(idPaciente);

      /*
        Evitar repetir al mismo paciente cuando tiene varias
        citas con el médico.
      */
      if (
        !doctor._pacientesMap.has(
          pacienteKey
        )
      ) {
        doctor._pacientesMap.add(
          pacienteKey
        );

        especialidad._pacientesUnicos.add(
          pacienteKey
        );

        doctor.pacientes.push({
          ID_PACIENTE:
            idPaciente,

          NOMBRES:
            row.NOMBRES || "",

          APELLIDOS:
            row.APELLIDOS || "",

          NOMBRE_COMPLETO:
            row.NOMBRE_COMPLETO ||
            "Paciente sin nombre",

          CORREO_ELECTRONICO:
            row.CORREO_PACIENTE || "",

          TELEFONO:
            row.TELEFONO_PACIENTE || "",

          NUMERO_DOCUMENTO_IDENTIDAD:
            row.IDENTIDAD_PACIENTE || "",

          ESTADO:
            row.ESTADO_PACIENTE ||
            "ACTIVO"
        });
      }
    }

    /*
      Convertir los mapas a un arreglo que pueda enviarse
      como JSON.
    */
    const especialidades = Array.from(
      especialidadesMap.values()
    ).map((especialidad) => {
      /*
        Ordenar médicos alfabéticamente.
      */
      especialidad.medicos.sort(
        (doctorA, doctorB) =>
          String(
            doctorA.NOMBRE_DOCTOR
          ).localeCompare(
            String(
              doctorB.NOMBRE_DOCTOR
            ),
            "es",
            {
              sensitivity: "base"
            }
          )
      );

      /*
        Ordenar pacientes por apellido y después por nombre.
      */
      especialidad.medicos.forEach(
        (doctor) => {
          doctor.pacientes.sort(
            (pacienteA, pacienteB) => {
              const comparacionApellidos =
                String(
                  pacienteA.APELLIDOS
                ).localeCompare(
                  String(
                    pacienteB.APELLIDOS
                  ),
                  "es",
                  {
                    sensitivity: "base"
                  }
                );

              if (
                comparacionApellidos !== 0
              ) {
                return comparacionApellidos;
              }

              return String(
                pacienteA.NOMBRES
              ).localeCompare(
                String(
                  pacienteB.NOMBRES
                ),
                "es",
                {
                  sensitivity: "base"
                }
              );
            }
          );

          doctor.CANTIDAD_PACIENTES =
            doctor.pacientes.length;

          delete doctor._pacientesMap;
        }
      );

      especialidad.CANTIDAD_MEDICOS =
        especialidad.medicos.length;

      especialidad.CANTIDAD_PACIENTES =
        especialidad
          ._pacientesUnicos
          .size;

      delete especialidad._medicosMap;
      delete especialidad._pacientesUnicos;

      return especialidad;
    });

    /*
      Calcular estadísticas generales sin duplicar médicos
      ni pacientes.
    */
    const doctoresUnicos =
      new Set();

    const pacientesUnicos =
      new Set();

    especialidades.forEach(
      (especialidad) => {
        especialidad.medicos.forEach(
          (doctor) => {
            doctoresUnicos.add(
              String(
                doctor.ID_DOCTOR
              )
            );

            doctor.pacientes.forEach(
              (paciente) => {
                pacientesUnicos.add(
                  String(
                    paciente.ID_PACIENTE
                  )
                );
              }
            );
          }
        );
      }
    );

    console.log(
      "👨‍⚕️ Médicos enviados:",
      doctoresUnicos.size
    );

    console.log(
      "👥 Pacientes enviados:",
      pacientesUnicos.size
    );

    res.json({
      success: true,

      version:
        "ESPECIALIDADES-V5",

      baseDatos,

      especialidades,

      resumen: {
        totalEspecialidades:
          especialidades.length,

        especialidadesActivas:
          especialidades.filter(
            (especialidad) =>
              especialidad.ESTADO ===
              "ACTIVA"
          ).length,

        totalDoctores:
          doctoresUnicos.size,

        totalPacientes:
          pacientesUnicos.size
      }
    });
  } catch (error) {
    console.error(
      "❌ Error GET /especialidades/api/datos:",
      error
    );

    await registrarErrorBitacora({
      req,
      accion:
        "ERROR_CONSULTA_ESPECIALIDADES",
      error
    });

    res.status(500).json({
      success: false,
      version:
        "ESPECIALIDADES-V5",
      especialidades: [],
      message:
        "Error al consultar las especialidades, médicos y pacientes.",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
});

/* ============================================================
   POST /especialidades/nueva
   CREAR ESPECIALIDAD
============================================================ */

router.post("/nueva", async (req, res) => {
  const usuario =
    getUsuario(req);

  try {
    const nombre =
      normalizarTexto(
        req.body.nombre
      );

    const descripcion =
      normalizarTexto(
        req.body.descripcion
      );

    const color =
      normalizarColor(
        req.body.color
      );

    const icono =
      normalizarIcono(
        req.body.icono
      );

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre de la especialidad es obligatorio."
      });
    }

    if (nombre.length > 100) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre no puede superar los 100 caracteres."
      });
    }

    if (descripcion.length > 255) {
      return res.status(400).json({
        success: false,
        message:
          "La descripción no puede superar los 255 caracteres."
      });
    }

    const [existente] =
      await pool.query(
        `
          SELECT ID_ESPECIALIDAD
          FROM TBL_ESPECIALIDADES
          WHERE UPPER(
            TRIM(NOMBRE_ESPECIALIDAD)
          ) = UPPER(TRIM(?))
          LIMIT 1
        `,
        [nombre]
      );

    if (existente.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          `Ya existe una especialidad con el nombre "${nombre}".`
      });
    }

    const [result] =
      await pool.query(
        `
          INSERT INTO TBL_ESPECIALIDADES (
            NOMBRE_ESPECIALIDAD,
            DESCRIPCION,
            COLOR_HEXADECIMAL,
            ICONO,
            USUARIO_CREACION
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          nombre,
          descripcion || null,
          color,
          icono,
          usuario
        ]
      );

    await registrarEventoBitacora({
      usuario,
      accion:
        "CREACION_ESPECIALIDAD",
      descripcion:
        `Creada especialidad ID ${result.insertId}: ${nombre}`,
      modulo:
        "ESPECIALIDADES",
      idRegistro:
        result.insertId,
      tabla:
        "TBL_ESPECIALIDADES",
      estado:
        "EXITO",
      req
    });

    res.status(201).json({
      success: true,
      message:
        "Especialidad creada correctamente.",
      idEspecialidad:
        result.insertId
    });
  } catch (error) {
    console.error(
      "POST /especialidades/nueva error:",
      error
    );

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Ya existe una especialidad con ese nombre."
      });
    }

    await registrarErrorBitacora({
      req,
      accion:
        "ERROR_CREACION_ESPECIALIDAD",
      error
    });

    res.status(500).json({
      success: false,
      message:
        "Error interno creando la especialidad."
    });
  }
});

/* ============================================================
   PUT /especialidades/actualizar/:id
   ACTUALIZAR ESPECIALIDAD
============================================================ */

router.put(
  "/actualizar/:id",
  async (req, res) => {
    const usuario =
      getUsuario(req);

    const id =
      convertirId(req.params.id);

    try {
      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la especialidad no es válido."
        });
      }

      const nombre =
        normalizarTexto(
          req.body.nombre
        );

      const descripcion =
        normalizarTexto(
          req.body.descripcion
        );

      const color =
        normalizarColor(
          req.body.color
        );

      const icono =
        normalizarIcono(
          req.body.icono
        );

      const estado =
        normalizarEstado(
          req.body.estado
        );

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message:
            "El nombre de la especialidad es obligatorio."
        });
      }

      if (nombre.length > 100) {
        return res.status(400).json({
          success: false,
          message:
            "El nombre no puede superar los 100 caracteres."
        });
      }

      if (descripcion.length > 255) {
        return res.status(400).json({
          success: false,
          message:
            "La descripción no puede superar los 255 caracteres."
        });
      }

      const [duplicada] =
        await pool.query(
          `
            SELECT ID_ESPECIALIDAD
            FROM TBL_ESPECIALIDADES
            WHERE UPPER(
              TRIM(NOMBRE_ESPECIALIDAD)
            ) = UPPER(TRIM(?))
              AND ID_ESPECIALIDAD <> ?
            LIMIT 1
          `,
          [
            nombre,
            id
          ]
        );

      if (duplicada.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            `Ya existe otra especialidad con el nombre "${nombre}".`
        });
      }

      const [result] =
        await pool.query(
          `
            UPDATE TBL_ESPECIALIDADES
            SET
              NOMBRE_ESPECIALIDAD = ?,
              DESCRIPCION = ?,
              COLOR_HEXADECIMAL = ?,
              ICONO = ?,
              ESTADO = ?,
              USUARIO_MODIFICACION = ?
            WHERE ID_ESPECIALIDAD = ?
          `,
          [
            nombre,
            descripcion || null,
            color,
            icono,
            estado,
            usuario,
            id
          ]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      await registrarEventoBitacora({
        usuario,
        accion:
          "ACTUALIZACION_ESPECIALIDAD",
        descripcion:
          `Actualizada especialidad ID ${id}: ${nombre}`,
        modulo:
          "ESPECIALIDADES",
        idRegistro:
          id,
        tabla:
          "TBL_ESPECIALIDADES",
        estado:
          "EXITO",
        req
      });

      res.json({
        success: true,
        message:
          "Especialidad actualizada correctamente."
      });
    } catch (error) {
      console.error(
        "PUT /especialidades/actualizar/:id error:",
        error
      );

      if (
        error.code ===
        "ER_DUP_ENTRY"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Ya existe otra especialidad con ese nombre."
        });
      }

      await registrarErrorBitacora({
        req,
        accion:
          "ERROR_ACTUALIZACION_ESPECIALIDAD",
        error,
        idRegistro: id
      });

      res.status(500).json({
        success: false,
        message:
          "Error interno actualizando la especialidad."
      });
    }
  }
);

/* ============================================================
   POST /especialidades/cambiar-estado
============================================================ */

router.post(
  "/cambiar-estado",
  async (req, res) => {
    const usuario =
      getUsuario(req);

    try {
      const id =
        convertirId(
          req.body.idEspecialidad
        );

      const nuevoEstado =
        String(
          req.body.nuevoEstado ?? ""
        )
          .trim()
          .toUpperCase();

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la especialidad no es válido."
        });
      }

      if (
        ![
          "ACTIVA",
          "INACTIVA"
        ].includes(nuevoEstado)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "El estado indicado no es válido."
        });
      }

      const [especialidadRows] =
        await pool.query(
          `
            SELECT
              NOMBRE_ESPECIALIDAD
            FROM TBL_ESPECIALIDADES
            WHERE ID_ESPECIALIDAD = ?
            LIMIT 1
          `,
          [id]
        );

      if (
        especialidadRows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      const [result] =
        await pool.query(
          `
            UPDATE TBL_ESPECIALIDADES
            SET
              ESTADO = ?,
              USUARIO_MODIFICACION = ?
            WHERE ID_ESPECIALIDAD = ?
          `,
          [
            nuevoEstado,
            usuario,
            id
          ]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      await registrarEventoBitacora({
        usuario,
        accion:
          "CAMBIO_ESTADO_ESPECIALIDAD",
        descripcion:
          `Especialidad ID ${id} cambió a ${nuevoEstado}`,
        modulo:
          "ESPECIALIDADES",
        idRegistro:
          id,
        tabla:
          "TBL_ESPECIALIDADES",
        estado:
          "EXITO",
        req
      });

      res.json({
        success: true,
        message:
          `Especialidad cambiada a ${nuevoEstado.toLowerCase()} correctamente.`
      });
    } catch (error) {
      console.error(
        "POST /especialidades/cambiar-estado error:",
        error
      );

      await registrarErrorBitacora({
        req,
        accion:
          "ERROR_CAMBIO_ESTADO_ESPECIALIDAD",
        error,
        idRegistro:
          convertirId(
            req.body.idEspecialidad
          )
      });

      res.status(500).json({
        success: false,
        message:
          "Error interno al cambiar el estado de la especialidad."
      });
    }
  }
);

/* ============================================================
   DELETE /especialidades/eliminar/:id

   Si tiene médicos relacionados, no se elimina.
   Se recomienda inactivarla.
============================================================ */

router.delete(
  "/eliminar/:id",
  async (req, res) => {
    const usuario =
      getUsuario(req);

    const id =
      convertirId(req.params.id);

    try {
      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "El ID de la especialidad no es válido."
        });
      }

      const [especialidadRows] =
        await pool.query(
          `
            SELECT
              ID_ESPECIALIDAD,
              NOMBRE_ESPECIALIDAD
            FROM TBL_ESPECIALIDADES
            WHERE ID_ESPECIALIDAD = ?
            LIMIT 1
          `,
          [id]
        );

      if (
        especialidadRows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      const especialidad =
        especialidadRows[0];

      const [relacionesRows] =
        await pool.query(
          `
            SELECT
              COUNT(*) AS TOTAL
            FROM TBL_DOCTOR_ESPECIALIDAD
            WHERE ID_ESPECIALIDAD = ?
          `,
          [id]
        );

      const totalDoctores =
        Number(
          relacionesRows[0]?.TOTAL || 0
        );

      if (totalDoctores > 0) {
        return res.status(409).json({
          success: false,
          code:
            "ESPECIALIDAD_CON_DOCTORES",
          message:
            `No se puede eliminar "${especialidad.NOMBRE_ESPECIALIDAD}" porque tiene ${totalDoctores} médico${totalDoctores === 1 ? "" : "s"} asignado${totalDoctores === 1 ? "" : "s"}. Puede inactivarla en su lugar.`
        });
      }

      const [result] =
        await pool.query(
          `
            DELETE FROM TBL_ESPECIALIDADES
            WHERE ID_ESPECIALIDAD = ?
          `,
          [id]
        );

      if (
        result.affectedRows === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Especialidad no encontrada."
        });
      }

      await registrarEventoBitacora({
        usuario,
        accion:
          "ELIMINACION_ESPECIALIDAD",
        descripcion:
          `Eliminada especialidad ID ${id}: ${especialidad.NOMBRE_ESPECIALIDAD}`,
        modulo:
          "ESPECIALIDADES",
        idRegistro:
          id,
        tabla:
          "TBL_ESPECIALIDADES",
        estado:
          "EXITO",
        req
      });

      res.json({
        success: true,
        message:
          "Especialidad eliminada correctamente."
      });
    } catch (error) {
      console.error(
        "DELETE /especialidades/eliminar/:id error:",
        error
      );

      if (
        error.code ===
          "ER_ROW_IS_REFERENCED_2" ||
        error.code ===
          "ER_ROW_IS_REFERENCED"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "No se puede eliminar la especialidad porque tiene información relacionada. Puede inactivarla."
        });
      }

      await registrarErrorBitacora({
        req,
        accion:
          "ERROR_ELIMINACION_ESPECIALIDAD",
        error,
        idRegistro: id
      });

      res.status(500).json({
        success: false,
        message:
          "Error interno eliminando la especialidad."
      });
    }
  }
);

module.exports = router;