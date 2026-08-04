(() => {
    const $ = id => document.getElementById(id);

    let citas = [];
    let preclinicas = {};
    let submitting = false;

    let filtroBusquedaPaciente = "";
    let filtroBusquedaFecha = "";
    let filtroBusquedaEstado = "";

    function escapeHtml(s) {
        if (s == null) return "";

        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function debounce(fn, wait = 200) {
        let t;

        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    function sanitizeSearch(value) {
        if (typeof value !== "string") return "";

        return value.replace(
            /[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s.\-]/g,
            ""
        );
    }

    function sanitizeInput(value) {
        if (typeof value !== "string") return "";

        return value.replace(
            /[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s.,;:\-()]/g,
            ""
        );
    }

    async function cargarDatos() {
        try {
            const res = await fetch("/preclinica/api/datos", {
                credentials: "same-origin"
            });

            if (!res.ok) {
                throw new Error("HTTP " + res.status);
            }

            const j = await res.json();

            citas = j.citas || [];

            citas.sort(
                (a, b) =>
                    (Number(b.ID_CITA) || 0) -
                    (Number(a.ID_CITA) || 0)
            );

            preclinicas = {};

            (j.preclinicas || []).forEach(p => {
                preclinicas[p.ID_CITA] = p;
            });

            // Debug: Verificar que las preclínicas se cargaron
            console.log('Preclínicas cargadas:', preclinicas);
            console.log('IDs de citas con preclínica:', Object.keys(preclinicas));

            renderTabla();
            llenarSelectCitas();
            llenarSelectEstados();
        } catch (err) {
            console.error(
                "Error cargando datos en Preclínica:",
                err
            );

            alert("Error cargando datos: " + err.message);
        }
    }

    function safeEstadoClass(estado) {
        if (!estado) return "";

        return (
            "estado-" +
            String(estado)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
        );
    }

    // ============================================================
    // ESTADOS VISUALES DEL REGISTRO
    // ============================================================

    const rangosVisuales = {
        temperatura: {
            min: 32,
            max: 42
        },
        presionSistolica: {
            min: 70,
            max: 220
        },
        presionDiastolica: {
            min: 40,
            max: 140
        },
        frecuenciaCardiaca: {
            min: 30,
            max: 200
        },
        frecuenciaRespiratoria: {
            min: 8,
            max: 60
        },
        saturacionOxigeno: {
            min: 50,
            max: 100
        },
        peso: {
            min: 2,
            max: 500,
            required: true
        },
        talla: {
            min: 0.5,
            max: 2.5,
            required: true
        },
        glucosa: {
            min: 30,
            max: 900
        },
        perimetroAbdominal: {
            min: 10,
            max: 300
        }
    };

    function setStatusBadge(
        id,
        texto,
        clase = "status-empty"
    ) {
        const badge = $(id);

        if (!badge) return;

        badge.textContent = texto;

        badge.classList.remove(
            "status-empty",
            "status-ok",
            "status-warning",
            "status-danger",
            "status-info"
        );

        badge.classList.add(clase);
    }

    function valorNumerico(id) {
        const raw = $(id)?.value;

        if (
            raw == null ||
            String(raw).trim() === ""
        ) {
            return null;
        }

        const value = Number(raw);

        return Number.isFinite(value)
            ? value
            : null;
    }

    function estadoVisualCampo(id, config) {
        const raw = $(id)?.value;
        const statusId = `${id}-status`;

        const vacio =
            raw == null ||
            String(raw).trim() === "";

        if (vacio) {
            setStatusBadge(
                statusId,
                config.required
                    ? "Pendiente"
                    : "Sin registrar",
                "status-empty"
            );

            return "empty";
        }

        const value = Number(raw);

        if (!Number.isFinite(value)) {
            setStatusBadge(
                statusId,
                "Revisar",
                "status-danger"
            );

            return "danger";
        }

        if (
            value < config.min ||
            value > config.max
        ) {
            setStatusBadge(
                statusId,
                "Revisar valor",
                "status-warning"
            );

            return "warning";
        }

        setStatusBadge(
            statusId,
            "Registrado",
            "status-ok"
        );

        return "ok";
    }

    function actualizarModoModal() {
        const editando = Boolean(
            $("idPreclinica")?.value
        );

        const title = $("modalTitle");
        const subtitle = $("modalSubtitle");
        const saveButton = $("btnGuardarPreclinica");

        if (title) {
            title.innerHTML = editando
                ? '<i class="fas fa-edit"></i> Editar Preclínica'
                : '<i class="fas fa-stethoscope"></i> Nueva Preclínica';
        }

        if (subtitle) {
            subtitle.textContent = editando
                ? "Actualice los datos clínicos y revise sus indicadores antes de guardar."
                : "Complete los datos clínicos y revise su estado antes de guardar.";
        }

        if (saveButton) {
            saveButton.innerHTML = editando
                ? '<i class="fas fa-save"></i> Actualizar Preclínica'
                : '<i class="fas fa-save"></i> Guardar Preclínica';
        }
    }

    function actualizarEstadosVisuales() {
        const estados = [];

        const citaSeleccionada =
            Number($("selectCita")?.value || 0) > 0;

        setStatusBadge(
            "selectCita-status",
            citaSeleccionada
                ? "Seleccionada"
                : "Pendiente",
            citaSeleccionada
                ? "status-ok"
                : "status-empty"
        );

        Object.entries(rangosVisuales).forEach(
            ([id, config]) => {
                estados.push(
                    estadoVisualCampo(id, config)
                );
            }
        );

        const imcValue = $("imc")?.value;

        setStatusBadge(
            "imc-status",
            imcValue
                ? "Calculado"
                : "Pendiente",
            imcValue
                ? "status-info"
                : "status-empty"
        );

        const observaciones = String(
            $("observaciones")?.value || ""
        ).trim();

        setStatusBadge(
            "observaciones-status",
            observaciones
                ? "Registradas"
                : "Opcional",
            observaciones
                ? "status-ok"
                : "status-empty"
        );

        const estadoGeneral = String(
            $("estadoGeneral")?.value || "BUENO"
        ).toUpperCase();

        const claseEstadoGeneral =
            estadoGeneral === "MALO"
                ? "status-danger"
                : estadoGeneral === "REGULAR"
                    ? "status-warning"
                    : "status-info";

        setStatusBadge(
            "estadoGeneral-status",
            estadoGeneral,
            claseEstadoGeneral
        );

        const pesoValido = (() => {
            const value = valorNumerico("peso");

            return (
                value !== null &&
                value >= rangosVisuales.peso.min &&
                value <= rangosVisuales.peso.max
            );
        })();

        const tallaValida = (() => {
            const value = valorNumerico("talla");

            return (
                value !== null &&
                value >= rangosVisuales.talla.min &&
                value <= rangosVisuales.talla.max
            );
        })();

        const requiereRevision =
            estados.includes("warning") ||
            estados.includes("danger");

        const camposRegistrados =
            Object.keys(rangosVisuales).filter(id => {
                const raw = $(id)?.value;

                return (
                    raw != null &&
                    String(raw).trim() !== ""
                );
            }).length;

        if (
            !citaSeleccionada ||
            !pesoValido ||
            !tallaValida
        ) {
            setStatusBadge(
                "registroEstadoBadge",
                "Incompleto",
                "status-empty"
            );

            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "Seleccione una cita e ingrese peso y talla válidos.";
            }
        } else if (requiereRevision) {
            setStatusBadge(
                "registroEstadoBadge",
                "Requiere revisión",
                "status-warning"
            );

            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "Hay valores fuera de los rangos de validación configurados.";
            }
        } else if (camposRegistrados >= 8) {
            setStatusBadge(
                "registroEstadoBadge",
                "Completo",
                "status-ok"
            );

            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "El registro contiene los datos principales para continuar.";
            }
        } else {
            setStatusBadge(
                "registroEstadoBadge",
                "Datos mínimos completos",
                "status-info"
            );

            if ($("registroEstadoTexto")) {
                $("registroEstadoTexto").textContent =
                    "Puede guardar; los demás campos continúan disponibles.";
            }
        }
    }

    // ============================================================
    // RENDERIZADO DE LA TABLA - VERSIÓN CORREGIDA
    // ============================================================

    function renderTabla() {
        const target = $("tablaContenidoPreclinica");

        if (!target) return;

        const filtroTexto = sanitizeSearch(
            filtroBusquedaPaciente
        )
            .toLowerCase()
            .trim();

        const filtroFechaStr =
            filtroBusquedaFecha;

        const filtroEstado =
            filtroBusquedaEstado.toUpperCase();

        const citasFiltradas = citas.filter(c => {
            const cumpleTexto =
                !filtroTexto ||
                String(c.ID_CITA).includes(
                    filtroTexto
                ) ||
                (
                    c.NOMBRE_PACIENTE &&
                    c.NOMBRE_PACIENTE
                        .toLowerCase()
                        .includes(filtroTexto)
                ) ||
                (
                    c.TELEFONO &&
                    c.TELEFONO.includes(filtroTexto)
                ) ||
                (
                    c.NOMBRE_DOCTOR &&
                    c.NOMBRE_DOCTOR
                        .toLowerCase()
                        .includes(filtroTexto)
                ) ||
                (
                    c.ESTADO &&
                    c.ESTADO
                        .toLowerCase()
                        .includes(filtroTexto)
                );

            let cumpleFecha = true;

            if (filtroFechaStr) {
                const citaFechaStr =
                    new Date(c.FECHA_CITA)
                        .toISOString()
                        .split("T")[0];

                cumpleFecha =
                    citaFechaStr ===
                    filtroFechaStr;
            }

            const cumpleEstado =
                !filtroEstado ||
                filtroEstado === "" ||
                (
                    c.ESTADO &&
                    c.ESTADO.toUpperCase() ===
                    filtroEstado
                );

            return (
                cumpleTexto &&
                cumpleFecha &&
                cumpleEstado
            );
        });

        citasFiltradas.sort(
            (a, b) =>
                (Number(b.ID_CITA) || 0) -
                (Number(a.ID_CITA) || 0)
        );

        const totalRegistros =
            $("totalRegistros");

        if (totalRegistros) {
            totalRegistros.textContent =
                String(citasFiltradas.length);
        }

        if (!citasFiltradas.length) {
            target.innerHTML = `
                <div class="ctsin-citas">
                    <i class="fas fa-stethoscope"></i>

                    <h3>
                        ${
                            filtroTexto ||
                            filtroFechaStr ||
                            filtroEstado
                                ? "No se encontraron citas con los filtros aplicados."
                                : "No hay citas"
                        }
                    </h3>
                </div>
            `;

            return;
        }

        let html = `
            <div class="cttabla-preclinica">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Cita</th>
                            <th>Paciente</th>
                            <th>Doctor</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>

                    <tbody>
        `;

        citasFiltradas.forEach(c => {
            const fecha =
                new Date(c.FECHA_CITA)
                    .toLocaleDateString("es-ES");

            const hora =
                new Date(c.FECHA_CITA)
                    .toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit"
                    });

            // Verificar si existe preclínica para esta cita
            const hasPre = Boolean(preclinicas[c.ID_CITA]);
            const estadoClass = safeEstadoClass(c.ESTADO || "");
            const mostrarPreclinica = String(c.ESTADO || "").toUpperCase() !== "CANCELADA";

            html += `
                <tr data-id="${c.ID_CITA}">
                    <td>
                        #${c.ID_CITA}
                    </td>

                    <td>
                        ${fecha}
                        <br>
                        <small>${hora}</small>
                    </td>

                    <td>
                        <strong>
                            ${escapeHtml(
                                c.NOMBRE_PACIENTE
                            )}
                        </strong>

                        <br>

                        <small>
                            ${escapeHtml(
                                c.TELEFONO || ""
                            )}
                        </small>
                    </td>

                    <td>
                        ${escapeHtml(
                            c.NOMBRE_DOCTOR || ""
                        )}
                    </td>

                    <td>
                        ${fecha}
                    </td>

                    <td>
                        <span class="ctestado-badge ${estadoClass}">
                            ${escapeHtml(
                                c.ESTADO || ""
                            )}
                        </span>
                    </td>

                    <td>
                        <div class="ctacciones-preclinica">
            `;

            // Solo mostrar acciones si la cita no está cancelada
           if (mostrarPreclinica) {
    html += `
        <button
            class="ctbtn-accion ctbtn-icon"
            data-action="abrirPreclinica"
            data-id="${c.ID_CITA}"
            type="button"
            title="${hasPre ? "Editar Preclínica" : "Crear Preclínica"}"
            aria-label="${hasPre ? "Editar Preclínica" : "Crear Preclínica"}"
        >
            <i
                class="fas fa-stethoscope"
                aria-hidden="true"
            ></i>
        </button>
    `;

    html += `
        <button
            class="ctbtn-accion ctbtn-icon delete"
            data-action="eliminarPreclinica"
            data-id="${c.ID_CITA}"
            type="button"
            title="Eliminar Preclínica"
            aria-label="Eliminar Preclínica"
        >
            <i
                class="fas fa-trash-can"
                aria-hidden="true"
            ></i>
        </button>
    `;
} else {
    html += `
        <span class="text-muted">
            Sin acciones
        </span>
    `;
}

            html += `
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        target.innerHTML = html;
    }

    function llenarSelectCitas() {
        const sel = $("selectCita");

        if (!sel) return;

        sel.innerHTML = `
            <option value="">
                Seleccionar cita...
            </option>
        `;

        citas.forEach(c => {
            const opt =
                document.createElement("option");

            opt.value = c.ID_CITA;

            opt.textContent =
                `#${c.ID_CITA} — ` +
                `${c.NOMBRE_PACIENTE} • ` +
                `${new Date(c.FECHA_CITA)
                    .toLocaleString("es-ES")}`;

            opt.dataset.telefono =
                c.TELEFONO || "";

            opt.dataset.correo =
                c.CORREO_ELECTRONICO || "";

            sel.appendChild(opt);
        });
    }

    function llenarSelectEstados() {
        const sel = $("filtroEstadoCita");

        if (!sel) return;

        const estadosUnicos = [
            ...new Set(
                citas
                    .map(c => c.ESTADO)
                    .filter(e => e)
            )
        ].sort();

        const valorActual = sel.value;

        sel.innerHTML = `
            <option value="">
                Todos
            </option>
        `;

        estadosUnicos.forEach(estado => {
            const opt =
                document.createElement("option");

            opt.value = estado;
            opt.textContent = estado;

            sel.appendChild(opt);
        });

        if (estadosUnicos.includes(valorActual)) {
            sel.value = valorActual;
        } else {
            filtroBusquedaEstado = "";
        }
    }

    // ============================================================
    // CONTROL DEL BLOQUEO Y DESPLAZAMIENTO DE LOS MODALES
    // ============================================================

    function modalEstaVisible(id) {
        const modal = $(id);

        if (!modal) return false;

        return (
            modal.style.display !== "none" &&
            modal.getAttribute("aria-hidden") !==
            "true"
        );
    }

    function sincronizarBloqueoPagina() {
        const hayModalAbierto =
            modalEstaVisible("modalPreclinica") ||
            modalEstaVisible(
                "confirmPreclinicaModal"
            );

        document.documentElement.classList.toggle(
            "preclinica-modal-open",
            hayModalAbierto
        );

        document.body.classList.toggle(
            "preclinica-modal-open",
            hayModalAbierto
        );
    }

    function reiniciarScrollModal() {
        const modalBody =
            document.querySelector(
                "#modalPreclinica .pre-modal-body"
            );

        if (modalBody) {
            modalBody.scrollTop = 0;
        }

        const contenidoModal =
            document.querySelector(
                "#modalPreclinica .ctmodal-contenido"
            );

        if (contenidoModal) {
            contenidoModal.scrollTop = 0;
        }
    }

    function abrirModal() {
        const modal = $("modalPreclinica");

        if (!modal) return;

        modal.style.display = "flex";
        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        sincronizarBloqueoPagina();
        limpiarModal();

        requestAnimationFrame(() => {
            reiniciarScrollModal();
        });
    }

    function closePreclinicaModal() {
        const modal = $("modalPreclinica");

        if (!modal) return;

        modal.style.display = "none";
        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        sincronizarBloqueoPagina();
        renderValidationMessages([]);
        clearAllFieldErrors();
        clearInfoField("talla-info");
    }

    function limpiarModal() {
        const form = $("formPreclinica");

        if (form) {
            form.reset();
        }

        if ($("idPreclinica")) {
            $("idPreclinica").value = "";
        }

        if ($("imc")) {
            $("imc").value = "";
        }

        if ($("finIMC")) {
            $("finIMC").textContent = "-";
        }

        if ($("modalError")) {
            $("modalError").style.display =
                "none";
        }

        if ($("selectCita")) {
            $("selectCita").value = "";
        }

        if ($("pacienteInfo")) {
            $("pacienteInfo").textContent =
                "";
        }

        renderValidationMessages([]);
        clearAllFieldErrors();
        clearInfoField("talla-info");
        actualizarModoModal();
        actualizarEstadosVisuales();
    }

    // ============================================================
    // ELIMINAR PRECLÍNICA O CITA (CORREGIDO - Maneja el 404)
    // ============================================================

    async function eliminarPreclinica(
        idCita,
        boton = null
    ) {
        // 1. Asegurar que sea un número entero positivo
        const id = parseInt(idCita, 10);

        if (!id || isNaN(id) || id <= 0) {
            mostrarAlerta(
                "error",
                "El ID de la cita no es válido para eliminar."
            );
            return;
        }

        // Guardar contenido original si el botón existe
        const contenidoOriginal =
            boton?.innerHTML || "";

        if (boton) {
            boton.disabled = true;
            boton.innerHTML = `
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            `;
        }

        try {
            // 2. Intentar eliminar la preclínica
            const res = await fetch(
                `/preclinica/eliminar/${id}`,
                {
                    method: "DELETE",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            const contentType =
                res.headers.get("content-type") || "";

            const json =
                contentType.includes("application/json")
                    ? await res.json().catch(() => null)
                    : null;

            // 3. Manejar la respuesta del servidor
            if (!res.ok) {
                // SI EL ERROR ES 404 (NO EXISTE PRECLÍNICA)
                if (res.status === 404) {
                    // Preguntar si quiere eliminar la cita completa
                    const eliminarCita = window.confirm(
                        `No existe una preclínica asociada a la cita #${id}.\n\n` +
                        `¿Desea eliminar la cita médica completa? (Esto borrará la cita permanentemente)`
                    );

                    if (!eliminarCita) {
                        // El usuario canceló, no hacemos nada
                        if (boton && boton.isConnected) {
                            boton.disabled = false;
                            boton.innerHTML = contenidoOriginal;
                        }
                        return;
                    }

                    // 🟢 LLAMADA A LA NUEVA RUTA PARA ELIMINAR LA CITA 🟢
                    const resCita = await fetch(`/citas/eliminar/${id}`, { 
                        method: "DELETE",
                        credentials: "same-origin",
                        headers: {
                            Accept: "application/json"
                        }
                    });

                    const jsonCita = resCita.ok ? await resCita.json().catch(() => null) : null;

                    if (resCita.ok) {
                        mostrarAlerta("success", jsonCita?.message || "Cita y registros asociados eliminados correctamente.");
                        await cargarDatos(); // Recargar la tabla para que desaparezca la fila
                    } else {
                        throw new Error(
                            jsonCita?.message || 
                            `No se pudo eliminar la cita. Código HTTP ${resCita.status}.`
                        );
                    }
                    
                    // Salir de la función después de borrar la cita
                    if (boton && boton.isConnected) {
                        boton.disabled = false;
                        boton.innerHTML = contenidoOriginal;
                    }
                    return;
                }

                // Si es otro error (500, etc.)
                throw new Error(
                    json?.message ||
                    `No se pudo eliminar la preclínica. Código HTTP ${res.status}.`
                );
            }

            // 4. Si se eliminó la preclínica correctamente
            // Eliminar del objeto local
            delete preclinicas[id];

            mostrarAlerta(
                "success",
                json?.message ||
                "Preclínica eliminada correctamente."
            );

            // Recargar la tabla
            await cargarDatos();

            // 5. Notificar cambios a otros módulos
            try {
                const bc =
                    new BroadcastChannel(
                        "citas_channel"
                    );

                bc.postMessage({
                    type: "preclinica_deleted",
                    idCita: id,
                    nuevoEstado:
                        json?.nuevoEstado ||
                        "PRECLINICA"
                });

                bc.postMessage({
                    type: "estado_cita",
                    id: id,
                    nuevoEstado:
                        json?.nuevoEstado ||
                        "PRECLINICA"
                });

                bc.close();
            } catch (error) {
                console.warn(
                    "BroadcastChannel no disponible:",
                    error
                );
            }
        } catch (err) {
            console.error(
                "Error eliminando preclínica:",
                err
            );

            mostrarAlerta(
                "error",
                err.message ||
                "No se pudo eliminar la preclínica."
            );
        } finally {
            // 6. Restaurar el botón si sigue existiendo en el DOM
            if (
                boton &&
                boton.isConnected
            ) {
                boton.disabled = false;
                boton.innerHTML =
                    contenidoOriginal;
            }
        }
    }

    async function generarVentanaImpresionPreclinica(
        logoBase64
    ) {
        const tabla =
            document.querySelector(
                ".cttabla-preclinica"
            );

        if (!tabla) {
            alert(
                "No se encontró la tabla de preclínica para imprimir."
            );

            return;
        }

        const tablaClon =
            tabla.cloneNode(true);

        const filasTabla =
            tablaClon.querySelectorAll("tr");

        filasTabla.forEach(fila => {
            const celdas =
                fila.querySelectorAll(
                    "td, th"
                );

            if (celdas.length > 0) {
                const ultimaCelda =
                    celdas[
                        celdas.length - 1
                    ];

                if (ultimaCelda) {
                    ultimaCelda.remove();
                }
            }
        });

        const totalSpan =
            document.getElementById(
                "totalRegistros"
            );

        const totalTexto =
            totalSpan
                ? totalSpan.textContent
                : "";

        const ventana = window.open(
            "",
            "",
            "width=900,height=700"
        );

        if (!ventana) {
            alert(
                "El navegador bloqueó la ventana de impresión."
            );

            return;
        }

        ventana.document.write(`
            <!DOCTYPE html>
            <html lang="es">
                <head>
                    <meta charset="UTF-8">

                    <title>
                        Preclínica - Clínicas Roca Maya
                    </title>

                    <style>
                        body {
                            font-family:
                                "Times New Roman",
                                Times,
                                serif;
                            padding: 20px;
                            margin: 0;
                            color: #1f2937;
                        }

                        .header {
                            display: flex;
                            align-items: center;
                            margin-bottom: 20px;
                            border-bottom:
                                2px solid #215fa5;
                            padding-bottom: 15px;
                        }

                        .logo {
                            height: 80px;
                            margin-right: 20px;
                            max-width: 200px;
                            object-fit: contain;
                        }

                        .logo-placeholder {
                            height: 80px;
                            width: 200px;
                            background: #f0f0f0;
                            border:
                                2px dashed #ccc;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-right: 20px;
                            color: #666;
                            font-size: 12px;
                            text-align: center;
                        }

                        .company-info {
                            flex: 1;
                        }

                        .company-name {
                            font-size: 20px;
                            font-weight: bold;
                            color: #153f6d;
                            margin-bottom: 5px;
                        }

                        .company-slogan {
                            font-size: 14px;
                            color: #666;
                            font-style: italic;
                        }

                        h2 {
                            text-align: center;
                            margin: 20px 0;
                            color: #153f6d;
                        }

                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                        }

                        th,
                        td {
                            border:
                                1px solid #ccc;
                            padding: 8px;
                            text-align: left;
                            font-size: 12px;
                        }

                        th {
                            background: #215fa5;
                            color: #ffffff;
                            font-weight: bold;
                        }

                        tbody tr:nth-child(even) {
                            background: #f6f9fc;
                        }
                    </style>
                </head>

                <body>
                    <div class="header">
                        ${
                            logoBase64
                                ? `
                                    <img
                                        src="${logoBase64}"
                                        alt="Clínicas Roca Maya"
                                        class="logo"
                                    >
                                `
                                : `
                                    <div class="logo-placeholder">
                                        Logo no disponible
                                    </div>
                                `
                        }

                        <div class="company-info">
                            <div class="company-name">
                                Clínicas Médicas Roca Maya
                            </div>

                            <div class="company-slogan">
                                Tu salud es nuestra seguridad
                            </div>
                        </div>
                    </div>

                    <h2>
                        Lista de Preclínica
                    </h2>

                    ${tablaClon.outerHTML}

                    <div
                        style="
                            margin-top:20px;
                            font-size:12px;
                            text-align:right;
                        "
                    >
                        <strong>
                            Total de registros:
                        </strong>

                        ${totalTexto}

                        <br>

                        <strong>
                            Generado el:
                        </strong>

                        ${new Date()
                            .toLocaleString()}
                    </div>
                </body>
            </html>
        `);

        ventana.document.close();

        setTimeout(() => {
            ventana.focus();
            ventana.print();
            ventana.close();
        }, 500);
    }

    async function cargarPreclinicaEnModal(
        idCita
    ) {
        try {
            const res = await fetch(
                `/preclinica/por-cita/${idCita}`,
                {
                    credentials:
                        "same-origin"
                }
            );

            if (res.status === 404) {
                abrirModal();

                if ($("selectCita")) {
                    $("selectCita").value =
                        idCita;

                    $("selectCita")
                        .dispatchEvent(
                            new Event("change")
                        );
                }

                return;
            }

            if (!res.ok) {
                throw new Error(
                    "HTTP " + res.status
                );
            }

            const j = await res.json();

            if (
                j &&
                j.success &&
                j.preclinica
            ) {
                const p = j.preclinica;

                abrirModal();

                if ($("idPreclinica")) {
                    $("idPreclinica").value =
                        p.ID_PRECLINICA || "";
                }

                if ($("selectCita")) {
                    $("selectCita").value =
                        p.ID_CITA;

                    $("selectCita")
                        .dispatchEvent(
                            new Event("change")
                        );
                }

                if ($("temperatura")) {
                    $("temperatura").value =
                        p.TEMPERATURA || "";
                }

                if ($("presionSistolica")) {
                    $("presionSistolica").value =
                        p.PRESION_SISTOLICA || "";
                }

                if ($("presionDiastolica")) {
                    $("presionDiastolica").value =
                        p.PRESION_DIASTOLICA || "";
                }

                if ($("frecuenciaCardiaca")) {
                    $("frecuenciaCardiaca").value =
                        p.FRECUENCIA_CARDIACA || "";
                }

                if ($("frecuenciaRespiratoria")) {
                    $("frecuenciaRespiratoria").value =
                        p.FRECUENCIA_RESPIRATORIA || "";
                }

                if ($("saturacionOxigeno")) {
                    $("saturacionOxigeno").value =
                        p.SATURACION_OXIGENO || "";
                }

                if ($("peso")) {
                    $("peso").value =
                        p.PESO || "";
                }

                if ($("talla")) {
                    $("talla").value =
                        p.TALLA || "";
                }

                if ($("glucosa")) {
                    $("glucosa").value =
                        p.GLUCOSA || "";
                }

                if ($("perimetroAbdominal")) {
                    $("perimetroAbdominal").value =
                        p.PERIMETRO_ABDOMINAL ||
                        "";
                }

                if ($("observaciones")) {
                    $("observaciones").value =
                        p.OBSERVACIONES || "";
                }

                if ($("estadoGeneral")) {
                    $("estadoGeneral").value =
                        p.ESTADO_GENERAL ||
                        "BUENO";
                }

                calcularIMC();
                actualizarModoModal();
                actualizarEstadosVisuales();

                requestAnimationFrame(() => {
                    reiniciarScrollModal();
                });
            }
        } catch (err) {
            console.error(
                "Error cargando preclínica por cita:",
                err
            );

            mostrarModalError(
                "No se pudo cargar la preclínica: " +
                err.message
            );
        }
    }

    function calcularIMC() {
        const peso = parseFloat(
            $("peso")?.value || 0
        );

        let tallaVal = parseFloat(
            $("talla")?.value || 0
        );

        if (
            !isNaN(tallaVal) &&
            tallaVal > 3 &&
            tallaVal <= 300
        ) {
            const converted =
                tallaVal / 100;

            if ($("talla")) {
                $("talla").value =
                    converted.toFixed(2);
            }

            tallaVal = converted;

            showInfoField(
                "talla-info",
                `Se interpretó ${
                    Math.round(
                        tallaVal * 100
                    )
                } cm y se convirtió a ${
                    tallaVal.toFixed(2)
                } m.`
            );
        } else {
            clearInfoField("talla-info");
        }

        if (!peso || !tallaVal) {
            if ($("imc")) {
                $("imc").value = "";
            }

            if ($("finIMC")) {
                $("finIMC").textContent =
                    "-";
            }

            actualizarEstadosVisuales();

            return;
        }

        const imc =
            peso /
            (tallaVal * tallaVal);

        const valor =
            isFinite(imc)
                ? imc.toFixed(2)
                : "";

        if ($("imc")) {
            $("imc").value = valor;
        }

        if ($("finIMC")) {
            $("finIMC").textContent =
                valor;
        }

        actualizarEstadosVisuales();
    }

    // ============================================================
    // VALIDACIÓN
    // ============================================================

    function validatePreclinicaFromForm() {
        const getRaw = id =>
            document.getElementById(id)
                ? document.getElementById(id)
                    .value
                : "";

        const idCita = Number(
            getRaw("selectCita") || 0
        );

        const temperatura = parseFloat(
            getRaw("temperatura") || ""
        );

        const presionS = parseInt(
            getRaw("presionSistolica") || ""
        );

        const presionD = parseInt(
            getRaw("presionDiastolica") || ""
        );

        const fc = parseInt(
            getRaw("frecuenciaCardiaca") || ""
        );

        const fr = parseInt(
            getRaw("frecuenciaRespiratoria") || ""
        );

        const sat = parseFloat(
            getRaw("saturacionOxigeno") || ""
        );

        const peso = parseFloat(
            getRaw("peso") || ""
        );

        const tallaRaw = parseFloat(
            getRaw("talla") || ""
        );

        const glucosa = parseFloat(
            getRaw("glucosa") || ""
        );

        const perim = parseFloat(
            getRaw("perimetroAbdominal") || ""
        );

        const observ = sanitizeInput(
            getRaw("observaciones") || ""
        );

        const estadoGeneral =
            getRaw("estadoGeneral") ||
            "BUENO";

        const errors = [];
        const infos = [];

        let talla = tallaRaw;

        if (
            !isNaN(tallaRaw) &&
            tallaRaw > 3 &&
            tallaRaw <= 300
        ) {
            talla = tallaRaw / 100;

            infos.push({
                field: "talla",
                message:
                    `Se detectó ${tallaRaw} ` +
                    `como centímetros y se convirtió ` +
                    `a ${talla.toFixed(2)} m.`,
                severity: "info"
            });

            try {
                if ($("talla")) {
                    $("talla").value =
                        talla.toFixed(2);
                }

                if ($("talla-info")) {
                    $("talla-info")
                        .style.display =
                        "block";
                }
            } catch (e) {
                console.warn(
                    "No se pudo convertir la talla:",
                    e
                );
            }
        }

        if (
            !idCita ||
            isNaN(idCita)
        ) {
            errors.push({
                field: "selectCita",
                message:
                    "Seleccione la cita.",
                severity: "critical"
            });
        }

        if (
            !(peso > 0) ||
            isNaN(peso)
        ) {
            errors.push({
                field: "peso",
                message:
                    "Peso debe ser mayor a 0 kg.",
                severity: "critical"
            });
        }

        if (
            !(talla > 0) ||
            isNaN(talla)
        ) {
            errors.push({
                field: "talla",
                message:
                    "Talla debe ser mayor a 0 m.",
                severity: "critical"
            });
        }

        if (
            !isNaN(talla) &&
            talla > 0 &&
            (
                talla < 0.5 ||
                talla > 2.5
            )
        ) {
            errors.push({
                field: "talla",
                message:
                    "Talla fuera de rango razonable " +
                    "(0.50 - 2.50 m). Verifique la entrada.",
                severity: "critical"
            });
        }

        if (
            !isNaN(peso) &&
            (
                peso < 2 ||
                peso > 500
            )
        ) {
            errors.push({
                field: "peso",
                message:
                    "Peso fuera de rango razonable " +
                    "(2 - 500 kg). Verifique.",
                severity: "critical"
            });
        }

        if (
            !isNaN(temperatura) &&
            (
                temperatura < 32 ||
                temperatura > 42
            )
        ) {
            errors.push({
                field: "temperatura",
                message:
                    "Temperatura fuera de rango " +
                    "esperado (32 - 42 °C).",
                severity: "warning"
            });
        }

        if (
            !isNaN(presionS) &&
            (
                presionS < 70 ||
                presionS > 220
            )
        ) {
            errors.push({
                field: "presionSistolica",
                message:
                    "Presión sistólica fuera de rango " +
                    "esperado (70 - 220 mmHg).",
                severity: "warning"
            });
        }

        if (
            !isNaN(presionD) &&
            (
                presionD < 40 ||
                presionD > 140
            )
        ) {
            errors.push({
                field: "presionDiastolica",
                message:
                    "Presión diastólica fuera de rango " +
                    "esperado (40 - 140 mmHg).",
                severity: "warning"
            });
        }

        if (
            !isNaN(sat) &&
            (
                sat < 50 ||
                sat > 100
            )
        ) {
            errors.push({
                field: "saturacionOxigeno",
                message:
                    "Saturación O₂ fuera de rango " +
                    "(50 - 100%).",
                severity: "warning"
            });
        }

        if (
            !isNaN(fc) &&
            (
                fc < 30 ||
                fc > 200
            )
        ) {
            errors.push({
                field: "frecuenciaCardiaca",
                message:
                    "Frecuencia cardíaca fuera de rango " +
                    "(30 - 200 lpm).",
                severity: "warning"
            });
        }

        if (
            !isNaN(fr) &&
            (
                fr < 8 ||
                fr > 60
            )
        ) {
            errors.push({
                field: "frecuenciaRespiratoria",
                message:
                    "Frecuencia respiratoria fuera de rango " +
                    "(8 - 60 rpm).",
                severity: "warning"
            });
        }

        if (
            !isNaN(glucosa) &&
            (
                glucosa < 30 ||
                glucosa > 900
            )
        ) {
            errors.push({
                field: "glucosa",
                message:
                    "Glucosa fuera de rango " +
                    "(30 - 900 mg/dL). Verifique.",
                severity: "warning"
            });
        }

        if (
            !isNaN(perim) &&
            (
                perim < 10 ||
                perim > 300
            )
        ) {
            errors.push({
                field: "perimetroAbdominal",
                message:
                    "Perímetro abdominal fuera de rango " +
                    "(10 - 300 cm).",
                severity: "warning"
            });
        }

        infos.forEach(info => {
            errors.push(info);
        });

        const imc =
            peso > 0 &&
            talla > 0
                ? peso / (talla * talla)
                : null;

        const summary = {
            idCita,
            temperatura:
                isNaN(temperatura)
                    ? ""
                    : temperatura,
            presionS:
                isNaN(presionS)
                    ? ""
                    : presionS,
            presionD:
                isNaN(presionD)
                    ? ""
                    : presionD,
            fc:
                isNaN(fc)
                    ? ""
                    : fc,
            fr:
                isNaN(fr)
                    ? ""
                    : fr,
            sat:
                isNaN(sat)
                    ? ""
                    : sat,
            peso:
                isNaN(peso)
                    ? ""
                    : peso,
            talla:
                isNaN(talla)
                    ? ""
                    : talla,
            imc:
                imc
                    ? imc.toFixed(2)
                    : "",
            glucosa:
                isNaN(glucosa)
                    ? ""
                    : glucosa,
            perimetroAbdominal:
                isNaN(perim)
                    ? ""
                    : perim,
            observaciones: observ,
            estadoGeneral
        };

        const criticalPresent =
            errors.some(
                error =>
                    error.severity ===
                    "critical"
            );

        return {
            ok: !criticalPresent,
            errors,
            summary
        };
    }

    function setFieldError(
        field,
        message,
        severity
    ) {
        const el =
            document.getElementById(field);

        const errEl =
            document.getElementById(
                field + "-error"
            );

        if (severity === "critical") {
            if (el) {
                el.classList.add(
                    "field-error"
                );
            }

            if (errEl) {
                errEl.textContent =
                    message;

                errEl.style.display =
                    "block";

                errEl.className =
                    "error-text";
            }
        } else if (
            severity === "warning"
        ) {
            if (el) {
                el.classList.add(
                    "field-warning"
                );
            }

            if (errEl) {
                errEl.textContent =
                    message;

                errEl.style.display =
                    "block";

                errEl.className =
                    "error-text";
            }
        } else if (
            severity === "info"
        ) {
            const infoTarget =
                document.getElementById(
                    field + "-info"
                ) ||
                document.getElementById(
                    field + "-error"
                );

            if (infoTarget) {
                infoTarget.textContent =
                    message;

                infoTarget.style.display =
                    "block";

                infoTarget.className =
                    "info-text";
            }
        }
    }

    function clearFieldError(field) {
        const el =
            document.getElementById(field);

        if (el) {
            el.classList.remove(
                "field-error"
            );

            el.classList.remove(
                "field-warning"
            );
        }

        const errEl =
            document.getElementById(
                field + "-error"
            );

        if (errEl) {
            errEl.textContent = "";
            errEl.style.display = "none";
        }

        const infoEl =
            document.getElementById(
                field + "-info"
            );

        if (infoEl) {
            infoEl.textContent = "";
            infoEl.style.display = "none";
        }
    }

    function clearAllFieldErrors() {
        const ids = [
            "selectCita",
            "temperatura",
            "presionSistolica",
            "presionDiastolica",
            "frecuenciaCardiaca",
            "frecuenciaRespiratoria",
            "saturacionOxigeno",
            "peso",
            "talla",
            "glucosa",
            "perimetroAbdominal",
            "observaciones"
        ];

        ids.forEach(clearFieldError);
    }

    function showInfoField(id, message) {
        const el =
            document.getElementById(id);

        if (!el) return;

        el.textContent = message;
        el.style.display = "block";
    }

    function clearInfoField(id) {
        const el =
            document.getElementById(id);

        if (!el) return;

        el.textContent = "";
        el.style.display = "none";
    }

    function renderValidationMessages(
        errors
    ) {
        const container =
            $("validationMessages");

        if (!container) return;

        clearAllFieldErrors();

        if (
            !errors ||
            errors.length === 0
        ) {
            container.innerHTML = `
                <div class="validation-ok">
                    <i class="fas fa-check-circle"></i>
                    No se detectaron problemas críticos.
                    Puedes continuar y confirmar para guardar.
                </div>
            `;

            return;
        }

        const critical =
            errors.filter(
                e =>
                    e.severity ===
                    "critical"
            );

        const warnings =
            errors.filter(
                e =>
                    e.severity ===
                    "warning"
            );

        const infos =
            errors.filter(
                e =>
                    e.severity ===
                    "info"
            );

        errors.forEach(e => {
            setFieldError(
                e.field,
                e.message,
                e.severity || "warning"
            );
        });

        let html = "";

        if (critical.length) {
            html += `
                <div class="validation-error">
                    <strong>
                        <i class="fas fa-times-circle"></i>
                        Errores obligatorios:
                    </strong>

                    <ul>
            `;

            critical.forEach(e => {
                html += `
                    <li>
                        ${escapeHtml(e.message)}
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        if (warnings.length) {
            html += `
                <div class="validation-list">
                    <strong>
                        <i class="fas fa-exclamation-triangle"></i>
                        Advertencias:
                    </strong>

                    <ul>
            `;

            warnings.forEach(e => {
                html += `
                    <li>
                        ${escapeHtml(e.message)}
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        if (infos.length) {
            html += `
                <div class="validation-info">
                    <strong>
                        <i class="fas fa-info-circle"></i>
                        Información:
                    </strong>

                    <ul>
            `;

            infos.forEach(e => {
                html += `
                    <li>
                        ${escapeHtml(e.message)}
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function renderConfirmSummary(summary) {
        const container =
            $("confirmSummary");

        if (!container) return;

        const rows = [
            {
                icon: "fa-calendar-check",
                label: "Cita ID",
                value: summary.idCita
            },
            {
                icon: "fa-weight",
                label: "Peso (kg)",
                value: summary.peso
            },
            {
                icon: "fa-ruler-vertical",
                label: "Talla (m)",
                value: summary.talla
            },
            {
                icon: "fa-calculator",
                label: "IMC",
                value: summary.imc
            },
            {
                icon: "fa-thermometer-half",
                label: "Temperatura (°C)",
                value: summary.temperatura
            },
            {
                icon: "fa-heartbeat",
                label: "Presión (S/D)",
                value:
                    (summary.presionS || "") +
                    (
                        summary.presionS
                            ? " / " +
                            (
                                summary.presionD ||
                                ""
                            )
                            : ""
                    )
            },
            {
                icon: "fa-heart",
                label: "FC (lpm)",
                value: summary.fc
            },
            {
                icon: "fa-lungs",
                label: "FR (rpm)",
                value: summary.fr
            },
            {
                icon: "fa-wind",
                label: "Saturación (%)",
                value: summary.sat
            },
            {
                icon: "fa-tint",
                label: "Glucosa (mg/dL)",
                value: summary.glucosa
            },
            {
                icon: "fa-ruler-horizontal",
                label: "Perímetro abdominal (cm)",
                value:
                    summary.perimetroAbdominal
            },
            {
                icon: "fa-user-check",
                label: "Estado general",
                value:
                    summary.estadoGeneral
            },
            {
                icon: "fa-notes-medical",
                label: "Observaciones",
                value:
                    summary.observaciones
            }
        ];

        let html = "";

        rows.forEach(row => {
            html += `
                <div class="confirm-field">
                    <strong>
                        <i class="fas ${row.icon}"></i>
                        ${escapeHtml(row.label)}:
                    </strong>

                    <div>
                        ${escapeHtml(
                            String(row.value || "")
                        )}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ============================================================
    // ENVÍO DE LA PRECLÍNICA
    // ============================================================

    async function submitPreclinica(
        payload,
        isUpdate = false
    ) {
        if (submitting) return;

        submitting = true;

        const btn =
            $("btnConfirmPreclinica");

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Guardando...
            `;
        }

        try {
            let url =
                "/preclinica/nueva";

            if (isUpdate) {
                url =
                    "/preclinica/actualizar";

                payload.idPreclinica =
                    Number(
                        $("idPreclinica")
                            ?.value
                    ) ||
                    payload.idPreclinica;

                payload.idCita =
                    Number(payload.idCita);
            }

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                credentials:
                    "same-origin",
                body:
                    JSON.stringify(payload)
            });

            const contentType =
                res.headers.get(
                    "content-type"
                );

            const json =
                contentType?.includes(
                    "application/json"
                )
                    ? await res
                        .json()
                        .catch(() => null)
                    : null;

            if (!res.ok) {
                closeConfirmModal();

                mostrarModalError(
                    (
                        json &&
                        json.message
                    ) ||
                    "Error " + res.status
                );

                return;
            }

            mostrarAlerta(
                "success",
                (
                    json &&
                    json.message
                ) ||
                "Preclínica guardada correctamente"
            );

            closeConfirmModal();
            closePreclinicaModal();

            await cargarDatos();

            try {
                const bc =
                    new BroadcastChannel(
                        "citas_channel"
                    );

                const nuevoEstado =
                    (
                        json &&
                        json.nota_estado_actualizado
                    ) ||
                    "PRECLINICA";

                bc.postMessage({
                    type:
                        "preclinica_saved",
                    idCita:
                        Number(
                            payload.idCita
                        ),
                    nuevoEstado
                });

                bc.postMessage({
                    type:
                        "estado_cita",
                    id:
                        Number(
                            payload.idCita
                        ),
                    nuevoEstado
                });

                bc.close();
            } catch (error) {
                console.warn(
                    "BroadcastChannel no disponible:",
                    error
                );
            }
        } catch (err) {
            console.error(
                "Error guardando preclínica:",
                err
            );

            closeConfirmModal();

            mostrarModalError(
                "Error guardando: " +
                err.message
            );
        } finally {
            submitting = false;

            if (btn) {
                btn.disabled = false;

                btn.innerHTML = `
                    <i class="fas fa-check"></i>
                    Confirmar y Guardar
                `;
            }
        }
    }

    async function guardarHandler() {
        const validation =
            validatePreclinicaFromForm();

        renderValidationMessages(
            validation.errors
        );

        actualizarEstadosVisuales();

        if (!validation.ok) {
            const firstCritical =
                validation.errors.find(
                    e =>
                        e.severity ===
                        "critical"
                );

            if (
                firstCritical &&
                document.getElementById(
                    firstCritical.field
                )
            ) {
                const campo =
                    document.getElementById(
                        firstCritical.field
                    );

                campo.focus();

                campo.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }

            return;
        }

        renderConfirmSummary(
            validation.summary
        );

        openConfirmModal();
    }

    function gatherPayloadFromForm() {
        const get = id =>
            document.getElementById(id)
                ? document.getElementById(id)
                    .value
                : "";

        return {
            idCita:
                Number(
                    get("selectCita") || 0
                ),

            temperatura:
                parseFloat(
                    get("temperatura") ||
                    null
                ),

            presionSistolica:
                parseInt(
                    get("presionSistolica") ||
                    null
                ),

            presionDiastolica:
                parseInt(
                    get("presionDiastolica") ||
                    null
                ),

            frecuenciaCardiaca:
                parseInt(
                    get("frecuenciaCardiaca") ||
                    null
                ),

            frecuenciaRespiratoria:
                parseInt(
                    get("frecuenciaRespiratoria") ||
                    null
                ),

            saturacionOxigeno:
                parseFloat(
                    get("saturacionOxigeno") ||
                    null
                ),

            peso:
                parseFloat(
                    get("peso") || null
                ),

            talla:
                parseFloat(
                    get("talla") || null
                ),

            glucosa:
                parseFloat(
                    get("glucosa") || null
                ),

            perimetroAbdominal:
                parseFloat(
                    get("perimetroAbdominal") ||
                    null
                ),

            observaciones:
                sanitizeInput(
                    get("observaciones") ||
                    null
                ),

            estadoGeneral:
                get("estadoGeneral") ||
                "BUENO",

            signosVitalesJson: {
                temperatura:
                    get("temperatura") ||
                    null,

                peso:
                    get("peso") ||
                    null,

                talla:
                    get("talla") ||
                    null
            }
        };
    }

    function openConfirmModal() {
        const modal =
            $("confirmPreclinicaModal");

        if (!modal) return;

        modal.style.display = "flex";

        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        sincronizarBloqueoPagina();

        const confirmSummary =
            $("confirmSummary");

        if (confirmSummary) {
            confirmSummary.scrollTop = 0;
        }
    }

    function closeConfirmModal() {
        const modal =
            $("confirmPreclinicaModal");

        if (!modal) return;

        modal.style.display = "none";

        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        sincronizarBloqueoPagina();
    }

    function mostrarAlerta(tipo, texto) {
        const el =
            tipo === "success"
                ? $("alertSuccessPre")
                : $("alertErrorPre");

        if (!el) {
            alert(texto);
            return;
        }

        const contenido =
            tipo === "success"
                ? $("successMessagePre")
                : $("errorMessagePre");

        if (contenido) {
            contenido.textContent =
                texto;
        }

        el.style.display = "flex";

        setTimeout(() => {
            el.style.display = "none";
        }, 3000);
    }

    function mostrarModalError(texto) {
        const el = $("modalError");

        if (!el) {
            alert(texto);
            return;
        }

        el.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>
                ${escapeHtml(texto)}
            </span>
        `;

        el.style.display = "flex";

        const modalBody =
            document.querySelector(
                "#modalPreclinica .pre-modal-body"
            );

        if (modalBody) {
            modalBody.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    }

    // ============================================================
    // MANEJO DE CLICS
    // ============================================================

    document.addEventListener(
        "click",
        ev => {
            const button =
                ev.target.closest("button");

            if (!button) return;

            const action =
                button.dataset.action;

            const id =
                button.dataset.id;

            // Manejar abrir/editar preclínica
            if (action === "abrirPreclinica") {
                ev.preventDefault();
                cargarPreclinicaEnModal(id);
                return;
            }

            // Manejar eliminar preclínica
            if (action === "eliminarPreclinica") {
                ev.preventDefault();
                eliminarPreclinica(id, button);
                return;
            }

            if (
                button.id ===
                "btnNuevaPreclinica"
            ) {
                ev.preventDefault();

                abrirModal();

                return;
            }

            if (
                button.id ===
                "btnCerrarModalPreclinica" ||
                button.id ===
                "btnCancelarPreclinica"
            ) {
                ev.preventDefault();

                closePreclinicaModal();

                return;
            }

            if (
                button.id ===
                "btnGuardarPreclinica"
            ) {
                ev.preventDefault();

                guardarHandler();

                return;
            }

            if (
                button.id ===
                "btnConfirmPreclinica"
            ) {
                ev.preventDefault();

                const payload =
                    gatherPayloadFromForm();

                const isUpdate =
                    Boolean(
                        $("idPreclinica") &&
                        $("idPreclinica")
                            .value
                    );

                submitPreclinica(
                    payload,
                    isUpdate
                );

                return;
            }

            if (
                button.id ===
                "btnEditPreclinica" ||
                button.id ===
                "btnCloseConfirm"
            ) {
                ev.preventDefault();

                closeConfirmModal();

                return;
            }
        }
    );

    const handleFilterChange =
        debounce(() => {
            renderTabla();
        }, 300);

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            [
                "btnGuardarPreclinica",
                "btnNuevaPreclinica",
                "btnCancelarPreclinica",
                "btnCerrarModalPreclinica",
                "btnConfirmPreclinica",
                "btnEditPreclinica",
                "btnCloseConfirm",
                "btnImprimirPreclinica"
            ].forEach(id => {
                const el = $(id);

                if (
                    el &&
                    el.tagName === "BUTTON"
                ) {
                    el.type = "button";
                }
            });

            const logoBtn =
                $("logoBtn");

            if (logoBtn) {
                logoBtn.type = "button";

                logoBtn.addEventListener(
                    "click",
                    event => {
                        event.preventDefault();

                        window.location.href =
                            "/";
                    }
                );
            }

            const btnImprimir =
                $("btnImprimirPreclinica");

            if (btnImprimir) {
                btnImprimir.addEventListener(
                    "click",
                    async () => {
                        try {
                            const logoBase64 =
                                await imageToBase64(
                                    "/roca-maya-oct.jpg"
                                );

                            await generarVentanaImpresionPreclinica(
                                logoBase64
                            );
                        } catch (error) {
                            console.log(
                                "No se pudo cargar el logo, usando versión sin logo",
                                error
                            );

                            await generarVentanaImpresionPreclinica(
                                null
                            );
                        }
                    }
                );
            }

            cargarDatos();

            const inputBusqueda =
                $("filtroPaciente");

            if (inputBusqueda) {
                inputBusqueda.addEventListener(
                    "input",
                    event => {
                        const cleanValue =
                            sanitizeSearch(
                                event.target.value
                            );

                        event.target.value =
                            cleanValue;

                        filtroBusquedaPaciente =
                            cleanValue;

                        handleFilterChange();
                    }
                );
            }

            const inputFecha =
                $("filtroFecha");

            if (inputFecha) {
                inputFecha.addEventListener(
                    "change",
                    event => {
                        filtroBusquedaFecha =
                            event.target.value;

                        renderTabla();
                    }
                );
            }

            const selectEstado =
                $("filtroEstadoCita");

            if (selectEstado) {
                selectEstado.addEventListener(
                    "change",
                    event => {
                        filtroBusquedaEstado =
                            event.target.value;

                        renderTabla();
                    }
                );
            }

            const inputObservaciones =
                $("observaciones");

            if (inputObservaciones) {
                inputObservaciones.addEventListener(
                    "input",
                    event => {
                        const cleanValue =
                            sanitizeInput(
                                event.target.value
                            );

                        event.target.value =
                            cleanValue;
                    }
                );
            }

            $("peso")?.addEventListener(
                "input",
                debounce(
                    calcularIMC,
                    80
                )
            );

            $("talla")?.addEventListener(
                "input",
                debounce(
                    calcularIMC,
                    80
                )
            );

            $("selectCita")
                ?.addEventListener(
                    "change",
                    () => {
                        const opt =
                            $("selectCita")
                                .selectedOptions[0];

                        const info = [];

                        if (
                            opt?.dataset.telefono
                        ) {
                            info.push(
                                "Tel: " +
                                opt.dataset.telefono
                            );
                        }

                        if (
                            opt?.dataset.correo
                        ) {
                            info.push(
                                opt.dataset.correo
                            );
                        }

                        if ($("pacienteInfo")) {
                            $("pacienteInfo")
                                .textContent =
                                info.join(" • ");
                        }

                        actualizarEstadosVisuales();
                    }
                );

            [
                "temperatura",
                "presionSistolica",
                "presionDiastolica",
                "frecuenciaCardiaca",
                "frecuenciaRespiratoria",
                "saturacionOxigeno",
                "peso",
                "talla",
                "glucosa",
                "perimetroAbdominal",
                "observaciones",
                "estadoGeneral"
            ].forEach(id => {
                const el = $(id);

                if (!el) return;

                const eventName =
                    el.tagName === "SELECT"
                        ? "change"
                        : "input";

                el.addEventListener(
                    eventName,
                    debounce(
                        actualizarEstadosVisuales,
                        70
                    )
                );
            });

            // ============================================================
            // MEJORAS VISUALES: PLACEHOLDERS
            // ============================================================

            const fieldPlaceholders = {
                temperatura: 'Ej: 36.5 °C',
                presionSistolica: 'Ej: 120 mmHg',
                presionDiastolica: 'Ej: 80 mmHg',
                frecuenciaCardiaca: 'Ej: 72 lpm',
                frecuenciaRespiratoria: 'Ej: 16 rpm',
                saturacionOxigeno: 'Ej: 98 %',
                peso: 'Ej: 75.5 kg',
                talla: 'Ej: 1.80 m',
                glucosa: 'Ej: 90 mg/dL',
                perimetroAbdominal: 'Ej: 85 cm',
                observaciones: 'Observaciones clínicas relevantes...'
            };

            Object.entries(fieldPlaceholders).forEach(([id, placeholder]) => {
                const input = document.getElementById(id);
                if (input && !input.placeholder) {
                    input.placeholder = placeholder;
                }
            });

            // ============================================================
            // OBSERVADOR PARA MANTENER SCROLL
            // ============================================================

            const modalPreclinica = document.getElementById('modalPreclinica');
            if (modalPreclinica) {
                const observer = new MutationObserver(() => {
                    const modalBody = document.querySelector('#modalPreclinica .pre-modal-body');
                    if (modalBody && modalPreclinica.style.display !== 'none') {
                        // El scroll se mantiene automáticamente
                    }
                });
                observer.observe(modalPreclinica, { attributes: true, attributeFilter: ['style'] });
            }

            actualizarModoModal();
            actualizarEstadosVisuales();
            sincronizarBloqueoPagina();

            try {
                const bc =
                    new BroadcastChannel(
                        "citas_channel"
                    );

                bc.onmessage = event => {
                    const data =
                        event.data || {};

                    if (!data) return;

                    if (
                        data.type ===
                            "estado_cita" ||
                        data.type ===
                            "preclinica_saved" ||
                        data.type ===
                            "preclinica_deleted"
                    ) {
                        cargarDatos();
                    }
                };
            } catch (error) {
                console.warn(
                    "BroadcastChannel no disponible:",
                    error
                );
            }
        }
    );

    // ============================================================
    // CIERRE DE MODALES
    // ============================================================

    window.addEventListener(
        "click",
        event => {
            const confirmModal =
                $("confirmPreclinicaModal");

            if (
                confirmModal &&
                event.target ===
                    confirmModal
            ) {
                closeConfirmModal();
                return;
            }

            const preModal =
                $("modalPreclinica");

            if (
                preModal &&
                event.target === preModal
            ) {
                closePreclinicaModal();
            }
        }
    );

    window.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            if (
                modalEstaVisible(
                    "confirmPreclinicaModal"
                )
            ) {
                closeConfirmModal();
                return;
            }

            if (
                modalEstaVisible(
                    "modalPreclinica"
                )
            ) {
                closePreclinicaModal();
            }
        }
    );

    window.__preclinica_debug = {
        cargarDatos,
        preclinicas,
        actualizarEstadosVisuales,
        sincronizarBloqueoPagina
    };
})();