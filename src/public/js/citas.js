// public/js/citas.js
// Gestión de citas médicas + vista calendario

(function() {
    let citasData = [];
    let doctoresData = [];
    let pacientesData = [];
    let processingCitas = new Set();
    let submitInProgress = false;
    let editSubmitInProgress = false;

    let fechaActual = new Date();
    let mesCalendarioActual = fechaActual.getMonth();
    let anioCalendarioActual = fechaActual.getFullYear();
    const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    let metadata = { tipos: [], prioridades: [], canales: [], duraciones: [] };
    let vistaCitasActual = "tabla";
    let datosFiltrados = [];
    let fechaCalendarioSeleccionada = null;

    const $ = id => document.getElementById(id);

    function escapeHtml(s) {
        if (s === undefined || s === null) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function debounce(fn, wait = 300) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => {
                fn(...args);
            }, wait);
        };
    }

    async function imageToBase64(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function normalizarFecha(fecha) {
        if (!fecha) return null;
        let fechaObj;
        if (fecha instanceof Date) {
            fechaObj = new Date(fecha);
        } else if (typeof fecha === 'string') {
            if (fecha.includes('/') || fecha.includes('-')) {
                const partes = fecha.split(/[\/\-]/);
                if (partes.length === 3) {
                    if (partes[0].length === 4) {
                        fechaObj = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
                    } else {
                        fechaObj = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
                    }
                } else {
                    fechaObj = new Date(fecha);
                }
            } else {
                fechaObj = new Date(fecha);
            }
        } else {
            return null;
        }
        if (isNaN(fechaObj.getTime())) return null;
        fechaObj.setHours(0, 0, 0, 0);
        return fechaObj;
    }

    function ordenarAlfabeticamente(arr, campo) {
        return [...arr].sort((a, b) => {
            const valA = (a[campo] || '').toLowerCase();
            const valB = (b[campo] || '').toLowerCase();
            return valA.localeCompare(valB);
        });
    }

    async function cargarDatosReales(force = false) {
        try {
            const res = await fetch("/citas/api/datos", {
                credentials: "same-origin",
                cache: force ? "no-store" : "default"
            });

            if (!res.ok) throw new Error("HTTP " + res.status);

            const json = await res.json();

            citasData = json.citas || [];
            doctoresData = ordenarAlfabeticamente(json.doctores || [], 'NOMBRE');
            pacientesData = ordenarAlfabeticamente(json.pacientes || [], 'NOMBRES');
            metadata = json.metadata || metadata;

            llenarFiltroDoctores();
            llenarMetadataSelects();
            llenarFiltroEstados();

            aplicarFiltros();

        } catch (err) {
            console.error("Error cargando datos:", err);
            mostrarMensaje("error", "Error cargando datos: " + err.message);
        }
    }

    function llenarFiltroDoctores(filter = "") {
        const sel = $("filtroDoctor");
        if (!sel) return;

        sel.innerHTML = '<option value="">Todos los doctores</option>';
        const q = String(filter || "").trim().toLowerCase();

        doctoresData.forEach(d => {
            const label = `Dr. ${d.NOMBRE} - ${d.ESPECIALIDAD || ""}`;
            if (q && !label.toLowerCase().includes(q)) return;

            const opt = document.createElement("option");
            opt.value = d.ID_DOCTOR;
            opt.textContent = label;
            sel.appendChild(opt);
        });
    }

    function llenarFiltroEstados() {
        const sel = $("filtroEstado");
        if (!sel) return;

        const estados = new Set();
        citasData.forEach(c => {
            if (c.ESTADO) estados.add(c.ESTADO);
        });

        sel.innerHTML = '<option value="">Todos los estados</option>';
        const estadosOrdenados = ["PROGRAMADA", "CONFIRMADA", "PRECLINICA", "CONSULTA_MEDICA", "FINALIZADA", "NO_ASISTIO", "CANCELADA"];
        
        estadosOrdenados.forEach(e => {
            if (estados.has(e)) {
                const opt = document.createElement("option");
                opt.value = e;
                opt.textContent = formatLabel(e);
                sel.appendChild(opt);
            }
        });
    }

    function llenarMetadataSelects() {
        const selects = [
            { sel: $("selectTipoCita"), items: metadata.tipos, label: "Seleccionar tipo..." },
            { sel: $("selectPrioridad"), items: metadata.prioridades, label: "Seleccionar prioridad..." },
            { sel: $("selectCanal"), items: metadata.canales, label: "Seleccionar canal..." },
            { sel: $("editSelectTipoCita"), items: metadata.tipos, label: "Seleccionar tipo..." },
            { sel: $("editSelectPrioridad"), items: metadata.prioridades, label: "Seleccionar prioridad..." },
            { sel: $("editSelectCanal"), items: metadata.canales, label: "Seleccionar canal..." }
        ];

        selects.forEach(({ sel, items, label }) => {
            if (!sel) return;
            sel.innerHTML = `<option value="">${label}</option>`;
            if (items && items.length > 0) {
                items.forEach(item => {
                    const option = new Option(formatLabel(item), item);
                    sel.appendChild(option);
                });
            }
        });

        // Duraciones
        const duraciones = $("selectDuracion");
        const editDuraciones = $("editSelectDuracion");
        const duracionOptions = metadata.duraciones && metadata.duraciones.length > 0 ? metadata.duraciones : [15, 20, 30, 45, 60];
        
        [duraciones, editDuraciones].forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            duracionOptions.forEach(d => {
                const option = new Option(String(d) + " minutos", d);
                if (d === 30) option.selected = true;
                sel.appendChild(option);
            });
        });
    }

    function formatLabel(key) {
        return String(key).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }

    function aplicarFiltros() {
        const estado = $("filtroEstado")?.value || "";
        const doctor = $("filtroDoctor")?.value || "";
        const fechaDesde = $("filtroFechaDesde")?.value || "";
        const fechaHasta = $("filtroFechaHasta")?.value || "";
        const busqueda = $("filtroBusqueda")?.value?.toLowerCase().trim() || "";
        
        let lista = [...citasData];
        
        if (estado) {
            lista = lista.filter(c => String(c.ESTADO || "").toUpperCase() === estado.toUpperCase());
        }
        if (doctor) {
            lista = lista.filter(c => String(c.ID_DOCTOR || c.id_doctor || "").toString() === doctor);
        }
        if (fechaDesde) {
            const fechaDesdeObj = normalizarFecha(fechaDesde);
            if (fechaDesdeObj) {
                lista = lista.filter(c => {
                    const fechaCitaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
                    const fechaCita = normalizarFecha(fechaCitaStr);
                    if (!fechaCita) return false;
                    return fechaCita.getTime() >= fechaDesdeObj.getTime();
                });
            }
        }
        if (fechaHasta) {
            const fechaHastaObj = normalizarFecha(fechaHasta);
            if (fechaHastaObj) {
                lista = lista.filter(c => {
                    const fechaCitaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
                    const fechaCita = normalizarFecha(fechaCitaStr);
                    if (!fechaCita) return false;
                    return fechaCita.getTime() <= fechaHastaObj.getTime();
                });
            }
        }
        if (busqueda) {
            lista = lista.filter(c => {
                const nombrePaciente = (c.NOMBRE_PACIENTE || c.paciente_nombre || c.PACIENTE_NOMBRE || c.NOMBRE || "").toLowerCase();
                const apellidosPaciente = (c.APELLIDOS_PACIENTE || c.paciente_apellidos || c.PACIENTE_APELLIDOS || c.APELLIDOS || "").toLowerCase();
                const nombreDoctor = (c.NOMBRE_DOCTOR || c.doctor_nombre || c.DOCTOR_NOMBRE || c.DOCTOR || "").toLowerCase();
                const telefono = (c.TELEFONO_PACIENTE || c.telefono_paciente || c.TELEFONO || c.telefono || "").toLowerCase();
                const estadoCita = (c.ESTADO || c.estado || "").toLowerCase();
                const identidad = (c.IDENTIDAD_PACIENTE || c.identidad_paciente || c.IDENTIDAD || c.identidad || "").toLowerCase();
                const nombreCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim();
                return nombreCompleto.includes(busqueda) || nombrePaciente.includes(busqueda) || apellidosPaciente.includes(busqueda) || nombreDoctor.includes(busqueda) || telefono.includes(busqueda) || estadoCita.includes(busqueda) || identidad.includes(busqueda);
            });
        }
        
        datosFiltrados = lista;
        
        if (vistaCitasActual === "tabla") {
            mostrarCitas(lista);
        } else {
            mostrarCalendario(lista);
        }
        
        if (lista.length === 0 && citasData.length > 0) {
            mostrarMensaje("info", "No se encontraron citas con los filtros aplicados");
        }
    }

    function mostrarCitas(list) {
        const target = $("tablaContenido");
        if (!target) return;

        const listaMostrar = list || [];

        if (listaMostrar.length === 0) {
            target.innerHTML = `
                <div class="ctsin-citas">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No hay citas</h3>
                    <p>${citasData.length > 0 ? 'No hay citas que coincidan con los filtros aplicados.' : 'Comienza creando una nueva cita médica.'}</p>
                    ${citasData.length === 0 ? `<button class="ctbtn-primary" id="btnCrearPrimera"><i class="fas fa-plus"></i> Crear Primera Cita</button>` : ''}
                </div>
            `;
            return;
        }

        let html = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Paciente</th>
                        <th>Doctor</th>
                        <th>Fecha y Hora</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        listaMostrar.forEach(c => {
            const fechaStr = c.FECHA_CITA || c.fecha_cita || c.FECHA || c.fecha;
            let fecha, hora;
            try {
                const fechaObj = new Date(fechaStr);
                if (!isNaN(fechaObj.getTime())) {
                    fecha = fechaObj.toLocaleDateString("es-ES");
                    hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || fechaObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                } else {
                    fecha = "Fecha no disponible";
                    hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || "";
                }
            } catch (e) {
                fecha = "Fecha no disponible";
                hora = c.HORA_CITA || c.hora_cita || c.HORA || c.hora || "";
            }

            const nombrePaciente = c.NOMBRE_PACIENTE || c.paciente_nombre || c.PACIENTE_NOMBRE || c.NOMBRE || "";
            const apellidosPaciente = c.APELLIDOS_PACIENTE || c.paciente_apellidos || c.PACIENTE_APELLIDOS || c.APELLIDOS || "";
            const nombreCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim() || nombrePaciente;
            const nombreDoctor = c.NOMBRE_DOCTOR || c.doctor_nombre || c.DOCTOR_NOMBRE || c.DOCTOR || "";
            const telefonoPaciente = c.TELEFONO_PACIENTE || c.telefono_paciente || c.TELEFONO || c.telefono || "";
            const estadoCita = c.ESTADO || c.estado || "";
            const idCita = c.ID_CITA || c.id_cita || c.id;

            html += `
                <tr>
                    <td>
                        <strong>${escapeHtml(nombreCompleto)}</strong><br>
                        <small>${escapeHtml(telefonoPaciente)}</small>
                    </td>
                    <td>Dr. ${escapeHtml(nombreDoctor)}</td>
                    <td>
                        <strong>${fecha}</strong><br>
                        <small>${hora}</small>
                    </td>
                    <td><span class="ctestado-badge estado-${String(estadoCita).toLowerCase()}">${escapeHtml(estadoCita)}</span></td>
                    <td>
                        <div class="ctacciones-cita">
                            <button class="btn-editar-cita" data-action="editar" data-id="${idCita}" title="Editar cita">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${generarBotonesEstado(c)}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        target.innerHTML = html;
    }

    function mostrarCalendario(lista = []) {
        const dias = document.getElementById("calendar-days");
        const titulo = document.getElementById("calendar-month-year");

        if (!dias || !titulo) return;

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
            numero.textContent = dia;
            celda.appendChild(numero);

            const citasDia = lista.filter(cita => {
                const fechaStr = cita.FECHA_CITA || cita.fecha_cita || cita.FECHA || cita.fecha;
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
                badge.className = "cita-badge editable";
                const horaCita = cita.HORA_CITA || cita.hora_cita || cita.HORA || cita.hora || "";
                const nombrePaciente = cita.NOMBRE_PACIENTE || cita.paciente_nombre || cita.PACIENTE_NOMBRE || cita.NOMBRE || "";
                const apellidosPaciente = cita.APELLIDOS_PACIENTE || cita.paciente_apellidos || cita.PACIENTE_APELLIDOS || cita.APELLIDOS || "";
                const nombreCompleto = `${nombrePaciente} ${apellidosPaciente}`.trim() || nombrePaciente;
                const idCita = cita.ID_CITA || cita.id_cita || cita.id;
                badge.innerHTML = `<strong>${horaCita}</strong><br>${escapeHtml(nombreCompleto)}`;
                badge.dataset.id = idCita;

                const estadoCita = cita.ESTADO || cita.estado || "";
                switch (estadoCita.toUpperCase()) {
                    case "PROGRAMADA": badge.style.background = "#0d6efd"; break;
                    case "CONFIRMADA": badge.style.background = "#198754"; break;
                    case "FINALIZADA": badge.style.background = "#6c757d"; break;
                    case "CANCELADA": badge.style.background = "#dc3545"; break;
                    case "NO_ASISTIO": badge.style.background = "#fd7e14"; break;
                    default: badge.style.background = "#0d6efd";
                }
                badge.style.color = "#fff";
                badge.style.fontSize = "11px";
                badge.style.padding = "2px 4px";
                badge.style.marginTop = "3px";
                badge.style.borderRadius = "4px";
                badge.style.cursor = "pointer";
                badge.style.overflow = "hidden";
                badge.style.whiteSpace = "nowrap";
                badge.style.textOverflow = "ellipsis";

                badge.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const id = badge.dataset.id;
                    if (id) {
                        cerrarCalendario();
                        setTimeout(() => editarCitaPorId(id), 300);
                    }
                });

                celda.appendChild(badge);
            });

            const btnAdd = document.createElement("button");
            btnAdd.className = "add-cita-quick";
            btnAdd.innerHTML = "+";
            btnAdd.title = "Agregar cita en este día";
            btnAdd.addEventListener("click", (e) => {
                e.stopPropagation();
                const fechaStr = `${anioCalendarioActual}-${String(mesCalendarioActual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                fechaCalendarioSeleccionada = fechaStr;
                cerrarCalendario();
                setTimeout(() => abrirModalNuevaCitaConFecha(fechaStr), 300);
            });
            celda.appendChild(btnAdd);

            dias.appendChild(celda);
        }
    }

    function generarBotonesEstado(c) {
        const id = c.ID_CITA || c.id_cita || c.id;
        const estado = String(c.ESTADO || c.estado || "").toUpperCase();

        if (estado === "FINALIZADA") return `<span class="badge bg-success">FINALIZADA</span>`;
        if (estado === "CANCELADA") return `<span class="badge bg-danger">CANCELADA</span>`;
        if (estado === "NO_ASISTIO") return `<span class="badge bg-warning text-dark">NO ASISTIÓ</span>`;

        const botones = [];
        switch (estado) {
            case "PROGRAMADA":
                botones.push(`<button class="ctbtn-accion ctbtn-confirmar" data-action="confirmar" data-id="${id}"><i class="fas fa-check"></i> Confirmar</button>`);
                botones.push(`<button class="ctbtn-accion ctbtn-cancelar" data-action="cancelar" data-id="${id}"><i class="fas fa-times"></i> Cancelar</button>`);
                botones.push(`<button class="ctbtn-accion ctbtn-no-asistio" data-action="no_asistio" data-id="${id}"><i class="fas fa-user-times"></i> No Asistió</button>`);
                break;
            case "CONFIRMADA":
                botones.push(`<button class="ctbtn-accion ctbtn-preclinica" data-action="preclinica" data-id="${id}"><i class="fas fa-stethoscope"></i> Preclínica</button>`);
                botones.push(`<button class="ctbtn-accion ctbtn-cancelar" data-action="cancelar" data-id="${id}"><i class="fas fa-times"></i> Cancelar</button>`);
                botones.push(`<button class="ctbtn-accion ctbtn-no-asistio" data-action="no_asistio" data-id="${id}"><i class="fas fa-user-times"></i> No Asistió</button>`);
                break;
            default:
                botones.push(`<button class="ctbtn-accion ctbtn-cancelar" data-action="cancelar" data-id="${id}"><i class="fas fa-times"></i> Cancelar</button>`);
                botones.push(`<button class="ctbtn-accion ctbtn-no-asistio" data-action="no_asistio" data-id="${id}"><i class="fas fa-user-times"></i> No Asistió</button>`);
                break;
        }
        return botones.join("");
    }

    async function tablaClickHandler(e) {
        const btn = e.target.closest(".ctbtn-accion");
        if (btn) {
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (!action || !id) return;

            if (processingCitas.has(id)) {
                console.warn("La cita ya está siendo procesada");
                return;
            }

            const estados = {
                confirmar: "CONFIRMADA",
                cancelar: "CANCELADA",
                no_asistio: "NO_ASISTIO",
                preclinica: "PRECLINICA",
                consulta: "CONSULTA_MEDICA",
                finalizar: "FINALIZADA"
            };

            const nuevoEstado = estados[action];
            if (!nuevoEstado) return;

            const nombres = {
                CONFIRMADA: "Confirmada",
                CANCELADA: "Cancelada",
                NO_ASISTIO: "No asistió",
                PRECLINICA: "Preclínica",
                CONSULTA_MEDICA: "Consulta médica",
                FINALIZADA: "Finalizada"
            };

            if (!confirm(`¿Desea cambiar el estado de la cita a ${nombres[nuevoEstado]}?`)) return;

            processingCitas.add(id);
            try {
                btn.disabled = true;
                await cambiarEstadoCita(id, nuevoEstado);
            } finally {
                btn.disabled = false;
                setTimeout(() => processingCitas.delete(id), 300);
            }
            return;
        }

        const editBtn = e.target.closest(".btn-editar-cita");
        if (editBtn) {
            const id = editBtn.dataset.id;
            if (id) {
                editarCitaPorId(id);
            }
        }
    }

    async function cambiarEstadoCita(idCita, nuevoEstado) {
        try {
            const respuesta = await fetch("/citas/cambiar-estado", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ idCita: Number(idCita), nuevoEstado })
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                mostrarMensaje("error", data.message || "No se pudo actualizar la cita");
                return;
            }

            citasData = citasData.map(c => {
                const id = c.ID_CITA || c.id_cita || c.id;
                if (String(id) === String(idCita)) {
                    return { ...c, ESTADO: nuevoEstado };
                }
                return c;
            });

            await cargarDatosReales(true);
            mostrarMensaje("success", data.message || "Estado actualizado correctamente");
        } catch (error) {
            console.error(error);
            mostrarMensaje("error", "Error de conexión");
        }
    }

    // ==================== AUTOCOMPLETADO ====================

    function setupAutocompletePacientes(inputId, listId, hiddenId, infoId, isEdit = false) {
        const input = $(inputId);
        const list = $(listId);
        const hidden = $(hiddenId);
        const info = $(infoId);
        
        if (!input || !list) return;

        let currentFocus = -1;

        input.addEventListener('input', function() {
            const query = this.value.trim();
            const pacientes = pacientesData;
            
            if (query.length === 0) {
                list.classList.remove('show');
                list.innerHTML = '';
                if (hidden) hidden.value = '';
                if (info) info.textContent = '';
                return;
            }

            const q = query.toLowerCase();
            const resultados = pacientes.filter(p => {
                const nombre = (p.NOMBRES || '').toLowerCase();
                const apellidos = (p.APELLIDOS || '').toLowerCase();
                const telefono = (p.TELEFONO || '').toLowerCase();
                const identidad = (p.NUMERO_DOCUMENTO_IDENTIDAD || '').toLowerCase();
                const nombreCompleto = `${nombre} ${apellidos}`;
                return nombreCompleto.includes(q) || telefono.includes(q) || identidad.includes(q);
            });

            if (resultados.length === 0) {
                list.innerHTML = `<div class="autocomplete-item no-results">No se encontraron pacientes</div>`;
                list.classList.add('show');
                return;
            }

            const mostrar = resultados.slice(0, 10);
            
            list.innerHTML = '';
            mostrar.forEach((p, index) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                const nombre = `${p.NOMBRES} ${p.APELLIDOS}`;
                const infoText = [];
                if (p.TELEFONO) infoText.push(`📱 ${p.TELEFONO}`);
                if (p.NUMERO_DOCUMENTO_IDENTIDAD) infoText.push(`🆔 ${p.NUMERO_DOCUMENTO_IDENTIDAD}`);
                
                div.innerHTML = `
                    <strong>${escapeHtml(nombre)}</strong>
                    <span class="sub-info">${infoText.join(' • ')}</span>
                `;
                
                div.dataset.id = p.ID_PACIENTE;
                div.dataset.nombre = nombre;
                div.dataset.telefono = p.TELEFONO || '';
                div.dataset.correo = p.CORREO_ELECTRONICO || '';
                div.dataset.identidad = p.NUMERO_DOCUMENTO_IDENTIDAD || '';
                
                div.addEventListener('click', function() {
                    selectPaciente(this, input, list, hidden, info);
                });
                
                div.addEventListener('mouseenter', function() {
                    list.querySelectorAll('.autocomplete-item').forEach(el => el.classList.remove('active'));
                    this.classList.add('active');
                    currentFocus = Array.from(list.children).indexOf(this);
                });
                
                list.appendChild(div);
            });
            
            list.classList.add('show');
            currentFocus = -1;
        });

        input.addEventListener('keydown', function(e) {
            const items = list.querySelectorAll('.autocomplete-item:not(.no-results)');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus = (currentFocus + 1) % items.length;
                items.forEach(el => el.classList.remove('active'));
                items[currentFocus].classList.add('active');
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus = (currentFocus - 1 + items.length) % items.length;
                items.forEach(el => el.classList.remove('active'));
                items[currentFocus].classList.add('active');
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus >= 0 && currentFocus < items.length) {
                    items[currentFocus].click();
                }
            } else if (e.key === 'Escape') {
                list.classList.remove('show');
            }
        });

        input.addEventListener('blur', function() {
            setTimeout(() => {
                list.classList.remove('show');
            }, 200);
        });
    }

    function selectPaciente(element, input, list, hidden, info) {
        const id = element.dataset.id;
        const nombre = element.dataset.nombre;
        const telefono = element.dataset.telefono;
        const correo = element.dataset.correo;
        const identidad = element.dataset.identidad;
        
        input.value = nombre;
        if (hidden) hidden.value = id;
        if (info) {
            let infoText = [];
            if (telefono) infoText.push(`📱 ${telefono}`);
            if (correo) infoText.push(`📧 ${correo}`);
            if (identidad) infoText.push(`🆔 ${identidad}`);
            info.textContent = infoText.join(' • ');
        }
        list.classList.remove('show');
    }

    function setupAutocompleteDoctores(inputId, listId, hiddenId, infoId, isEdit = false) {
        const input = $(inputId);
        const list = $(listId);
        const hidden = $(hiddenId);
        const info = $(infoId);
        
        if (!input || !list) return;

        let currentFocus = -1;

        input.addEventListener('input', function() {
            const query = this.value.trim();
            const doctores = doctoresData;
            
            if (query.length === 0) {
                list.classList.remove('show');
                list.innerHTML = '';
                if (hidden) hidden.value = '';
                if (info) info.textContent = '';
                return;
            }

            const q = query.toLowerCase();
            const resultados = doctores.filter(d => {
                const nombre = (d.NOMBRE || '').toLowerCase();
                const especialidad = (d.ESPECIALIDAD || '').toLowerCase();
                const identidad = (d.IDENTIDAD || '').toLowerCase();
                return nombre.includes(q) || especialidad.includes(q) || identidad.includes(q);
            });

            if (resultados.length === 0) {
                list.innerHTML = `<div class="autocomplete-item no-results">No se encontraron doctores</div>`;
                list.classList.add('show');
                return;
            }

            const mostrar = resultados.slice(0, 10);
            
            list.innerHTML = '';
            mostrar.forEach((d, index) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                const nombre = `Dr. ${d.NOMBRE}`;
                const infoText = [];
                if (d.ESPECIALIDAD) infoText.push(`🏥 ${d.ESPECIALIDAD}`);
                if (d.IDENTIDAD) infoText.push(`🆔 ${d.IDENTIDAD}`);
                
                div.innerHTML = `
                    <strong>${escapeHtml(nombre)}</strong>
                    <span class="sub-info">${infoText.join(' • ')}</span>
                `;
                
                div.dataset.id = d.ID_DOCTOR;
                div.dataset.nombre = nombre;
                div.dataset.especialidad = d.ESPECIALIDAD || '';
                div.dataset.correo = d.CORREO_ELECTRONICO || '';
                div.dataset.identidad = d.IDENTIDAD || '';
                
                div.addEventListener('click', function() {
                    selectDoctor(this, input, list, hidden, info);
                });
                
                div.addEventListener('mouseenter', function() {
                    list.querySelectorAll('.autocomplete-item').forEach(el => el.classList.remove('active'));
                    this.classList.add('active');
                    currentFocus = Array.from(list.children).indexOf(this);
                });
                
                list.appendChild(div);
            });
            
            list.classList.add('show');
            currentFocus = -1;
        });

        input.addEventListener('keydown', function(e) {
            const items = list.querySelectorAll('.autocomplete-item:not(.no-results)');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus = (currentFocus + 1) % items.length;
                items.forEach(el => el.classList.remove('active'));
                items[currentFocus].classList.add('active');
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus = (currentFocus - 1 + items.length) % items.length;
                items.forEach(el => el.classList.remove('active'));
                items[currentFocus].classList.add('active');
                items[currentFocus].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus >= 0 && currentFocus < items.length) {
                    items[currentFocus].click();
                }
            } else if (e.key === 'Escape') {
                list.classList.remove('show');
            }
        });

        input.addEventListener('blur', function() {
            setTimeout(() => {
                list.classList.remove('show');
            }, 200);
        });
    }

    function selectDoctor(element, input, list, hidden, info) {
        const id = element.dataset.id;
        const nombre = element.dataset.nombre;
        const especialidad = element.dataset.especialidad;
        const correo = element.dataset.correo;
        const identidad = element.dataset.identidad;
        
        input.value = nombre;
        if (hidden) hidden.value = id;
        if (info) {
            let infoText = [];
            if (especialidad) infoText.push(` ${especialidad}`);
            if (correo) infoText.push(` ${correo}`);
            if (identidad) infoText.push(` ${identidad}`);
            info.textContent = infoText.join(' • ');
        }
        list.classList.remove('show');
    }

    // ==================== FUNCIONES DE EDICIÓN ====================

    async function editarCitaPorId(idCita) {
        try {
            const cita = citasData.find(c => String(c.ID_CITA || c.id_cita || c.id) === String(idCita));
            if (!cita) {
                mostrarMensaje("error", "Cita no encontrada");
                return;
            }

            const modal = $("modalEditarCita");
            if (!modal) return;

            $("editIdCita").value = idCita;
            
            // Paciente
            const pacienteId = cita.ID_PACIENTE || cita.id_paciente;
            const paciente = pacientesData.find(p => String(p.ID_PACIENTE) === String(pacienteId));
            if (paciente) {
                const inputPaciente = $("buscarPacienteEditar");
                const hiddenPaciente = $("editPacienteSeleccionado");
                const infoPaciente = $("editPacienteInfo");
                inputPaciente.value = `${paciente.NOMBRES} ${paciente.APELLIDOS}`;
                hiddenPaciente.value = paciente.ID_PACIENTE;
                let infoText = [];
                if (paciente.TELEFONO) infoText.push(`📱 ${paciente.TELEFONO}`);
                if (paciente.CORREO_ELECTRONICO) infoText.push(` ${paciente.CORREO_ELECTRONICO}`);
                if (paciente.NUMERO_DOCUMENTO_IDENTIDAD) infoText.push(` ${paciente.NUMERO_DOCUMENTO_IDENTIDAD}`);
                infoPaciente.textContent = infoText.join(' • ');
            }

            // Doctor
            const doctorId = cita.ID_DOCTOR || cita.id_doctor;
            const doctor = doctoresData.find(d => String(d.ID_DOCTOR) === String(doctorId));
            if (doctor) {
                const inputDoctor = $("buscarDoctorEditar");
                const hiddenDoctor = $("editDoctorSeleccionado");
                const infoDoctor = $("editDoctorInfo");
                inputDoctor.value = `Dr. ${doctor.NOMBRE}`;
                hiddenDoctor.value = doctor.ID_DOCTOR;
                let infoText = [];
                if (doctor.ESPECIALIDAD) infoText.push(`🏥 ${doctor.ESPECIALIDAD}`);
                if (doctor.CORREO_ELECTRONICO) infoText.push(`📧 ${doctor.CORREO_ELECTRONICO}`);
                if (doctor.IDENTIDAD) infoText.push(`🆔 ${doctor.IDENTIDAD}`);
                infoDoctor.textContent = infoText.join(' • ');
            }

            // Fecha y hora
            const fechaStr = cita.FECHA_CITA || cita.fecha_cita || cita.FECHA || cita.fecha;
            if (fechaStr) {
                const fecha = new Date(fechaStr);
                if (!isNaN(fecha.getTime())) {
                    $("editInputFecha").value = fecha.toISOString().split('T')[0];
                    $("editInputHora").value = fecha.toTimeString().slice(0, 5);
                }
            }

            $("editSelectDuracion").value = cita.DURACION_ESTIMADA_MIN || cita.duracion_estimada_min || 30;
            $("editSelectTipoCita").value = cita.TIPO_CITA || cita.tipo_cita || "PRIMERA_VEZ";
            $("editSelectPrioridad").value = cita.PRIORIDAD || cita.prioridad || "NORMAL";
            $("editSelectCanal").value = cita.CANAL_REGISTRO || cita.canal_registro || "PRESENCIAL";
            $("editSelectEstado").value = cita.ESTADO || cita.estado || "PROGRAMADA";
            $("editTextareaMotivo").value = cita.MOTIVO_CONSULTA || cita.motivo_consulta || "";

            calcularFinEstimadoEditar();

            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");

        } catch (error) {
            console.error("Error al editar cita:", error);
            mostrarMensaje("error", "Error al cargar datos para edición");
        }
    }

    function cerrarModalEditar() {
        const modal = $("modalEditarCita");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            $("formEditarCita")?.reset();
        }
    }

    async function guardarEdicionCita() {
        if (editSubmitInProgress) return;
        editSubmitInProgress = true;

        const idCita = $("editIdCita")?.value;
        const paciente = $("editPacienteSeleccionado")?.value;
        const doctor = $("editDoctorSeleccionado")?.value;
        const fecha = $("editInputFecha")?.value;
        const hora = $("editInputHora")?.value;
        const duracion = $("editSelectDuracion")?.value;
        const tipoCita = $("editSelectTipoCita")?.value;
        const prioridad = $("editSelectPrioridad")?.value;
        const canal = $("editSelectCanal")?.value;
        const estado = $("editSelectEstado")?.value;
        const motivo = $("editTextareaMotivo")?.value;

        if (!paciente || !doctor || !fecha || !hora) {
            mostrarErrorModalEditar("Complete los campos obligatorios");
            editSubmitInProgress = false;
            return;
        }

        const fechaHora = `${fecha}T${hora}:00`;
        const fechaSeleccionada = new Date(fechaHora);
        const ahora = new Date();

        if (fechaSeleccionada <= ahora) {
            mostrarErrorModalEditar("La fecha y hora deben ser posteriores al momento actual.");
            editSubmitInProgress = false;
            return;
        }

        const btn = $("btnGuardarEdicion");
        if (btn) btn.disabled = true;

        try {
            const respuesta = await fetch("/citas/editar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ 
                    idCita, 
                    paciente, 
                    doctor, 
                    fechaCita: fechaHora, 
                    tipoCita, 
                    prioridad, 
                    motivo, 
                    duracion, 
                    canal,
                    estado 
                })
            });

            const contenido = respuesta.headers.get("content-type") || "";

            if (respuesta.status === 409) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModalEditar(error?.message || "Ya existe una cita registrada.");
                return;
            }

            if (!respuesta.ok) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModalEditar(error?.message || "Error actualizando la cita.");
                return;
            }

            const data = contenido.includes("application/json") ? await respuesta.json() : null;

            if (data?.success) {
                mostrarMensaje("success", data.message || "Cita actualizada correctamente");
                cerrarModalEditar();
                await cargarDatosReales(true);
            } else {
                mostrarMensaje("success", "Cita actualizada");
                cerrarModalEditar();
                await cargarDatosReales(true);
            }
        } catch (error) {
            console.error("Error actualizando cita:", error);
            mostrarErrorModalEditar("Error de conexión: " + error.message);
        } finally {
            if (btn) btn.disabled = false;
            setTimeout(() => { editSubmitInProgress = false; }, 400);
        }
    }

    async function eliminarCita() {
        const idCita = $("editIdCita")?.value;
        if (!idCita) return;

        if (!confirm(`¿Está seguro de eliminar la cita #${idCita}? Esta acción no se puede deshacer.`)) return;

        try {
            const respuesta = await fetch(`/citas/eliminar/${idCita}`, {
                method: "DELETE",
                credentials: "same-origin"
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                mostrarMensaje("error", data.message || "No se pudo eliminar la cita");
                return;
            }

            mostrarMensaje("success", data.message || "Cita eliminada correctamente");
            cerrarModalEditar();
            await cargarDatosReales(true);
        } catch (error) {
            console.error("Error eliminando cita:", error);
            mostrarMensaje("error", "Error de conexión");
        }
    }

    function mostrarErrorModalEditar(texto) {
        const error = $("modalErrorEditar");
        if (!error) { alert(texto); return; }
        const msg = $("modalErrorMessageEditar");
        if (msg) msg.textContent = texto;
        error.style.display = "block";
    }

    // ==================== FUNCIONES DE CREACIÓN ====================

    async function guardarCitaHandler() {
        if (submitInProgress) return;
        submitInProgress = true;

        const paciente = $("pacienteSeleccionado")?.value;
        const doctor = $("doctorSeleccionado")?.value;
        const fecha = $("inputFecha")?.value;
        const hora = $("inputHora")?.value;
        const duracion = $("selectDuracion")?.value;
        const tipoCita = $("selectTipoCita")?.value;
        const prioridad = $("selectPrioridad")?.value;
        const canal = $("selectCanal")?.value;
        const motivo = $("textareaMotivo")?.value;

        if (!paciente || !doctor || !fecha || !hora) {
            mostrarErrorModal("Complete los campos obligatorios");
            submitInProgress = false;
            return;
        }

        const fechaHora = `${fecha}T${hora}:00`;
        const fechaSeleccionada = new Date(fechaHora);
        const ahora = new Date();

        if (fechaSeleccionada <= ahora) {
            mostrarErrorModal("La fecha y hora deben ser posteriores al momento actual.");
            submitInProgress = false;
            return;
        }

        const btn = $("btnGuardarCita");
        if (btn) btn.disabled = true;

        try {
            const respuesta = await fetch("/citas/nueva", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ paciente, doctor, fechaCita: fechaHora, tipoCita, prioridad, motivo, duracion, canal })
            });

            const contenido = respuesta.headers.get("content-type") || "";

            if (respuesta.status === 409) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModal(error?.message || "Ya existe una cita registrada.");
                return;
            }

            if (!respuesta.ok) {
                const error = contenido.includes("application/json") ? await respuesta.json() : null;
                mostrarErrorModal(error?.message || "Error creando la cita.");
                return;
            }

            const data = contenido.includes("application/json") ? await respuesta.json() : null;

            if (data?.success) {
                mostrarMensaje("success", data.message || "Cita creada correctamente");
                cerrarModalNuevaCita();
                await cargarDatosReales(true);
            } else {
                mostrarMensaje("success", "Cita creada");
                cerrarModalNuevaCita();
                await cargarDatosReales(true);
            }
        } catch (error) {
            console.error("Error creando cita:", error);
            mostrarErrorModal("Error de conexión: " + error.message);
        } finally {
            if (btn) btn.disabled = false;
            setTimeout(() => { submitInProgress = false; }, 400);
        }
    }

    function mostrarErrorModal(texto) {
        const error = $("modalError");
        if (!error) { alert(texto); return; }
        const msg = $("modalErrorMessage");
        if (msg) msg.textContent = texto;
        error.style.display = "block";
    }

    function abrirModalNuevaCita() {
        const modal = $("modalNuevaCita");
        if (modal) {
            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");
            if (fechaCalendarioSeleccionada) {
                $("inputFecha").value = fechaCalendarioSeleccionada;
                fechaCalendarioSeleccionada = null;
            }
        }
    }

    function abrirModalNuevaCitaConFecha(fecha) {
        fechaCalendarioSeleccionada = fecha;
        abrirModalNuevaCita();
    }

    function cerrarModalNuevaCita() {
        const modal = $("modalNuevaCita");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            $("formNuevaCita")?.reset();
            fechaCalendarioSeleccionada = null;
            // Limpiar campos de autocompletado
            const inputPaciente = $("buscarPacienteNueva");
            const hiddenPaciente = $("pacienteSeleccionado");
            const infoPaciente = $("pacienteInfo");
            if (inputPaciente) inputPaciente.value = '';
            if (hiddenPaciente) hiddenPaciente.value = '';
            if (infoPaciente) infoPaciente.textContent = '';
            
            const inputDoctor = $("buscarDoctorNueva");
            const hiddenDoctor = $("doctorSeleccionado");
            const infoDoctor = $("doctorInfo");
            if (inputDoctor) inputDoctor.value = '';
            if (hiddenDoctor) hiddenDoctor.value = '';
            if (infoDoctor) infoDoctor.textContent = '';
        }
    }

    function mostrarMensaje(tipo, texto) {
        try {
            if (tipo === "success") {
                const alerta = $("alertSuccess");
                if (!alerta) { alert(texto); return; }
                const msg = $("successMessage");
                if (msg) msg.textContent = texto;
                alerta.style.display = "flex";
                setTimeout(() => { alerta.style.display = "none"; }, 3500);
            } else if (tipo === "info") {
                const alerta = $("alertInfo") || crearAlertaInfo();
                if (alerta) {
                    const msg = alerta.querySelector(".info-message") || alerta;
                    msg.textContent = texto;
                    alerta.style.display = "flex";
                    setTimeout(() => { alerta.style.display = "none"; }, 3000);
                }
            } else {
                const alerta = $("alertError");
                if (!alerta) { alert(texto); return; }
                const msg = $("errorMessage");
                if (msg) msg.textContent = texto;
                alerta.style.display = "flex";
                setTimeout(() => { alerta.style.display = "none"; }, 5000);
            }
        } catch (e) {
            console.warn(e);
        }
    }

    function crearAlertaInfo() {
        const container = document.querySelector(".alert-container") || document.body;
        const alerta = document.createElement("div");
        alerta.id = "alertInfo";
        alerta.className = "alert alert-info";
        alerta.style.cssText = "display:none; position:fixed; top:20px; right:20px; z-index:9999; padding:15px; background:#cce5ff; border:1px solid #b8daff; border-radius:4px;";
        alerta.innerHTML = `<span class="info-message"></span>`;
        container.appendChild(alerta);
        return alerta;
    }

    // ==================== FUNCIONES DE CALENDARIO ====================

    async function abrirCalendario() {
        const modal = document.getElementById("modalCalendario");
        if (!modal) {
            console.error("No se encontró el modal del calendario");
            return;
        }

        vistaCitasActual = "calendario";
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        try {
            await cargarDatosReales(true);
            mostrarCalendario(citasData);
        } catch (error) {
            console.error("Error abriendo calendario:", error);
            mostrarCalendario(citasData);
        }
    }

    function cerrarCalendario() {
        const modal = $("modalCalendario");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }
        vistaCitasActual = "tabla";
        if (datosFiltrados.length > 0) {
            mostrarCitas(datosFiltrados);
        } else {
            mostrarCitas(citasData);
        }
    }

    // ==================== FUNCIONES DE CÁLCULO ====================

    function calcularFinEstimado() {
        const fecha = $("inputFecha")?.value;
        const hora = $("inputHora")?.value;
        const duracion = parseInt($("selectDuracion")?.value || 30);
        if (!fecha || !hora) return;
        try {
            const fechaHora = new Date(`${fecha}T${hora}:00`);
            fechaHora.setMinutes(fechaHora.getMinutes() + duracion);
            const finEstimado = $("finEstimado");
            if (finEstimado) {
                finEstimado.textContent = fechaHora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            }
        } catch (e) {
            console.warn("Error calculando fin estimado:", e);
        }
    }

    function calcularFinEstimadoEditar() {
        const fecha = $("editInputFecha")?.value;
        const hora = $("editInputHora")?.value;
        const duracion = parseInt($("editSelectDuracion")?.value || 30);
        if (!fecha || !hora) return;
        try {
            const fechaHora = new Date(`${fecha}T${hora}:00`);
            fechaHora.setMinutes(fechaHora.getMinutes() + duracion);
            const finEstimado = $("editFinEstimado");
            if (finEstimado) {
                finEstimado.textContent = fechaHora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            }
        } catch (e) {
            console.warn("Error calculando fin estimado:", e);
        }
    }

    // ==================== FUNCIONES DE IMPRESIÓN ====================

    function generarVentanaImpresion(logoBase64) {
        const tabla = document.getElementById("tablaContenido");
        if (!tabla) {
            alert("No hay información para imprimir");
            return;
        }

        const contenido = tabla.cloneNode(true);
        contenido.querySelectorAll("th:last-child, td:last-child").forEach(el => el.remove());
        contenido.querySelectorAll("button, i").forEach(el => el.remove());

        const ventana = window.open("", "_blank", "width=900,height=700");
        if (!ventana) { alert("El navegador bloqueó la ventana"); return; }

        ventana.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Listado de Citas Médicas</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; }
                .header-top { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
                .logo { width: 80px; margin-right: 20px; }
                .empresa-info h1 { margin: 0; font-size: 20px; }
                .empresa-info p { margin: 0; font-style: italic; font-size: 14px; color: #666; }
                h2 { text-align: center; text-decoration: underline; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { border: 1px solid #ccc; padding: 10px; background: #f8f9fa; text-align: left; }
                td { border: 1px solid #ccc; padding: 10px; }
                .footer-info { margin-top: 30px; text-align: right; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="header-top">
                ${logoBase64 ? `<img class="logo" src="${logoBase64}">` : ""}
                <div class="empresa-info">
                    <h1>Clínicas Médicas Roca Maya</h1>
                    <p>Tu salud es nuestra seguridad</p>
                </div>
            </div>
            <h2>Lista de Citas Médicas</h2>
            ${contenido.innerHTML}
            <div class="footer-info">
                <p>Total de citas: ${contenido.querySelectorAll("tbody tr").length}</p>
                <p>Generado el: ${new Date().toLocaleString("es-HN")}</p>
            </div>
        </body>
        </html>
        `);

        ventana.document.close();
        setTimeout(() => { ventana.focus(); ventana.print(); }, 700);
    }

    // ==================== EVENT LISTENERS ====================

    document.addEventListener("DOMContentLoaded", () => {
        cargarDatosReales();

        // Logo - Dashboard
        $("logoBtn")?.addEventListener("click", () => {
            window.location.href = "/dashboard";
        });

        // Vista lista
        $("btn-vista-lista")?.addEventListener("click", () => {
            vistaCitasActual = "tabla";
            cerrarCalendario();
            if (datosFiltrados.length > 0) {
                mostrarCitas(datosFiltrados);
            } else {
                mostrarCitas(citasData);
            }
        });

        // Filtro búsqueda
        const filtroBusqueda = $("filtroBusqueda");
        if (filtroBusqueda) {
            filtroBusqueda.addEventListener("input", debounce(function() {
                aplicarFiltros();
            }, 300));
        }

        // Botón imprimir
        const btnImprimir = document.getElementById("btnImprimir");
        if (btnImprimir) {
            btnImprimir.addEventListener("click", async () => {
                try {
                    if (typeof setLoading === 'function') setLoading(true, "Preparando impresión...");
                    const logoBase64 = await imageToBase64("/roca-maya-oct.jpg");
                    generarVentanaImpresion(logoBase64);
                } catch (error) {
                    console.error("Error cargando logo:", error);
                    generarVentanaImpresion(null);
                } finally {
                    if (typeof setLoading === 'function') setLoading(false);
                }
            });
        }

        // Nueva Cita
        $("btnNuevaCitaHeader")?.addEventListener("click", abrirModalNuevaCita);
        $("btnCancelarModal")?.addEventListener("click", cerrarModalNuevaCita);
        $("btnCloseModal")?.addEventListener("click", cerrarModalNuevaCita);
        $("btnGuardarCita")?.addEventListener("click", guardarCitaHandler);

        // Editar Cita
        $("btnCloseModalEditar")?.addEventListener("click", cerrarModalEditar);
        $("btnCancelarEditar")?.addEventListener("click", cerrarModalEditar);
        $("btnGuardarEdicion")?.addEventListener("click", guardarEdicionCita);
        $("btnEliminarCita")?.addEventListener("click", eliminarCita);

        // Calendario
        $("btn-vista-calendario")?.addEventListener("click", abrirCalendario);
        $("btnCerrarCalendario")?.addEventListener("click", cerrarCalendario);

        // Navegación calendario
        $("prev-month")?.addEventListener("click", () => {
            mesCalendarioActual--;
            if (mesCalendarioActual < 0) {
                mesCalendarioActual = 11;
                anioCalendarioActual--;
            }
            mostrarCalendario(datosFiltrados.length > 0 ? datosFiltrados : citasData);
        });

        $("next-month")?.addEventListener("click", () => {
            mesCalendarioActual++;
            if (mesCalendarioActual > 11) {
                mesCalendarioActual = 0;
                anioCalendarioActual++;
            }
            mostrarCalendario(datosFiltrados.length > 0 ? datosFiltrados : citasData);
        });

        // Eventos de tabla
        $("tablaContenido")?.addEventListener("click", tablaClickHandler);
        
        // Cálculo de fin estimado
        $("inputFecha")?.addEventListener("change", calcularFinEstimado);
        $("inputHora")?.addEventListener("change", calcularFinEstimado);
        $("selectDuracion")?.addEventListener("change", calcularFinEstimado);

        $("editInputFecha")?.addEventListener("change", calcularFinEstimadoEditar);
        $("editInputHora")?.addEventListener("change", calcularFinEstimadoEditar);
        $("editSelectDuracion")?.addEventListener("change", calcularFinEstimadoEditar);

        // Filtros principales
        $("filtroEstado")?.addEventListener("change", aplicarFiltros);
        $("filtroDoctor")?.addEventListener("change", aplicarFiltros);
        $("filtroFechaDesde")?.addEventListener("change", aplicarFiltros);
        $("filtroFechaHasta")?.addEventListener("change", aplicarFiltros);

        // Botón crear primera cita
        const btnCrearPrimera = $("btnCrearPrimera");
        if (btnCrearPrimera) {
            btnCrearPrimera.addEventListener("click", abrirModalNuevaCita);
        }

        // Cerrar modales al hacer click fuera
        document.querySelectorAll(".ctmodal-cita").forEach(modal => {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) {
                    if (modal.id === "modalNuevaCita") {
                        cerrarModalNuevaCita();
                    } else if (modal.id === "modalEditarCita") {
                        cerrarModalEditar();
                    } else if (modal.id === "modalCalendario") {
                        cerrarCalendario();
                    }
                }
            });
        });

        // ==================== AUTOCOMPLETADO ====================
        
        // Pacientes - Nueva Cita
        setupAutocompletePacientes('buscarPacienteNueva', 'autocompletePacientes', 'pacienteSeleccionado', 'pacienteInfo', false);
        
        // Doctores - Nueva Cita
        setupAutocompleteDoctores('buscarDoctorNueva', 'autocompleteDoctores', 'doctorSeleccionado', 'doctorInfo', false);
        
        // Pacientes - Editar
        setupAutocompletePacientes('buscarPacienteEditar', 'autocompletePacientesEditar', 'editPacienteSeleccionado', 'editPacienteInfo', true);
        
        // Doctores - Editar
        setupAutocompleteDoctores('buscarDoctorEditar', 'autocompleteDoctoresEditar', 'editDoctorSeleccionado', 'editDoctorInfo', true);
    });

})();