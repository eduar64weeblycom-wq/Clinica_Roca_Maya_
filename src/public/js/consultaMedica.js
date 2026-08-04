(() => {
    'use strict';

    // ============================================================
    // SELECTORES Y UTILIDADES
    // ============================================================
    const $ = id => document.getElementById(id);
    const $$ = selector => document.querySelectorAll(selector);

    let citas = [];
    let consultas = [];
    let consultasMap = {};
    let saving = false;
    let pacientesData = [];
    let doctoresData = [];

    let filtrosConsulta = {
        paciente: '',
        telefono: '',
        identidad: '',
        fecha: '',
        tipo: ''
    };

    // ============================================================
    // UTILIDADES
    // ============================================================
    function escapeHtml(s) {
        if (s === undefined || s === null) return "";
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function debounce(fn, wait = 300) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), wait);
        };
    }

    function sanitizarBusqueda(value) {
        if (typeof value !== 'string') return '';
        return value.replace(/[^a-zA-Z0-9ñÑáéíóúÁÉÍÓÚ\s\.\-]/g, '');
    }

    function sanitizarNumero(value) {
        if (typeof value !== 'string') return '';
        return value.replace(/[^0-9\-]/g, '');
    }

    function sanitizarIdentidad(value) {
        if (typeof value !== 'string') return '';
        return value.replace(/[^a-zA-Z0-9\-]/g, '').toUpperCase();
    }

    function safeEstadoClass(estado) {
        if (!estado) return "";
        return "ctestado-" + String(estado).toLowerCase().replace(/[^a-z0-9]+/g, "_");
    }

    function formatearFecha(fecha) {
        if (!fecha) return '';
        const d = new Date(fecha);
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatearFechaSolo(fecha) {
        if (!fecha) return '';
        const d = new Date(fecha);
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function parseJSONField(field) {
        if (!field) return [];
        let fieldString = String(field);
        try {
            const parsed = JSON.parse(fieldString);
            return Array.isArray(parsed) ? parsed.filter(item => item && item.trim() !== '') : [];
        } catch {
            return fieldString.split(',').map(item => item.trim()).filter(item => item !== '');
        }
    }

    // ============================================================
    // API
    // ============================================================
    const API = {
        async cargarDatos() {
            try {
                const res = await fetch("/consultaMedica/api/datos", { credentials: "same-origin" });
                if (!res.ok) throw new Error("HTTP " + res.status);
                return await res.json();
            } catch (err) {
                console.error("Error cargando datos:", err);
                throw err;
            }
        },

        async obtenerConsulta(idCita) {
            try {
                const res = await fetch(`/consultaMedica/por-cita/${idCita}`, { credentials: "same-origin" });
                if (res.status === 404) return null;
                if (!res.ok) throw new Error("HTTP " + res.status);
                return await res.json();
            } catch (err) {
                console.error("Error obteniendo consulta:", err);
                throw err;
            }
        },

        async guardarConsulta(payload) {
            const url = '/consultaMedica/nueva';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error desconocido' }));
                throw new Error(error.message || `HTTP ${res.status}`);
            }
            return await res.json();
        },

        async actualizarConsulta(payload) {
            const url = '/consultaMedica/actualizar';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error desconocido' }));
                throw new Error(error.message || `HTTP ${res.status}`);
            }
            return await res.json();
        },

        async cambiarEstado(idCita, nuevoEstado) {
            const res = await fetch("/consultaMedica/api/cambiar-estado", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ idCita: Number(idCita), nuevoEstado })
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({ message: 'Error desconocido' }));
                throw new Error(error.message || `HTTP ${res.status}`);
            }
            return await res.json();
        },

        async cargarHistorialRapido(idPaciente) {
            const res = await fetch(`/consultaMedica/api/historial-rapido/${idPaciente}`, {
                credentials: "same-origin"
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            return await res.json();
        },

        async imprimirConsulta(idConsulta) {
            const res = await fetch(`/consultaMedica/api/imprimir-consulta/${idConsulta}`, {
                credentials: "same-origin"
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            return await res.json();
        }
    };

    // ============================================================
    // FUNCIONES PRINCIPALES
    // ============================================================
    async function cargarDatos() {
        try {
            const data = await API.cargarDatos();
            citas = data.citas || [];
            pacientesData = data.pacientes || []; 
            doctoresData = data.doctores || [];   
            citas.sort((a, b) => (Number(b.ID_CITA) || 0) - (Number(a.ID_CITA) || 0));
            consultas = data.consultas || [];
            consultasMap = {};
            (consultas || []).forEach(c => {
                if (c.ID_CITA != null) consultasMap[c.ID_CITA] = c;
            });
            renderizarTabla();
            llenarSelectCitas();
        } catch (err) {
            console.error("Error cargando citas/consultas:", err);
            mostrarAlerta("error", "Error cargando datos: " + err.message);
        }
    }

    // ============================================================
    // APLICAR FILTROS
    // ============================================================
    function aplicarFiltros(citasData) {
        const paciente = sanitizarBusqueda(filtrosConsulta.paciente).toLowerCase().trim();
        const telefono = sanitizarNumero(filtrosConsulta.telefono).trim();
        const identidad = sanitizarIdentidad(filtrosConsulta.identidad).trim();
        const fecha = filtrosConsulta.fecha;
        const tipo = filtrosConsulta.tipo.toUpperCase();

        return citasData.filter(c => {
            const coincidePaciente = !paciente ||
                String(c.ID_CITA).includes(paciente) ||
                (c.NOMBRE_PACIENTE && c.NOMBRE_PACIENTE.toLowerCase().includes(paciente)) ||
                (c.NOMBRE_DOCTOR && c.NOMBRE_DOCTOR.toLowerCase().includes(paciente));

            const coincideTelefono = !telefono ||
                (c.TELEFONO_PACIENTE && c.TELEFONO_PACIENTE.replace(/[^0-9]/g, '').includes(telefono));

            const coincideIdentidad = !identidad ||
                (c.IDENTIDAD_PACIENTE && c.IDENTIDAD_PACIENTE.toUpperCase().includes(identidad));

            let coincideFecha = true;
            if (fecha) {
                const fechaCita = new Date(c.FECHA_CITA).toISOString().split('T')[0];
                coincideFecha = fechaCita === fecha;
            }

            const coincideTipo = !tipo ||
                (c.TIPO_CITA && c.TIPO_CITA.toUpperCase() === tipo);

            return coincidePaciente && coincideTelefono && coincideIdentidad && coincideFecha && coincideTipo;
        });
    }

    // ============================================================
    // RENDERIZADO DE TABLA
    // ============================================================
    function renderizarTabla() {
        const target = $("tablaContenidoConsulta");
        if (!target) return;

        const citasFiltradas = aplicarFiltros(citas);

        if (!citasFiltradas.length) {
            target.innerHTML = `
                <div class="ctsin-citas">
                    <i class="fas fa-notes-medical"></i>
                    <h3>${filtrosConsulta.paciente || filtrosConsulta.telefono || filtrosConsulta.identidad || filtrosConsulta.fecha || filtrosConsulta.tipo ? 'No se encontraron consultas con los filtros aplicados.' : 'No hay consultas registradas'}</h3>
                    <p>Puedes crear una con "Nueva Consulta".</p>
                    <button class="ctbtn-primary" id="btnCrearPrimeraConsulta" type="button"><i class="fas fa-plus"></i> Nueva Consulta</button>
                </div>
            `;
            const btnCrear = document.getElementById('btnCrearPrimeraConsulta');
            if (btnCrear) {
                btnCrear.addEventListener('click', () => abrirModalConsulta());
            }
            return;
        }

        let html = `
            <div class="cttabla-consulta">
                <div class="tabla-header">
                    <span class="total-registros">
                        <i class="fas fa-list"></i> ${citasFiltradas.length} consulta${citasFiltradas.length > 1 ? 's' : ''} encontradas
                        ${citas.length !== citasFiltradas.length ? ` (de ${citas.length} totales)` : ''}
                    </span>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Fecha/Hora</th>
                                <th>Paciente</th>
                                <th>Doctor</th>
                                <th>Tipo</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        citasFiltradas.forEach(c => {
            const fechaSolo = formatearFechaSolo(c.FECHA_CITA);
            const hora = new Date(c.FECHA_CITA).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            const estadoClass = safeEstadoClass(c.ESTADO || "");
            const hasConsulta = !!consultasMap[c.ID_CITA];
            const estadoUpper = String(c.ESTADO || "").toUpperCase();
            const accionesPermitidas = (estadoUpper !== "CANCELADA" && estadoUpper !== "NO_ASISTIO");

            html += `
                <tr data-id="${c.ID_CITA}">
                    <td><strong>#${c.ID_CITA}</strong></td>
                    <td>
                        <div class="fecha-cita">${fechaSolo}</div>
                        <div class="hora-cita"><i class="far fa-clock"></i> ${hora}</div>
                    </td>
                    <td>
                        <div class="nombre-paciente"><strong>${escapeHtml(c.NOMBRE_PACIENTE)}</strong></div>
                        <div class="info-paciente">
                            ${c.TELEFONO_PACIENTE ? `<span class="telefono"><i class="fas fa-phone"></i> ${escapeHtml(c.TELEFONO_PACIENTE)}</span>` : ''}
                            ${c.IDENTIDAD_PACIENTE ? `<span class="identidad"><i class="fas fa-id-card"></i> ${escapeHtml(c.IDENTIDAD_PACIENTE)}</span>` : ''}
                        </div>
                    </td>
                    <td>${escapeHtml(c.NOMBRE_DOCTOR || 'No asignado')}</td>
                    <td><span class="badge tipo-${(c.TIPO_CITA || 'GENERAL').toLowerCase()}">${escapeHtml(c.TIPO_CITA || 'GENERAL')}</span></td>
                    <td><span class="ctestado-badge ${estadoClass}">${escapeHtml(c.ESTADO || '')}</span></td>
                    <td>
                        <div class="ctacciones-consulta">
            `;

            if (accionesPermitidas) {
                html += `
                    <button class="ctbtn-accion" data-action="abrirConsulta" data-id="${c.ID_CITA}">
                        <i class="fas fa-user-md"></i> ${hasConsulta ? 'Ver' : 'Abrir'}
                    </button>
                `;
                if (hasConsulta) {
                    html += `
                        <button class="ctbtn-accion edit" data-action="editarConsulta" data-id="${c.ID_CITA}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    `;
                }
                if (c.ESTADO !== 'CANCELADA') {
                    html += `
                        <button class="ctbtn-accion ctbtn-cancelar" data-action="cancelar" data-id="${c.ID_CITA}">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    `;
                }
                if (c.ESTADO !== 'NO_ASISTIO') {
                    html += `
                        <button class="ctbtn-accion ctbtn-no-asistio" data-action="no_asistio" data-id="${c.ID_CITA}">
                            <i class="fas fa-user-times"></i> No Asistió
                        </button>
                    `;
                }
            } else {
                html += `<span class="text-muted">Sin acciones</span>`;
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
            </div>
        `;

        target.innerHTML = html;
    }

    // ============================================================
    // LLENAR SELECT DE CITAS
    // ============================================================
    function llenarSelectCitas(filter = "") {
        const sel = $("selectCitaConsulta");
        if (!sel) return;
        sel.innerHTML = '<option value="">Seleccionar cita...</option>';

        const citasFiltradas = aplicarFiltros(citas);

        if (citasFiltradas.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "No hay citas disponibles";
            opt.disabled = true;
            sel.appendChild(opt);
            return;
        }

        citasFiltradas.forEach(c => {
            const label = `#${c.ID_CITA} — ${c.NOMBRE_PACIENTE} • ${formatearFecha(c.FECHA_CITA)}`;
            const opt = document.createElement("option");
            opt.value = c.ID_CITA;
            opt.textContent = label;
            opt.dataset.telefono = c.TELEFONO_PACIENTE || "";
            opt.dataset.correo = c.CORREO_PACIENTE || "";
            opt.dataset.identidad = c.IDENTIDAD_PACIENTE || "";
            opt.dataset.estado = c.ESTADO || "";
            sel.appendChild(opt);
        });
    }

    // ============================================================
    // MODALES
    // ============================================================
    function abrirModalConsulta() {
        const modal = $("modalConsulta");
        if (!modal) return;
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
        limpiarModalConsulta();
        setTimeout(() => {
            llenarSelectCitas();
        }, 100);
    }

    function cerrarModalConsulta() {
        const modal = $("modalConsulta");
        if (!modal) return;
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        const historialContainer = document.getElementById('historialRapidoPaciente');
        if (historialContainer) historialContainer.style.display = 'none';
    }

    function limpiarModalConsulta() {
        const ids = ["idConsulta", "motivoConsulta", "sintomasConsulta", "examenFisicoConsulta",
            "diagnosticoPrincipal", "tratamiento", "recomendaciones", "examenesComplementariosConsulta"
        ];
        ids.forEach(id => {
            const el = $(id);
            if (el) el.value = "";
        });
        if ($("tipoConsulta")) $("tipoConsulta").value = "GENERAL";
        if ($("modalErrorConsulta")) $("modalErrorConsulta").style.display = "none";
        if ($("pacienteInfoConsulta")) $("pacienteInfoConsulta").textContent = "";
        limpiarPreclinicaFields();
        limpiarErroresCampos();
        const btnImprimir = document.getElementById('btnImprimirConsulta');
        if (btnImprimir) {
            btnImprimir.dataset.idConsulta = '';
        }
        const historialContainer = document.getElementById('historialRapidoPaciente');
        if (historialContainer) historialContainer.style.display = 'none';
    }

    function limpiarPreclinicaFields() {
        const ids = ["pre_TEMPERATURA", "pre_PRESION_SISTOLICA", "pre_PRESION_DIASTOLICA",
            "pre_PESO", "pre_TALLA", "pre_IMC", "pre_FC", "pre_FR",
            "pre_SATURACION", "pre_GLUCOSA", "pre_PERIMETRO", "pre_OBSERVACIONES"
        ];
        ids.forEach(id => {
            const el = $(id);
            if (el) el.value = "";
        });
        const preBox = $("preclinicaInfoConsulta");
        if (preBox) preBox.style.display = "none";
        const preSummary = $("preclinicaContenidoConsulta");
        if (preSummary) preSummary.style.display = "none";
    }

    function limpiarErroresCampos() {
        const ids = ["selectCitaConsulta", "diagnosticoPrincipal", "tratamiento", "sintomasConsulta", "examenFisicoConsulta"];
        ids.forEach(id => {
            const el = $(id);
            if (el) el.classList.remove("field-error");
            const err = $(id + "-error");
            if (err) {
                err.textContent = "";
                err.style.display = "none";
            }
        });
        if ($("modalErrorConsulta")) {
            $("modalErrorConsulta").style.display = "none";
            $("modalErrorConsulta").textContent = "";
        }
    }

    // ============================================================
    // CARGAR CONSULTA EN MODAL
    // ============================================================
    async function cargarConsultaEnModal(idCita) {
        if (!idCita) return;

        const cita = citas.find(x => String(x.ID_CITA) === String(idCita));
        const estado = cita ? String(cita.ESTADO || "").toUpperCase() : "";
        if (estado === "CANCELADA" || estado === "NO_ASISTIO") {
            mostrarAlerta("error", `No se permite abrir una cita con estado ${estado}.`);
            return;
        }

        try {
            const data = await API.obtenerConsulta(idCita);
            abrirModalConsulta();

            if ($("selectCitaConsulta")) {
                $("selectCitaConsulta").value = idCita;
                $("selectCitaConsulta").dispatchEvent(new Event("change"));
            }

            if (data && data.success && data.consulta) {
                llenarModalConConsulta(data.consulta);
                const btnImprimir = document.getElementById('btnImprimirConsulta');
                if (btnImprimir) {
                    btnImprimir.dataset.idConsulta = data.consulta.ID_CONSULTA;
                }
            }

            await cargarPreclinicaYMostrar(idCita);

            if (cita && cita.ID_PACIENTE) {
                await cargarHistorialRapido(cita.ID_PACIENTE);
                const btnHistorial = document.getElementById('btnVerHistorialCompleto');
                if (btnHistorial) {
                    btnHistorial.onclick = function() {
                        abrirHistorialCompleto(cita.ID_PACIENTE);
                    };
                    btnHistorial.style.display = 'inline-flex';
                }
            }

            setTimeout(() => {
                const d = $("diagnosticoPrincipal");
                if (d) d.focus();
            }, 200);

        } catch (err) {
            console.error("Error cargando consulta:", err);
            mostrarError("Error cargando datos de la consulta: " + err.message);
        }
    }

    function llenarModalConConsulta(c) {
        if (!c) return;
        if ($("idConsulta")) $("idConsulta").value = c.ID_CONSULTA || "";
        if ($("motivoConsulta")) $("motivoConsulta").value = c.MOTIVO_CONSULTA || "";
        if ($("sintomasConsulta")) {
            $("sintomasConsulta").value = Array.isArray(c.SINTOMAS) ?
                c.SINTOMAS.join("\n") :
                (typeof c.SINTOMAS === "string" ? c.SINTOMAS : "");
        }
        if ($("examenFisicoConsulta")) {
            $("examenFisicoConsulta").value = Array.isArray(c.EXAMEN_FISICO) ?
                c.EXAMEN_FISICO.join("\n") :
                (typeof c.EXAMEN_FISICO === "string" ? c.EXAMEN_FISICO : "");
        }
        if ($("diagnosticoPrincipal")) $("diagnosticoPrincipal").value = c.DIAGNOSTICO_PRINCIPAL || "";
        if ($("tratamiento")) $("tratamiento").value = c.TRATAMIENTO || "";
        if ($("recomendaciones")) $("recomendaciones").value = c.RECOMENDACIONES || "";
        if ($("tipoConsulta")) $("tipoConsulta").value = c.TIPO_CONSULTA || "GENERAL";
        if ($("examenesComplementariosConsulta")) $("examenesComplementariosConsulta").value = c.OBSERVACIONES || "";
    }

    // ============================================================
    // CARGAR PRECLÍNICA
    // ============================================================
    async function cargarPreclinicaYMostrar(idCita) {
        try {
            const res = await fetch(`/preclinica/por-cita/${idCita}`, { credentials: "same-origin" });
            if (!res.ok) {
                if (res.status === 404) {
                    limpiarPreclinicaFields();
                    return;
                }
                throw new Error("HTTP " + res.status);
            }
            const data = await res.json();
            if (data && data.success && data.preclinica) {
                const p = data.preclinica;
                const set = (id, val) => {
                    const el = $(id);
                    if (el) el.value = val == null ? "" : String(val);
                };
                set("pre_TEMPERATURA", p.TEMPERATURA ?? "");
                set("pre_PRESION_SISTOLICA", p.PRESION_SISTOLICA ?? "");
                set("pre_PRESION_DIASTOLICA", p.PRESION_DIASTOLICA ?? "");
                set("pre_PESO", p.PESO ?? "");
                set("pre_TALLA", p.TALLA ?? "");
                set("pre_IMC", p.IMC ?? "");
                set("pre_FC", p.FRECUENCIA_CARDIACA ?? "");
                set("pre_FR", p.FRECUENCIA_RESPIRATORIA ?? "");
                set("pre_SATURACION", p.SATURACION_OXIGENO ?? "");
                set("pre_GLUCOSA", p.GLUCOSA ?? "");
                set("pre_PERIMETRO", p.PERIMETRO_ABDOMINAL ?? "");
                set("pre_OBSERVACIONES", p.OBSERVACIONES ?? "");

                const preBox = $("preclinicaInfoConsulta");
                if (preBox) preBox.style.display = "block";
            } else {
                limpiarPreclinicaFields();
            }
        } catch (err) {
            console.warn("No se pudo cargar preclinica:", err);
            limpiarPreclinicaFields();
        }
    }

    // ============================================================
    // EVENTO SELECT CITA
    // ============================================================
    async function onSelectCitaChange() {
        const id = $("selectCitaConsulta")?.value;
        const pacienteInfo = $("pacienteInfoConsulta");
        if (pacienteInfo) pacienteInfo.textContent = "";

        const historialContainer = document.getElementById('historialRapidoPaciente');
        if (historialContainer) historialContainer.style.display = 'none';

        if (!id) {
            limpiarModalConsulta();
            const campos = ["motivoConsulta", "sintomasConsulta", "examenFisicoConsulta",
                "diagnosticoPrincipal", "tratamiento", "recomendaciones",
                "tipoConsulta", "btnGuardarConsulta", "examenesComplementariosConsulta"
            ];
            campos.forEach(campo => {
                const el = $(campo);
                if (el) el.disabled = false;
            });
            return;
        }

        const opt = $("selectCitaConsulta").selectedOptions[0];
        let idPaciente = null;

        if (opt) {
            const info = [];
            if (opt.dataset.telefono) info.push("📞 " + opt.dataset.telefono);
            if (opt.dataset.identidad) info.push("🪪 " + opt.dataset.identidad);
            if (opt.dataset.correo) info.push("✉️ " + opt.dataset.correo);
            if (pacienteInfo) pacienteInfo.textContent = info.join(" • ");

            const cita = citas.find(x => String(x.ID_CITA) === String(id));
            if (cita) {
                idPaciente = cita.ID_PACIENTE;
            }

            const estado = (opt.dataset.estado || "").toUpperCase();
            const deshabilitar = estado === "CANCELADA" || estado === "NO_ASISTIO";
            const campos = ["motivoConsulta", "sintomasConsulta", "examenFisicoConsulta",
                "diagnosticoPrincipal", "tratamiento", "recomendaciones",
                "tipoConsulta", "btnGuardarConsulta", "examenesComplementariosConsulta",
                "btnImprimirConsulta"
            ];
            campos.forEach(campo => {
                const el = $(campo);
                if (el) el.disabled = deshabilitar;
            });
            if (deshabilitar) {
                mostrarAlerta("error", `La cita está en estado ${estado} y no se puede editar/crear consulta.`);
            } else {
                campos.forEach(campo => {
                    const el = $(campo);
                    if (el) el.disabled = false;
                });
            }
        }

        try {
            const data = await API.obtenerConsulta(id);
            if (data && data.success && data.consulta) {
                llenarModalConConsulta(data.consulta);
                const idConsulta = data.consulta.ID_CONSULTA;
                const btnImprimir = document.getElementById('btnImprimirConsulta');
                if (btnImprimir) {
                    btnImprimir.dataset.idConsulta = idConsulta;
                }
            } else {
                if ($("idConsulta")) $("idConsulta").value = "";
                ["motivoConsulta", "sintomasConsulta", "examenFisicoConsulta",
                    "diagnosticoPrincipal", "tratamiento", "recomendaciones",
                    "examenesComplementariosConsulta"
                ].forEach(campo => {
                    const el = $(campo);
                    if (el) el.value = "";
                });
                const btnImprimir = document.getElementById('btnImprimirConsulta');
                if (btnImprimir) {
                    btnImprimir.dataset.idConsulta = '';
                }
            }
        } catch (err) {
            console.error("Error cargando consulta:", err);
        }

        await cargarPreclinicaYMostrar(id);

        if (idPaciente) {
            await cargarHistorialRapido(idPaciente);
            const btnHistorial = document.getElementById('btnVerHistorialCompleto');
            if (btnHistorial) {
                btnHistorial.onclick = function() {
                    abrirHistorialCompleto(idPaciente);
                };
                btnHistorial.style.display = 'inline-flex';
            }
        } else {
            const btnHistorial = document.getElementById('btnVerHistorialCompleto');
            if (btnHistorial) btnHistorial.style.display = 'none';
        }
    }

    // ============================================================
    // HISTORIAL RÁPIDO DEL PACIENTE
    // ============================================================
    async function cargarHistorialRapido(idPaciente) {
        const container = document.getElementById('historialRapidoContenido');
        if (!container) return;

        try {
            const data = await API.cargarHistorialRapido(idPaciente);

            if (!data.success) {
                container.innerHTML = `<p class="text-muted">No se pudo cargar el historial</p>`;
                return;
            }

            let html = '';

            if (data.historial) {
                const h = data.historial;
                if (h.ALERGIAS) {
                    const alergias = parseJSONField(h.ALERGIAS);
                    if (alergias.length > 0) {
                        html += `
                            <div style="margin-bottom:8px;">
                                <strong style="color:#dc3545;"> Alergias:</strong>
                                <span class="badge bg-danger">${escapeHtml(alergias.join(', '))}</span>
                            </div>
                        `;
                    }
                }
                if (h.MEDICAMENTOS_ACTUALES) {
                    const medicamentos = parseJSONField(h.MEDICAMENTOS_ACTUALES);
                    if (medicamentos.length > 0) {
                        html += `
                            <div style="margin-bottom:8px;">
                                <strong style="color:#28a745;"> Medicamentos actuales:</strong>
                                <span class="badge bg-success">${escapeHtml(medicamentos.join(', '))}</span>
                            </div>
                        `;
                    }
                }
                if (h.ENFERMEDADES_CRONICAS) {
                    const cronicas = parseJSONField(h.ENFERMEDADES_CRONICAS);
                    if (cronicas.length > 0) {
                        html += `
                            <div style="margin-bottom:8px;">
                                <strong style="color:#fd7e14;"> Enfermedades crónicas:</strong>
                                <span class="badge bg-warning text-dark">${escapeHtml(cronicas.join(', '))}</span>
                            </div>
                        `;
                    }
                }
            }

            if (data.consultas && data.consultas.length > 0) {
                html += `
                    <div style="margin-top:8px;">
                        <strong><i class="fas fa-notes-medical"></i> Últimas consultas:</strong>
                    </div>
                    <div style="max-height:150px; overflow-y:auto; margin-top:4px;">
                `;
                data.consultas.forEach((consulta) => {
                    const fecha = new Date(consulta.FECHA_CONSULTA).toLocaleDateString('es-ES');
                    const tipo = consulta.TIPO_CONSULTA || 'GENERAL';
                    const diagnostico = consulta.DIAGNOSTICO_PRINCIPAL || 'N/A';
                    const tratamiento = consulta.TRATAMIENTO || 'N/A';
                    const tieneExamenes = consulta.OBSERVACIONES && consulta.OBSERVACIONES.trim() !== '';

                    html += `
                        <div style="border-bottom:1px solid #e9ecef; padding:6px 0; font-size:0.85rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span><strong>${fecha}</strong> - ${escapeHtml(diagnostico)}</span>
                                <span class="badge bg-info">${tipo}</span>
                            </div>
                            <div style="color:#6c757d; font-size:0.8rem;">
                                Tratamiento: ${escapeHtml(tratamiento)}
                            </div>
                            ${tieneExamenes ? `
                                <div style="color:#17a2b8; font-size:0.8rem; margin-top:2px;">
                                    <i class="fas fa-flask"></i> ${escapeHtml(consulta.OBSERVACIONES)}
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
                html += `</div>`;
            } else {
                html += `<p class="text-muted" style="font-size:0.85rem;">No hay consultas previas registradas.</p>`;
            }

            container.innerHTML = html;
            document.getElementById('historialRapidoPaciente').style.display = 'block';

        } catch (err) {
            console.error("Error cargando historial rápido:", err);
            container.innerHTML = `<p class="text-muted">Error al cargar historial: ${err.message}</p>`;
        }
    }

    // ============================================================
    // IMPRIMIR CONSULTA
    // ============================================================
    async function imprimirConsulta() {
        const idConsulta = document.getElementById('idConsulta')?.value;
        const btnImprimir = document.getElementById('btnImprimirConsulta');

        if (!idConsulta) {
            mostrarAlerta('error', 'No hay consulta guardada para imprimir. Guarde primero la consulta.');
            return;
        }

        try {
            if (btnImprimir) {
                btnImprimir.disabled = true;
                btnImprimir.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Cargando...';
            }

            const data = await API.imprimirConsulta(idConsulta);

            if (!data.success) {
                mostrarAlerta('error', data.error || 'Error al cargar datos para imprimir');
                return;
            }

            const c = data.consulta;
            const p = data.preclinica;

            const ventana = window.open('', '_blank', 'width=900,height=700');
            if (!ventana) {
                alert('Por favor, permite las ventanas emergentes para imprimir.');
                return;
            }

            const fechaFormateada = new Date(c.FECHA_CONSULTA).toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const sintomas = Array.isArray(c.SINTOMAS) ? c.SINTOMAS.join('\n') : (c.SINTOMAS || 'N/A');
            const examenFisico = Array.isArray(c.EXAMEN_FISICO) ? c.EXAMEN_FISICO.join('\n') : (c.EXAMEN_FISICO || 'N/A');

            ventana.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Consulta Médica - ${c.NOMBRE_PACIENTE}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'Times New Roman', serif;
                            padding: 40px;
                            margin: 0;
                            background: white;
                            color: #333;
                            line-height: 1.5;
                        }
                        @page { margin: 20mm; }
                        .header {
                            display: flex;
                            align-items: center;
                            border-bottom: 3px solid #1a3c6e;
                            padding-bottom: 15px;
                            margin-bottom: 20px;
                        }
                        .logo { height: 70px; margin-right: 20px; max-width: 180px; object-fit: contain; }
                        .company-info { flex: 1; }
                        .company-name {
                            font-size: 22px;
                            font-weight: bold;
                            color: #1a3c6e;
                            margin-bottom: 3px;
                        }
                        .company-slogan {
                            font-size: 14px;
                            color: #666;
                            font-style: italic;
                        }
                        .title {
                            text-align: center;
                            font-size: 20px;
                            font-weight: bold;
                            color: #1a3c6e;
                            margin: 15px 0;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                        }
                        .info-paciente {
                            background: #f8f9fa;
                            padding: 12px 16px;
                            border-radius: 6px;
                            margin-bottom: 15px;
                            border: 1px solid #e9ecef;
                        }
                        .info-paciente h4 {
                            margin-bottom: 6px;
                            color: #1a3c6e;
                        }
                        .info-paciente .row {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 10px 20px;
                            font-size: 14px;
                        }
                        .info-paciente .row span { color: #555; }
                        .section {
                            margin: 12px 0;
                        }
                        .section-title {
                            font-weight: bold;
                            font-size: 15px;
                            color: #1a3c6e;
                            border-bottom: 1px solid #dee2e6;
                            padding-bottom: 4px;
                            margin-bottom: 6px;
                        }
                        .section-content {
                            padding: 4px 0;
                            font-size: 14px;
                            white-space: pre-line;
                        }
                        .grid-2 {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 20px;
                        }
                        .preclinica-grid {
                            display: grid;
                            grid-template-columns: repeat(4, 1fr);
                            gap: 6px 12px;
                            font-size: 13px;
                            padding: 6px 0;
                        }
                        .preclinica-grid .item {
                            display: flex;
                            justify-content: space-between;
                            border-bottom: 1px dashed #e9ecef;
                            padding: 2px 0;
                        }
                        .preclinica-grid .item .label { color: #666; }
                        .preclinica-grid .item .value { font-weight: 600; color: #1a3c6e; }
                        .footer {
                            margin-top: 30px;
                            padding-top: 15px;
                            border-top: 2px solid #eee;
                            display: flex;
                            justify-content: space-between;
                            font-size: 12px;
                            color: #666;
                        }
                        .firma {
                            margin-top: 30px;
                            text-align: center;
                            padding-top: 20px;
                            border-top: 1px solid #ddd;
                        }
                        .firma .linea {
                            display: inline-block;
                            width: 250px;
                            border-top: 1px solid #333;
                            margin-top: 30px;
                            padding-top: 8px;
                            font-size: 13px;
                            color: #555;
                        }
                        @media print {
                            button, .btn, .no-print { display: none !important; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <img src="/roca-maya-oct.jpg" class="logo" alt="Clínicas Roca Maya" />
                        <div class="company-info">
                            <div class="company-name">Clínicas Médicas Roca Maya</div>
                            <div class="company-slogan">Tu salud es nuestra seguridad</div>
                        </div>
                    </div>

                    <div class="title">Registro de Consulta Médica</div>

                    <div class="info-paciente">
                        <h4>Datos del Paciente</h4>
                        <div class="row">
                            <span><strong>${escapeHtml(c.NOMBRE_PACIENTE)}</strong></span>
                            <span> ${c.FECHA_NACIMIENTO ? new Date(c.FECHA_NACIMIENTO).toLocaleDateString('es-ES') : 'N/A'}</span>
                            <span> ${c.GENERO || 'N/A'}</span>
                            <span> ${c.TELEFONO || 'N/A'}</span>
                            <span> ${c.CORREO_ELECTRONICO || 'N/A'}</span>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:12px; background:#e9ecef; padding:8px 12px; border-radius:4px;">
                        <span><strong>Consulta #${c.ID_CONSULTA}</strong></span>
                        <span><strong>Fecha:</strong> ${fechaFormateada}</span>
                        <span><strong>Doctor:</strong> Dr. ${escapeHtml(c.NOMBRE_DOCTOR)}</span>
                        <span><strong>Tipo:</strong> ${c.TIPO_CONSULTA || 'GENERAL'}</span>
                    </div>

                    <div class="grid-2">
                        <div class="section">
                            <div class="section-title">Motivo de Consulta</div>
                            <div class="section-content">${escapeHtml(c.MOTIVO_CONSULTA || 'No registrado')}</div>
                        </div>
                        <div class="section">
                            <div class="section-title">Diagnóstico Principal</div>
                            <div class="section-content"><strong>${escapeHtml(c.DIAGNOSTICO_PRINCIPAL || 'No registrado')}</strong></div>
                            ${c.CODIGO_CIE10_PRINCIPAL ? `<div style="font-size:13px; color:#666;">CIE-10: ${escapeHtml(c.CODIGO_CIE10_PRINCIPAL)}</div>` : ''}
                        </div>
                    </div>

                    <div class="grid-2">
                        <div class="section">
                            <div class="section-title">Síntomas</div>
                            <div class="section-content">${escapeHtml(sintomas)}</div>
                        </div>
                        <div class="section">
                            <div class="section-title">Examen Físico</div>
                            <div class="section-content">${escapeHtml(examenFisico)}</div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">Tratamiento</div>
                        <div class="section-content">${escapeHtml(c.TRATAMIENTO || 'No registrado')}</div>
                    </div>

                    <div class="section">
                        <div class="section-title">Recomendaciones</div>
                        <div class="section-content">${escapeHtml(c.RECOMENDACIONES || 'No registrado')}</div>
                    </div>

                    ${c.OBSERVACIONES && c.OBSERVACIONES.trim() !== '' ? `
                        <div class="section">
                            <div class="section-title"><i class="fas fa-flask" style="color:#17a2b8;"></i> Exámenes Complementarios</div>
                            <div class="section-content" style="background:#f7f9fb; padding:10px; border-radius:4px; border-left:3px solid #17a2b8;">
                                ${escapeHtml(c.OBSERVACIONES)}
                            </div>
                        </div>
                    ` : ''}

                    ${p ? `
                        <div class="section">
                            <div class="section-title">Signos Vitales (Preclínica)</div>
                            <div class="preclinica-grid">
                                ${p.TEMPERATURA ? `<div class="item"><span class="label">Temperatura</span><span class="value">${p.TEMPERATURA}°C</span></div>` : ''}
                                ${p.PRESION_SISTOLICA && p.PRESION_DIASTOLICA ? `<div class="item"><span class="label">Presión</span><span class="value">${p.PRESION_SISTOLICA}/${p.PRESION_DIASTOLICA}</span></div>` : ''}
                                ${p.FRECUENCIA_CARDIACA ? `<div class="item"><span class="label">Frec. Cardíaca</span><span class="value">${p.FRECUENCIA_CARDIACA} lpm</span></div>` : ''}
                                ${p.FRECUENCIA_RESPIRATORIA ? `<div class="item"><span class="label">Frec. Respiratoria</span><span class="value">${p.FRECUENCIA_RESPIRATORIA} rpm</span></div>` : ''}
                                ${p.SATURACION_OXIGENO ? `<div class="item"><span class="label">Saturación O₂</span><span class="value">${p.SATURACION_OXIGENO}%</span></div>` : ''}
                                ${p.PESO ? `<div class="item"><span class="label">Peso</span><span class="value">${p.PESO} kg</span></div>` : ''}
                                ${p.TALLA ? `<div class="item"><span class="label">Talla</span><span class="value">${p.TALLA} m</span></div>` : ''}
                                ${p.IMC ? `<div class="item"><span class="label">IMC</span><span class="value">${p.IMC}</span></div>` : ''}
                                ${p.GLUCOSA ? `<div class="item"><span class="label">Glucosa</span><span class="value">${p.GLUCOSA} mg/dL</span></div>` : ''}
                                ${p.ESTADO_GENERAL ? `<div class="item"><span class="label">Estado General</span><span class="value">${p.ESTADO_GENERAL}</span></div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <div class="firma">
                        <div class="linea">Dr. ${escapeHtml(c.NOMBRE_DOCTOR)}</div>
                        <div style="font-size:12px; color:#666; margin-top:4px;">Médico Tratante</div>
                    </div>

                    <div class="footer">
                        <div>Documento generado automáticamente</div>
                        <div>${new Date().toLocaleString('es-ES')}</div>
                    </div>
                </body>
                </html>
            `);

            ventana.document.close();
            setTimeout(() => {
                ventana.focus();
                ventana.print();
            }, 800);

            if (btnImprimir) {
                btnImprimir.disabled = false;
                btnImprimir.innerHTML = '<i class="fas fa-print"></i> Imprimir';
            }

        } catch (err) {
            console.error("Error imprimiendo consulta:", err);
            mostrarAlerta('error', 'Error al imprimir: ' + err.message);
            if (btnImprimir) {
                btnImprimir.disabled = false;
                btnImprimir.innerHTML = '<i class="fas fa-print"></i> Imprimir';
            }
        }
    }

    // ============================================================
    // ABRIR HISTORIAL COMPLETO DEL PACIENTE
    // ============================================================
    function abrirHistorialCompleto(idPaciente) {
        if (!idPaciente) {
            mostrarAlerta('error', 'No se puede abrir el historial: paciente no identificado');
            return;
        }
        window.open(`/historial?pacienteId=${idPaciente}`, '_blank');
    }

    // ============================================================
    // VALIDACIÓN Y GUARDADO
    // ============================================================
    function validarFormulario() {
        const errors = [];
        const idCita = $("selectCitaConsulta")?.value;
        const diag = $("diagnosticoPrincipal")?.value?.trim() || "";
        const trat = $("tratamiento")?.value?.trim() || "";
        const sintomas = $("sintomasConsulta")?.value?.trim() || "";
        const examen = $("examenFisicoConsulta")?.value?.trim() || "";

        if (!idCita) errors.push({ field: "selectCitaConsulta", message: "Seleccione la cita." });
        if (!diag) errors.push({ field: "diagnosticoPrincipal", message: "Diagnóstico principal es obligatorio." });
        if (!trat) errors.push({ field: "tratamiento", message: "Tratamiento es obligatorio." });
        if (!sintomas && !examen) {
            errors.push({ field: "sintomasConsulta", message: "Registre síntomas o examen físico (al menos uno)." });
        }

        limpiarErroresCampos();

        errors.forEach(e => {
            const el = $(e.field);
            if (el) el.classList.add("field-error");
            const errEl = $(e.field + "-error");
            if (errEl) {
                errEl.textContent = e.message;
                errEl.style.display = "block";
            }
        });

        if (errors.length) {
            if ($("modalErrorConsulta")) {
                $("modalErrorConsulta").textContent = errors.map(e => e.message).join(" ");
                $("modalErrorConsulta").style.display = "block";
            }
            return false;
        }
        return true;
    }

    function textAreaToArray(value) {
        if (!value) return [];
        return value.split("\n").map(s => s.trim()).filter(Boolean);
    }

    function obtenerDatosFormulario() {
        const idConsulta = $("idConsulta")?.value || null;
        const idCita = $("selectCitaConsulta")?.value;

        return {
            idCita: Number(idCita),
            idConsulta: idConsulta ? Number(idConsulta) : null,
            motivoConsulta: $("motivoConsulta")?.value || null,
            sintomas: textAreaToArray($("sintomasConsulta")?.value || ""),
            examenFisico: textAreaToArray($("examenFisicoConsulta")?.value || ""),
            diagnosticoPrincipal: $("diagnosticoPrincipal")?.value || null,
            tratamiento: $("tratamiento")?.value || null,
            recomendaciones: $("recomendaciones")?.value || null,
            observaciones: $("examenesComplementariosConsulta")?.value || null,
            examenesComplementarios: $("examenesComplementariosConsulta")?.value || null,
            tipoConsulta: $("tipoConsulta")?.value || "GENERAL"
        };
    }

    async function guardarConsultaHandler() {
        if (saving) return;

        if (!validarFormulario()) return;

        const datos = obtenerDatosFormulario();
        const btn = $("btnGuardarConsulta");
        if (btn) btn.disabled = true;
        saving = true;

        try {
            let result;
            if (datos.idConsulta) {
                result = await API.actualizarConsulta(datos);
            } else {
                result = await API.guardarConsulta(datos);
            }
            mostrarAlerta("success", result.message || "Consulta guardada correctamente");
            cerrarModalConsulta();
            await cargarDatos();

            try {
                const bc = new BroadcastChannel("citas_channel");
                bc.postMessage({
                    type: "consulta_saved",
                    idCita: datos.idCita,
                    idConsulta: result.idConsulta || null,
                    nuevoEstado: "FINALIZADA"
                });
                bc.postMessage({
                    type: "estado_cita",
                    id: datos.idCita,
                    nuevoEstado: "FINALIZADA"
                });
                bc.close();
            } catch (e) { /* ignorar */ }

        } catch (err) {
            console.error("Error guardando consulta:", err);
            mostrarError("Error guardando: " + err.message);
        } finally {
            saving = false;
            if (btn) btn.disabled = false;
        }
    }

    // ============================================================
    // CAMBIAR ESTADO DE CITA
    // ============================================================
    async function cambiarEstado(idCita, nuevoEstado) {
        try {
            const result = await API.cambiarEstado(idCita, nuevoEstado);
            mostrarAlerta("success", result.message || "Estado actualizado");
            await cargarDatos();

            try {
                const bc = new BroadcastChannel("citas_channel");
                bc.postMessage({ type: "estado_cita", id: Number(idCita), nuevoEstado });
                bc.close();
            } catch (e) { /* ignorar */ }

        } catch (err) {
            console.error("Error cambiando estado:", err);
            mostrarError("Error cambiando estado: " + err.message);
        }
    }

    // ============================================================
    // FUNCIONES DE UI (Alertas)
    // ============================================================
    function mostrarAlerta(tipo, texto) {
        try {
            if (tipo === "success") {
                const el = $("alertSuccessConsulta");
                if (!el) return alert(texto);
                const msg = $("successMessageConsulta");
                if (msg) msg.textContent = texto;
                el.style.display = "flex";
                setTimeout(() => el.style.display = "none", 3500);
            } else {
                const el = $("alertErrorConsulta");
                if (!el) return alert(texto);
                const msg = $("errorMessageConsulta");
                if (msg) msg.textContent = texto;
                el.style.display = "flex";
                setTimeout(() => el.style.display = "none", 5000);
            }
        } catch (e) {
            console.warn("mostrarAlerta", e);
        }
    }

    function mostrarError(txt) {
        const el = $("modalErrorConsulta");
        if (!el) return alert(txt);
        el.textContent = txt;
        el.style.display = "flex";
    }

    // ============================================================
    // IMPRESIÓN DE LISTADO
    // ============================================================
    function imprimirListadoConsulta() {
        const tablaContainer = document.getElementById("tablaContenidoConsulta");
        if (!tablaContainer) {
            alert("No hay contenido para imprimir.");
            return;
        }

        const tablaOriginal = tablaContainer.querySelector('table');
        if (!tablaOriginal) {
            alert("No hay datos para imprimir.");
            return;
        }

        const filasVisibles = tablaOriginal.querySelectorAll('tbody tr');
        if (filasVisibles.length === 0) {
            alert("No hay registros visibles para imprimir.");
            return;
        }

        const tablaClon = tablaOriginal.cloneNode(true);

        const filasTabla = tablaClon.querySelectorAll("tr");
        filasTabla.forEach((fila) => {
            const celdas = fila.querySelectorAll("td, th");
            if (celdas.length > 0) {
                const ultimaCelda = celdas[celdas.length - 1];
                if (ultimaCelda) {
                    const esAcciones = ultimaCelda.querySelector('.ctacciones-consulta') ||
                        ultimaCelda.textContent.includes('Abrir') ||
                        ultimaCelda.textContent.includes('Editar') ||
                        ultimaCelda.textContent.includes('Cancelar') ||
                        ultimaCelda.textContent.trim() === 'Acciones';
                    if (esAcciones) {
                        ultimaCelda.remove();
                    }
                }
            }
        });

        const totalRegistros = filasVisibles.length;
        const now = new Date().toLocaleString();

        const ventana = window.open("", "_blank", "width=1000,height=700");
        if (!ventana) {
            alert("Por favor, permite las ventanas emergentes para imprimir.");
            return;
        }

        ventana.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Imprimir - Consultas Médicas</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: Arial, Helvetica, sans-serif; 
                        padding: 30px; 
                        margin: 0;
                        background: white;
                    }
                    @page { margin: 20mm; size: landscape; }
                    .header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 25px;
                        padding-bottom: 15px;
                        border-bottom: 3px solid #1a3c6e;
                    }
                    .logo { height: 70px; margin-right: 20px; max-width: 180px; object-fit: contain; }
                    .company-info { flex: 1; }
                    .company-name { 
                        font-size: 22px; 
                        font-weight: bold; 
                        color: #1a3c6e;
                        margin-bottom: 3px;
                    }
                    .company-slogan { 
                        font-size: 14px; 
                        color: #666; 
                        font-style: italic;
                    }
                    .report-title {
                        text-align: center;
                        font-size: 20px;
                        font-weight: bold;
                        color: #2c3e50;
                        margin: 15px 0 10px 0;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .report-subtitle {
                        text-align: center;
                        font-size: 13px;
                        color: #666;
                        margin-bottom: 15px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-family: Arial, Helvetica, sans-serif;
                        margin-top: 10px;
                        font-size: 11px;
                    }
                    th, td {
                        border: 1px solid #ccc;
                        padding: 6px 8px;
                        text-align: left;
                    }
                    th {
                        background: #f3f3f3;
                        font-weight: bold;
                        color: #333;
                    }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .footer {
                        margin-top: 25px;
                        padding-top: 15px;
                        border-top: 2px solid #eee;
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        color: #666;
                    }
                    .total-registros { font-weight: bold; color: #1a3c6e; }
                    .ctestado-badge {
                        display: inline-block;
                        padding: 2px 10px;
                        border-radius: 10px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }
                    .ctestado-preciinica { background: #fff3cd; color: #856404; }
                    .ctestado-cancelada { background: #f8d7da; color: #721c24; }
                    .ctestado-no_asistio { background: #e2e3e5; color: #383d41; }
                    .ctestado-programada { background: #cce5ff; color: #004085; }
                    .ctestado-confirmada { background: #d4edda; color: #155724; }
                    .ctestado-consulta_medica { background: #c3e6cb; color: #0b5e1a; }
                    .ctestado-finalizada { background: #d1ecf1; color: #0c5460; }
                    .tipo-general { background: #e9ecef; color: #495057; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
                    .tipo-especialidad { background: #cce5ff; color: #004085; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
                    .tipo-control { background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
                    .tipo-emergencia { background: #f8d7da; color: #721c24; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
                    button, .btn, .ctbtn-primary, .ctbtn-secondary, .ctbtn-accion, .btn-accion {
                        display: none !important;
                    }
                    .no-print { display: none !important; }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="/roca-maya-oct.jpg" class="logo" alt="Clínicas Roca Maya" />
                    <div class="company-info">
                        <div class="company-name">Clínicas Médicas Roca Maya</div>
                        <div class="company-slogan">Tu salud es nuestra seguridad</div>
                    </div>
                </div>
                
                <div class="report-title">Listado de Consultas Médicas</div>
                <div class="report-subtitle">${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                
                ${tablaClon.outerHTML}
                
                <div class="footer">
                    <div>
                        <span class="total-registros">Total de registros: ${totalRegistros}</span>
                    </div>
                    <div>
                        Generado el: ${now}
                    </div>
                </div>
                
                <div style="text-align:center; margin-top:15px; font-size:10px; color:#999;">
                    Documento generado automáticamente por el sistema de Clínicas Roca Maya
                </div>
            </body>
            </html>
        `);

        ventana.document.close();

        setTimeout(() => {
            ventana.focus();
            ventana.print();
        }, 800);
    }

    // ============================================================
    // EXPORTAR EXCEL
    // ============================================================
    async function exportarExcelConsulta() {
        try {
            const btnExcel = document.getElementById('btnExcelConsulta');
            const originalText = btnExcel?.innerHTML || 'Excel';

            if (btnExcel) {
                btnExcel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
                btnExcel.disabled = true;
            }

            const pacienteInput = document.getElementById('filtroPaciente');
            const telefonoInput = document.getElementById('filtroTelefono');
            const identidadInput = document.getElementById('filtroIdentidad');
            const fechaInput = document.getElementById('filtroFechaConsulta');
            const tipoInput = document.getElementById('filtroTipoConsulta');

            const params = new URLSearchParams();

            if (pacienteInput?.value) params.append('paciente', pacienteInput.value.trim());
            if (telefonoInput?.value) params.append('telefono', telefonoInput.value.trim());
            if (identidadInput?.value) params.append('identidad', identidadInput.value.trim());
            if (fechaInput?.value) params.append('fecha', fechaInput.value);
            if (tipoInput?.value) params.append('tipo', tipoInput.value);

            let url = '/excel/consultas';
            if (params.toString()) {
                url += '?' + params.toString();
            }

            console.log(' Exportando Excel con filtros:', url);

            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (btnExcel) {
                setTimeout(() => {
                    btnExcel.innerHTML = originalText;
                    btnExcel.disabled = false;
                }, 3000);
            }

        } catch (error) {
            console.error('Error exportando Excel:', error);
            alert('Error al exportar Excel: ' + error.message);

            const btnExcel = document.getElementById('btnExcelConsulta');
            if (btnExcel) {
                btnExcel.innerHTML = '<i class="fas fa-file-excel"></i> Excel';
                btnExcel.disabled = false;
            }
        }
    }

    // ============================================================
    // FILTROS
    // ============================================================
    function limpiarFiltros() {
        filtrosConsulta = {
            paciente: '',
            telefono: '',
            identidad: '',
            fecha: '',
            tipo: ''
        };

        const inputs = ['filtroPaciente', 'filtroTelefono', 'filtroIdentidad', 'filtroFechaConsulta', 'filtroTipoConsulta'];
        inputs.forEach(id => {
            const el = $(id);
            if (el) el.value = '';
        });

        renderizarTabla();
        llenarSelectCitas();
    }

    function setupFiltros() {
        const filtrosMap = {
            'filtroPaciente': 'paciente',
            'filtroTelefono': 'telefono',
            'filtroIdentidad': 'identidad',
            'filtroFechaConsulta': 'fecha',
            'filtroTipoConsulta': 'tipo'
        };

        Object.entries(filtrosMap).forEach(([id, key]) => {
            const el = $(id);
            if (!el) return;

            const handler = (e) => {
                if (key === 'telefono') {
                    filtrosConsulta[key] = sanitizarNumero(e.target.value);
                    e.target.value = filtrosConsulta[key];
                } else if (key === 'identidad') {
                    filtrosConsulta[key] = sanitizarIdentidad(e.target.value);
                    e.target.value = filtrosConsulta[key];
                } else if (key === 'paciente') {
                    filtrosConsulta[key] = sanitizarBusqueda(e.target.value);
                    e.target.value = filtrosConsulta[key];
                } else {
                    filtrosConsulta[key] = e.target.value;
                }
                renderizarTabla();
                llenarSelectCitas();
            };

            if (el.type === 'date' || el.tagName === 'SELECT') {
                el.addEventListener('change', handler);
            } else {
                el.addEventListener('input', debounce(handler, 300));
            }
        });
    }

    // ============================================================
    // CALENDARIO
    // ============================================================

    let fechaActualCalendario = new Date();
    let mesCalendarioActual = fechaActualCalendario.getMonth();
    let anioCalendarioActual = fechaActualCalendario.getFullYear();
    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    let citasCalendario = [];
    let doctoresCalendario = [];

    async function cargarDatosCalendario() {
        try {
            const res = await fetch("/consultaMedica/api/calendario", { credentials: "same-origin" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            citasCalendario = data.citas || [];
            doctoresCalendario = data.doctores || [];
            return data;
        } catch (err) {
            console.error("Error cargando datos del calendario:", err);
            mostrarAlerta("error", "Error cargando datos del calendario: " + err.message);
            return null;
        }
    }

    function mostrarCalendario(lista = null) {
        const dias = document.getElementById("calendar-days");
        const titulo = document.getElementById("calendar-month-year");

        if (!dias || !titulo) return;

        const citasMostrar = lista || citasCalendario;

        titulo.textContent = `${nombresMeses[mesCalendarioActual]} ${anioCalendarioActual}`;
        dias.innerHTML = "";

        const primerDia = new Date(anioCalendarioActual, mesCalendarioActual, 1).getDay();
        const totalDias = new Date(anioCalendarioActual, mesCalendarioActual + 1, 0).getDate();

        for (let i = 0; i < primerDia; i++) {
            const vacio = document.createElement("div");
            vacio.className = "calendar-day empty";
            dias.appendChild(vacio);
        }

        for (let dia = 1; dia <= totalDias; dia++) {
            const celda = document.createElement("div");
            celda.className = "calendar-day";
            celda.dataset.dia = dia;
            celda.dataset.mes = mesCalendarioActual;
            celda.dataset.anio = anioCalendarioActual;

            const numero = document.createElement("div");
            numero.className = "day-number";
            const fecha = new Date(anioCalendarioActual, mesCalendarioActual, dia);
            if (fecha.getDay() === 0 || fecha.getDay() === 6) {
                numero.classList.add("weekend");
            }
            numero.textContent = dia;
            celda.appendChild(numero);

            const citasDia = citasMostrar.filter(cita => {
                const fechaStr = cita.FECHA_CITA || cita.fecha_cita;
                if (!fechaStr) return false;
                try {
                    const fecha = new Date(fechaStr);
                    if (isNaN(fecha.getTime())) return false;
                    return (fecha.getDate() === dia && fecha.getMonth() === mesCalendarioActual && fecha.getFullYear() === anioCalendarioActual);
                } catch (e) {
                    return false;
                }
            });

            citasDia.forEach(cita => {
                const badge = document.createElement("div");
                badge.className = "cita-badge";
                const horaCita = cita.HORA_CITA || cita.hora_cita || "";
                const nombrePaciente = cita.NOMBRE_PACIENTE || "";
                const estadoCita = String(cita.ESTADO || "").toLowerCase();
                
                if (estadoCita.includes('preclinica')) badge.classList.add('preclinica');
                else if (estadoCita.includes('consulta_medica') || estadoCita.includes('consulta medica')) badge.classList.add('consulta_medica');
                else if (estadoCita.includes('programada')) badge.classList.add('programada');
                else if (estadoCita.includes('confirmada')) badge.classList.add('confirmada');
                else if (estadoCita.includes('finalizada')) badge.classList.add('finalizada');
                else if (estadoCita.includes('cancelada')) badge.classList.add('cancelada');
                else if (estadoCita.includes('no_asistio') || estadoCita.includes('no asistio')) badge.classList.add('no_asistio');
                
                badge.innerHTML = `<strong>${horaCita}</strong> ${escapeHtml(nombrePaciente)}`;
                badge.dataset.id = cita.ID_CITA;

                badge.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const id = badge.dataset.id;
                    if (id) {
                        abrirDetalleCitaCalendario(id);
                    }
                });

                celda.appendChild(badge);
            });

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const fechaCelda = new Date(anioCalendarioActual, mesCalendarioActual, dia);
            if (fechaCelda >= hoy) {
                const btnAdd = document.createElement("button");
                btnAdd.className = "add-cita-quick";
                btnAdd.innerHTML = "+";
                btnAdd.title = "Agregar consulta en este día";
                btnAdd.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const fechaStr = `${anioCalendarioActual}-${String(mesCalendarioActual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                    cerrarCalendario();
                    setTimeout(() => {
                        abrirModalConsulta();
                        setTimeout(() => {
                            llenarSelectCitas();
                            const selectCita = document.getElementById('selectCitaConsulta');
                            if (selectCita) {
                                const opciones = Array.from(selectCita.options);
                                let encontrado = false;
                                for (let opt of opciones) {
                                    if (opt.value && opt.text.includes(fechaStr)) {
                                        selectCita.value = opt.value;
                                        selectCita.dispatchEvent(new Event('change'));
                                        encontrado = true;
                                        break;
                                    }
                                }
                                if (!encontrado) {
                                    const pacienteInfo = document.getElementById("pacienteInfoConsulta");
                                    if (pacienteInfo) {
                                        pacienteInfo.textContent = ` No hay citas en estado CONSULTA_MEDICA o PRECLINICA para el día ${fechaStr}`;
                                        pacienteInfo.style.color = "#dc3545";
                                        pacienteInfo.style.fontWeight = "bold";
                                    }
                                }
                            }
                        }, 300);
                    }, 300);
                });
                celda.appendChild(btnAdd);
            }

            dias.appendChild(celda);
        }
    }

    async function abrirCalendario() {
        const modal = document.getElementById("modalCalendario");
        if (!modal) {
            console.error("No se encontró el modal del calendario");
            return;
        }

        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        try {
            await cargarDatosCalendario();
            mostrarCalendario(citasCalendario);
        } catch (error) {
            console.error("Error abriendo calendario:", error);
            mostrarCalendario(citasCalendario);
        }
    }

    function cerrarCalendario() {
        const modal = document.getElementById("modalCalendario");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }
    }

    async function abrirDetalleCitaCalendario(idCita) {
        try {
            const res = await fetch(`/consultaMedica/api/cita-detalle/${idCita}`, { credentials: "same-origin" });
            if (!res.ok) {
                if (res.status === 403) {
                    mostrarAlerta("error", "No tienes permiso para ver esta cita");
                    return;
                }
                throw new Error("HTTP " + res.status);
            }
            const data = await res.json();
            if (data.success && data.cita) {
                cerrarCalendario();
                setTimeout(() => {
                    cargarConsultaEnModal(idCita);
                }, 300);
            } else {
                mostrarAlerta("error", "No se pudo cargar el detalle de la cita");
            }
        } catch (err) {
            console.error("Error abriendo detalle de cita:", err);
            mostrarAlerta("error", "Error al cargar detalle: " + err.message);
        }
    }

    // ============================================================
    // CITA DIRECTA CON OPCIÓN DE PRECLÍNICA
    // ============================================================

    function abrirModalCitaDirecta() {
        const modal = document.getElementById("modalCitaDirecta");
        if (!modal) {
            console.error('❌ No se encontró el modal de Cita Directa');
            return;
        }
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
        limpiarModalCitaDirecta();

        const usuario = window.user || {};
        const doctores = window.doctoresData || doctoresData || [];
        
        let doctorSeleccionado = null;
        let doctorId = null;
        let doctorNombre = '';

        if (usuario.ID_USUARIO) {
            doctorSeleccionado = doctores.find(d => {
                const idDoctor = d.ID_DOCTOR || d.ID_USUARIO || d.ID_USUARIO_DOCTOR;
                return String(idDoctor) === String(usuario.ID_USUARIO);
            });
            
            if (!doctorSeleccionado) {
                doctorId = usuario.ID_USUARIO;
                doctorNombre = usuario.NOMBRE_USUARIO || usuario.USUARIO || 'Doctor';
            } else {
                doctorId = doctorSeleccionado.ID_DOCTOR || doctorSeleccionado.ID_USUARIO;
                doctorNombre = doctorSeleccionado.NOMBRE || doctorSeleccionado.NOMBRE_USUARIO || 'Doctor';
            }
        }

        const doctorNombreEl = document.getElementById('doctorNombreDirecta');
        const doctorEspecialidadEl = document.getElementById('doctorEspecialidadDirecta');
        const hiddenDoctor = document.getElementById('doctorSeleccionadoDirecta');

        if (doctorId) {
            const especialidad = doctorSeleccionado?.ESPECIALIDAD || 'Medicina General';
            
            if (doctorNombreEl) doctorNombreEl.textContent = `Dr. ${doctorNombre}`;
            if (doctorEspecialidadEl) doctorEspecialidadEl.textContent = `🏥 ${especialidad}`;
            if (hiddenDoctor) hiddenDoctor.value = doctorId;
        } else {
            if (doctorNombreEl) {
                doctorNombreEl.textContent = '⚠️ No se encontró doctor disponible';
                doctorNombreEl.style.color = '#dc3545';
            }
            if (doctorEspecialidadEl) doctorEspecialidadEl.textContent = 'Contacte al administrador';
            mostrarAlerta('error', 'No se pudo identificar al doctor logueado');
        }

        const ahora = new Date();
        const fechaInput = document.getElementById('inputFechaDirecta');
        const horaInput = document.getElementById('inputHoraDirecta');
        if (fechaInput) {
            fechaInput.value = ahora.toISOString().split('T')[0];
        }
        if (horaInput) {
            let hora = ahora.getHours() + 1;
            if (hora > 23) hora = 0;
            horaInput.value = `${String(hora).padStart(2, '0')}:00`;
        }

        setupAutocompletePacientesDirecta();

        // Inicializar opción de preclínica
        actualizarOpcionPreclinica();

        console.log('✅ Modal de Cita Directa abierto');
    }

    function cerrarModalCitaDirecta() {
        const modal = document.getElementById("modalCitaDirecta");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            limpiarModalCitaDirecta();
        }
    }

    function limpiarModalCitaDirecta() {
        const inputs = ['buscarPacienteDirecta', 'inputMotivoDirecta'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        ['pacienteSeleccionadoDirecta', 'doctorSeleccionadoDirecta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        ['pacienteInfoDirecta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });
        document.getElementById('selectTipoCitaDirecta').value = 'CONTROL';
        document.getElementById('selectPrioridadDirecta').value = 'NORMAL';
        document.getElementById('modalErrorCitaDirecta').style.display = 'none';
        document.getElementById('modalErrorCitaDirecta').textContent = '';
        ['pacienteDirecta-error', 'fechaDirecta-error', 'horaDirecta-error'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = ''; el.style.display = 'none'; }
        });
        ['buscarPacienteDirecta', 'inputFechaDirecta', 'inputHoraDirecta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('field-error');
        });
        const doctorNombre = document.getElementById('doctorNombreDirecta');
        if (doctorNombre) doctorNombre.style.color = '#1a3c6e';
        // Resetear opción a "Sí"
        const radioSi = document.getElementById('radioPreclinicaSi');
        if (radioSi) radioSi.checked = true;
        actualizarOpcionPreclinica();
    }

    function setupAutocompletePacientesDirecta() {
        const inputPaciente = document.getElementById('buscarPacienteDirecta');
        const listPaciente = document.getElementById('autocompletePacientesDirecta');
        const hiddenPaciente = document.getElementById('pacienteSeleccionadoDirecta');
        const infoPaciente = document.getElementById('pacienteInfoDirecta');

        if (!inputPaciente || !listPaciente) return;

        const newInput = inputPaciente.cloneNode(true);
        inputPaciente.parentNode.replaceChild(newInput, inputPaciente);

        newInput.addEventListener('input', function() {
            const query = this.value.trim();
            if (query.length === 0) {
                listPaciente.style.display = 'none';
                if (hiddenPaciente) hiddenPaciente.value = '';
                if (infoPaciente) infoPaciente.textContent = '';
                return;
            }

            const q = query.toLowerCase();
            const pacientes = window.pacientesData || pacientesData || [];
            const resultados = pacientes.filter(p => {
                const nombre = (p.NOMBRES || '').toLowerCase();
                const apellidos = (p.APELLIDOS || '').toLowerCase();
                const telefono = (p.TELEFONO || '').toLowerCase();
                const identidad = (p.NUMERO_DOCUMENTO_IDENTIDAD || '').toLowerCase();
                const nombreCompleto = `${nombre} ${apellidos}`;
                return nombreCompleto.includes(q) || telefono.includes(q) || identidad.includes(q);
            }).slice(0, 10);

            if (resultados.length === 0) {
                listPaciente.innerHTML = `<div class="autocomplete-item no-results">No se encontraron pacientes</div>`;
                listPaciente.style.display = 'block';
                return;
            }

            listPaciente.innerHTML = resultados.map(p => {
                const nombreCompleto = `${p.NOMBRES || ''} ${p.APELLIDOS || ''}`.trim();
                return `
                    <div class="autocomplete-item" 
                         data-id="${p.ID_PACIENTE}" 
                         data-nombre="${escapeHtml(nombreCompleto)}" 
                         data-telefono="${p.TELEFONO || ''}" 
                         data-correo="${p.CORREO_ELECTRONICO || ''}" 
                         data-identidad="${p.NUMERO_DOCUMENTO_IDENTIDAD || ''}">
                        <strong>${escapeHtml(nombreCompleto)}</strong>
                        <span class="sub-info">${p.TELEFONO ? `📱 ${escapeHtml(p.TELEFONO)}` : ''} ${p.NUMERO_DOCUMENTO_IDENTIDAD ? `🆔 ${escapeHtml(p.NUMERO_DOCUMENTO_IDENTIDAD)}` : ''}</span>
                    </div>
                `;
            }).join('');

            listPaciente.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', function() {
                    const id = this.dataset.id;
                    const nombre = this.dataset.nombre;
                    const telefono = this.dataset.telefono;
                    const correo = this.dataset.correo;
                    const identidad = this.dataset.identidad;
                    
                    const input = document.getElementById('buscarPacienteDirecta');
                    const hidden = document.getElementById('pacienteSeleccionadoDirecta');
                    const info = document.getElementById('pacienteInfoDirecta');
                    
                    if (input) input.value = nombre;
                    if (hidden) hidden.value = id;
                    if (info) {
                        let infoText = [];
                        if (telefono) infoText.push(`📱 ${telefono}`);
                        if (correo) infoText.push(`📧 ${correo}`);
                        if (identidad) infoText.push(`🆔 ${identidad}`);
                        info.textContent = infoText.join(' · ');
                        info.style.color = '#28a745';
                        info.style.fontWeight = 'bold';
                    }
                    listPaciente.style.display = 'none';
                    
                    const errorEl = document.getElementById('pacienteDirecta-error');
                    if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
                    
                    console.log('✅ Paciente seleccionado:', { id, nombre });
                });
            });
            listPaciente.style.display = 'block';
        });

        newInput.addEventListener('blur', function() {
            setTimeout(() => { listPaciente.style.display = 'none'; }, 300);
        });

        console.log('✅ Autocompletado de pacientes configurado');
    }

    // ============================================================
    // OPCIÓN DE PRECLÍNICA - ACTUALIZAR UI
    // ============================================================
    function actualizarOpcionPreclinica() {
        const radioSi = document.getElementById('radioPreclinicaSi');
        const radioNo = document.getElementById('radioPreclinicaNo');
        const mensaje = document.getElementById('mensajePreclinica');
        const labelSi = document.getElementById('labelPreclinicaSi');
        const labelNo = document.getElementById('labelPreclinicaNo');
        const container = document.getElementById('mensajePreclinicaContainer');
        const notaEstado = document.getElementById('notaEstadoCita');
        
        if (!radioSi || !radioNo) return;
        
        if (radioSi.checked) {
            // Opción: Sí, pasar por preclínica
            if (mensaje) {
                mensaje.textContent = 'El paciente pasará por enfermería para toma de signos vitales antes de la consulta médica.';
                mensaje.style.color = '#856404';
            }
            if (container) {
                container.style.borderLeftColor = '#ffc107';
                container.style.background = '#fffdf0';
            }
            if (labelSi) labelSi.classList.add('active');
            if (labelNo) labelNo.classList.remove('active');
            if (notaEstado) {
                notaEstado.innerHTML = 'Esta cita se registrará en estado <span class="badge bg-warning text-dark">PRECLINICA</span>';
            }
        } else {
            // Opción: No, atender directamente
            if (mensaje) {
                mensaje.textContent = 'El paciente será atendido directamente por el doctor sin pasar por preclínica.';
                mensaje.style.color = '#155724';
            }
            if (container) {
                container.style.borderLeftColor = '#28a745';
                container.style.background = '#f0fff4';
            }
            if (labelNo) labelNo.classList.add('active');
            if (labelSi) labelSi.classList.remove('active');
            if (notaEstado) {
                notaEstado.innerHTML = 'Esta cita se registrará en estado <span class="badge bg-success">CONSULTA MEDICA</span>';
            }
        }
    }

    // ============================================================
    // GUARDAR CITA DIRECTA CON OPCIÓN DE PRECLÍNICA
    // ============================================================
    async function guardarCitaDirecta() {
        const btn = document.getElementById('btnGuardarCitaDirecta');
        if (btn) btn.disabled = true;

        try {
            const inputPaciente = document.getElementById('buscarPacienteDirecta');
            const hiddenPaciente = document.getElementById('pacienteSeleccionadoDirecta');
            const hiddenDoctor = document.getElementById('doctorSeleccionadoDirecta');
            const fecha = document.getElementById('inputFechaDirecta')?.value;
            const hora = document.getElementById('inputHoraDirecta')?.value;
            const tipoCita = document.getElementById('selectTipoCitaDirecta')?.value || 'CONTROL';
            const prioridad = document.getElementById('selectPrioridadDirecta')?.value || 'NORMAL';
            const motivo = document.getElementById('inputMotivoDirecta')?.value || null;
            
            // ✅ OBTENER OPCIÓN DE PRECLÍNICA
            const necesitaPreclinica = document.getElementById('radioPreclinicaSi')?.checked || false;
            // Si necesita preclínica → PRECLINICA, si no → CONSULTA_MEDICA
            const estadoInicial = necesitaPreclinica ? 'PRECLINICA' : 'CONSULTA_MEDICA';

            let pacienteId = hiddenPaciente?.value || null;
            let doctorId = hiddenDoctor?.value || null;

            if (!doctorId) {
                const usuario = window.user || {};
                if (usuario.ID_USUARIO) {
                    doctorId = usuario.ID_USUARIO;
                    if (hiddenDoctor) hiddenDoctor.value = doctorId;
                }
            }

            if (!pacienteId && inputPaciente && inputPaciente.value.trim() !== '') {
                const nombreBuscado = inputPaciente.value.trim();
                const pacientes = window.pacientesData || pacientesData || [];
                const encontrado = pacientes.find(p => {
                    const nombreCompleto = `${p.NOMBRES || ''} ${p.APELLIDOS || ''}`.trim();
                    return nombreCompleto.toLowerCase() === nombreBuscado.toLowerCase() ||
                           `${p.NOMBRES || ''}`.toLowerCase() === nombreBuscado.toLowerCase();
                });
                if (encontrado) {
                    pacienteId = encontrado.ID_PACIENTE;
                    if (hiddenPaciente) hiddenPaciente.value = pacienteId;
                }
            }

            // Limpiar errores
            ['pacienteDirecta-error', 'fechaDirecta-error', 'horaDirecta-error'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.textContent = ''; el.style.display = 'none'; }
            });
            ['buscarPacienteDirecta', 'inputFechaDirecta', 'inputHoraDirecta'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('field-error');
            });

            let errors = [];

            if (!pacienteId) {
                errors.push({ field: 'buscarPacienteDirecta', msg: 'Seleccione un paciente de la lista' });
                const el = document.getElementById('buscarPacienteDirecta');
                if (el) el.classList.add('field-error');
            }

            if (!doctorId) {
                errors.push({ field: 'doctorDirecta-error', msg: 'No se pudo identificar al doctor logueado' });
            }

            if (!fecha) {
                errors.push({ field: 'inputFechaDirecta', msg: 'Seleccione una fecha' });
                const el = document.getElementById('inputFechaDirecta');
                if (el) el.classList.add('field-error');
            }

            if (!hora) {
                errors.push({ field: 'inputHoraDirecta', msg: 'Seleccione una hora' });
                const el = document.getElementById('inputHoraDirecta');
                if (el) el.classList.add('field-error');
            }

            if (errors.length > 0) {
                errors.forEach(e => {
                    const errEl = document.getElementById(e.field + '-error');
                    if (errEl) { errEl.textContent = e.msg; errEl.style.display = 'block'; }
                });
                const errorContainer = document.getElementById('modalErrorCitaDirecta');
                if (errorContainer) {
                    errorContainer.textContent = errors.map(e => e.msg).join('. ');
                    errorContainer.style.display = 'block';
                }
                if (btn) btn.disabled = false;
                return;
            }

            const fechaHora = new Date(`${fecha}T${hora}:00`);
            const ahora = new Date();
            if (fechaHora <= ahora) {
                const errorContainer = document.getElementById('modalErrorCitaDirecta');
                if (errorContainer) {
                    errorContainer.textContent = 'La fecha y hora deben ser posteriores al momento actual.';
                    errorContainer.style.display = 'block';
                }
                if (btn) btn.disabled = false;
                return;
            }

            const pad = (n) => String(n).padStart(2, '0');
            const fechaFormateada = `${fechaHora.getFullYear()}-${pad(fechaHora.getMonth() + 1)}-${pad(fechaHora.getDate())} ${pad(fechaHora.getHours())}:${pad(fechaHora.getMinutes())}:${pad(fechaHora.getSeconds())}`;

            // ✅ PAYLOAD CON ESTADO DINÁMICO (PRECLINICA o CONSULTA_MEDICA)
            const payload = {
                paciente: parseInt(pacienteId),
                doctor: parseInt(doctorId),
                fechaCita: fechaFormateada,
                tipoCita: tipoCita,
                prioridad: prioridad,
                motivo: motivo,
                duracion: 30,
                canal: 'PRESENCIAL',
                estado: estadoInicial
            };

            console.log('📋 Payload enviado a /citas/nueva:', payload);

            const response = await fetch('/citas/nueva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                const errorContainer = document.getElementById('modalErrorCitaDirecta');
                if (errorContainer) {
                    errorContainer.textContent = data.message || 'Error al crear la cita';
                    errorContainer.style.display = 'block';
                }
                if (btn) btn.disabled = false;
                return;
            }

            const mensajeEstado = necesitaPreclinica ? 
                '✅ Cita creada. El paciente debe pasar por preclínica (enfermería) antes de la consulta.' : 
                '✅ Cita creada. El paciente puede ser atendido directamente por el doctor.';
            
            mostrarAlerta('success', data.message || 'Cita creada correctamente');
            cerrarModalCitaDirecta();
            await cargarDatos();

            setTimeout(() => {
                mostrarAlerta('info', mensajeEstado);
            }, 500);

        } catch (error) {
            console.error('Error guardando cita:', error);
            const errorContainer = document.getElementById('modalErrorCitaDirecta');
            if (errorContainer) {
                errorContainer.textContent = 'Error de conexión: ' + error.message;
                errorContainer.style.display = 'block';
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    document.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button");
        if (!btn) return;

        const action = btn.dataset.action || "";
        const id = btn.dataset.id;

        if (action === "abrirConsulta" || action === "editarConsulta") {
            ev.preventDefault();
            if (id) cargarConsultaEnModal(id);
            return;
        }

        if (action === "cancelar") {
            ev.preventDefault();
            if (!id) return;
            if (!confirm("¿Cancelar la cita?")) return;
            cambiarEstado(id, "CANCELADA");
            return;
        }

        if (action === "no_asistio") {
            ev.preventDefault();
            if (!id) return;
            if (!confirm("¿Marcar como NO ASISTIÓ?")) return;
            cambiarEstado(id, "NO_ASISTIO");
            return;
        }

        if (btn.id === "btnNuevaConsulta" || btn.id === "btnCrearPrimeraConsulta") {
            ev.preventDefault();
            abrirModalConsulta();
            return;
        }

        if (btn.id === "btnCerrarModalConsulta" || btn.id === "btnCancelarConsulta") {
            ev.preventDefault();
            cerrarModalConsulta();
            return;
        }

        if (btn.id === "btnGuardarConsulta") {
            ev.preventDefault();
            guardarConsultaHandler();
            return;
        }

        if (btn.id === "btnImprimir") {
            ev.preventDefault();
            imprimirListadoConsulta();
            return;
        }

        if (btn.id === "btnImprimirConsulta") {
            ev.preventDefault();
            imprimirConsulta();
            return;
        }

        if (btn.id === "btnExcelConsulta") {
            ev.preventDefault();
            exportarExcelConsulta();
            return;
        }

        if (btn.id === "btnDashboard") {
            ev.preventDefault();
            window.location.href = '/dashboard';
            return;
        }

        if (btn.id === "btnLimpiarFiltros") {
            ev.preventDefault();
            limpiarFiltros();
            return;
        }

        if (btn.id === "btnCalendario") {
            ev.preventDefault();
            abrirCalendario();
            return;
        }

        if (btn.id === "btnCerrarCalendario" || btn.id === "btnCerrarCalendarioFooter") {
            ev.preventDefault();
            cerrarCalendario();
            return;
        }

        if (btn.id === "prev-month") {
            ev.preventDefault();
            mesCalendarioActual--;
            if (mesCalendarioActual < 0) {
                mesCalendarioActual = 11;
                anioCalendarioActual--;
            }
            mostrarCalendario(citasCalendario);
            return;
        }

        if (btn.id === "next-month") {
            ev.preventDefault();
            mesCalendarioActual++;
            if (mesCalendarioActual > 11) {
                mesCalendarioActual = 0;
                anioCalendarioActual++;
            }
            mostrarCalendario(citasCalendario);
            return;
        }

        if (btn.id === "btnCitaDirecta") {
            ev.preventDefault();
            abrirModalCitaDirecta();
            return;
        }

        if (btn.id === "btnCerrarCitaDirecta" || btn.id === "btnCancelarCitaDirecta") {
            ev.preventDefault();
            cerrarModalCitaDirecta();
            return;
        }

        if (btn.id === "btnGuardarCitaDirecta") {
            ev.preventDefault();
            guardarCitaDirecta();
            return;
        }
    });

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================
    document.addEventListener("DOMContentLoaded", () => {
        const botones = [
            "btnNuevaConsulta", "btnCancelarConsulta", "btnCerrarModalConsulta",
            "btnGuardarConsulta", "btnImprimir", "btnExcelConsulta",
            "btnDashboard", "btnLimpiarFiltros", "btnCalendario",
            "btnCerrarCalendario", "btnCerrarCalendarioFooter",
            "prev-month", "next-month", "btnImprimirConsulta",
            "btnVerHistorialCompleto", "btnCitaDirecta",
            "btnCerrarCitaDirecta", "btnCancelarCitaDirecta", "btnGuardarCitaDirecta"
        ];
        botones.forEach(id => {
            const el = $(id);
            if (el && el.tagName === "BUTTON") el.type = "button";
        });

        const logoBtn = $("logoBtn");
        if (logoBtn) {
            logoBtn.addEventListener("click", e => {
                e.preventDefault();
                window.location.href = "/dashboard";
            });
        }

        const selectCita = $("selectCitaConsulta");
        if (selectCita) {
            selectCita.addEventListener("change", onSelectCitaChange);
        }

        // ✅ EVENTOS PARA OPCIÓN DE PRECLÍNICA
        const radioSi = document.getElementById('radioPreclinicaSi');
        const radioNo = document.getElementById('radioPreclinicaNo');
        
        if (radioSi) {
            radioSi.addEventListener('change', function() {
                if (this.checked) actualizarOpcionPreclinica();
            });
        }
        if (radioNo) {
            radioNo.addEventListener('change', function() {
                if (this.checked) actualizarOpcionPreclinica();
            });
        }

        document.addEventListener("click", (e) => {
            const modal = $("modalConsulta");
            if (modal && e.target === modal) {
                cerrarModalConsulta();
            }
            const modalCalendario = document.getElementById("modalCalendario");
            if (modalCalendario && e.target === modalCalendario) {
                cerrarCalendario();
            }
            const modalCitaDirecta = document.getElementById("modalCitaDirecta");
            if (modalCitaDirecta && e.target === modalCitaDirecta) {
                cerrarModalCitaDirecta();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                cerrarModalConsulta();
                cerrarCalendario();
                cerrarModalCitaDirecta();
            }
        });

        setupFiltros();
        cargarDatos();

        try {
            const bc = new BroadcastChannel("citas_channel");
            bc.onmessage = (ev) => {
                const data = ev.data || {};
                if (data.type === "estado_cita" || data.type === "preclinica_saved" || data.type === "consulta_saved") {
                    cargarDatos();
                }
            };
        } catch (e) { /* ignorar */ }

        window.cargarDatos = cargarDatos;
        window.imprimirListadoConsulta = imprimirListadoConsulta;
        window.exportarExcelConsulta = exportarExcelConsulta;
        window.limpiarFiltrosConsulta = limpiarFiltros;
        window.abrirCalendario = abrirCalendario;
        window.cerrarCalendario = cerrarCalendario;
        window.imprimirConsulta = imprimirConsulta;
        window.abrirHistorialCompleto = abrirHistorialCompleto;
        window.abrirModalCitaDirecta = abrirModalCitaDirecta;
        window.cerrarModalCitaDirecta = cerrarModalCitaDirecta;
        window.guardarCitaDirecta = guardarCitaDirecta;
        window.actualizarOpcionPreclinica = actualizarOpcionPreclinica;

        console.log(' consultaMedica.js cargado correctamente');
        console.log(' Usuario:', window.user);
        console.log(' Rol:', window.rol);
        console.log(' Calendario de consultas médicas disponible');
        console.log('Impresión de consultas disponible');
        console.log(' Historial rápido disponible');
        console.log(' Cita Directa con opción de preclínica disponible');
    });

})();