// Variables globales
let tablaMedicamentos;
let medicamentosData = [];
let modalMedicamento = null;

// Inicialización cuando el documento está listo
$(document).ready(function() {
    modalMedicamento = new bootstrap.Modal(document.getElementById('modalMedicamento'));
    
    inicializarDataTable();
    cargarMedicamentos();
    inicializarValidaciones();
    inicializarEventListeners();
    
    $('#searchInput').on('input', filtrarMedicamentos);
    $('#filterEstado').on('change', filtrarMedicamentos);   // <-- Cambio: filterEstado
    $('#filterStock').on('change', filtrarMedicamentos);    // <-- Cambio: filterStock
});

// Inicializar DataTable
function inicializarDataTable() {
    tablaMedicamentos = $('#tablaMedicamentos').DataTable({
        language: {
            url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
        },
        columns: [
            { data: 'NOMBRE_MEDICAMENTO' },
            { data: 'NOMBRE_GENERICO' },
            { data: 'PROVEEDOR' },       // <-- Se agregó columna para laboratorio
            { data: 'PRESENTACION' },
            { 
                data: 'STOCK_ACTUAL',
                render: function(data, type, row) {
                    const stockClass = getStockClass(row.STOCK_ACTUAL, row.STOCK_MINIMO);
                    return `<span class="status ${stockClass}">${data}</span>`;
                }
            },
            { 
                data: 'PRECIO_VENTA',
                render: function(data) {
                    return data ? `L. ${parseFloat(data).toFixed(2)}` : '-';
                }
            },
            { 
                data: 'FECHA_VENCIMIENTO',
                render: function(data) {
                    if (!data) return '-';
                    const fecha = new Date(data);
                    const hoy = new Date();
                    const diffTime = fecha - hoy;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) {
                        return `<span class="text-danger">Vencido</span>`;
                    } else if (diffDays <= 30) {
                        return `<span class="text-warning">${formatearFecha(data)} (${diffDays}d)</span>`;
                    } else {
                        return formatearFecha(data);
                    }
                }
            },
            { 
                data: 'ESTADO',
                render: function(data) {
                    const estadoClass = data === 'ACTIVO' ? 'active' : 
                                      data === 'VENCIDO' ? 'danger' : 'inactive';
                    return `<span class="status ${estadoClass}">${data}</span>`;
                }
            },
            {
                data: 'ID_MEDICAMENTO',
                render: function(data, type, row) {
                    return `
                        <div class="table-actions">
                            <button class="action-btn edit" onclick="editarMedicamento(${data})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" onclick="eliminarMedicamento(${data})" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                },
                orderable: false
            }
        ]
    });
}

// Inicializar event listeners
function inicializarEventListeners() {
    $('input[type="text"], textarea').on('input', function() {
        validarCampoTexto($(this));
    });
    
    $('input[type="number"]').on('input', function() {
        validarCampoNumero($(this));
    });
    
    $('input[type="date"]').on('change', function() {
        validarFecha($(this));
    });
}

function inicializarValidaciones() {
    $('#formMedicamento').on('submit', function(e) {
        e.preventDefault();
        if (validarFormularioCompleto()) {
            guardarMedicamento();
        }
    });
}

// Cargar medicamentos
function cargarMedicamentos() {
    mostrarLoading(true);
    
    $.ajax({
        url: '/inventario/api/medicamentos',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                medicamentosData = response.data;
                tablaMedicamentos.clear().rows.add(medicamentosData).draw();
                actualizarEstadisticas();
            } else {
                mostrarAlerta('Error al cargar los medicamentos', 'error');
            }
        },
        error: function() {
            mostrarAlerta('Error de conexión al cargar los medicamentos', 'error');
        },
        complete: function() {
            mostrarLoading(false);
        }
    });
}

// Filtrar medicamentos (corregido)
function filtrarMedicamentos() {
    const searchTerm = $('#searchInput').val().toLowerCase();
    const estadoFilter = $('#filterEstado').val();      // <-- Cambio
    const stockFilter = $('#filterStock').val();        // <-- Cambio

    const filteredData = medicamentosData.filter(med => {
        const matchSearch = !searchTerm || 
            (med.NOMBRE_MEDICAMENTO && med.NOMBRE_MEDICAMENTO.toLowerCase().includes(searchTerm)) ||
            (med.NOMBRE_GENERICO && med.NOMBRE_GENERICO.toLowerCase().includes(searchTerm)) ||
            (med.PROVEEDOR && med.PROVEEDOR.toLowerCase().includes(searchTerm));

        const matchEstado = !estadoFilter || med.ESTADO === estadoFilter;
        
        let matchStock = true;
        if (stockFilter && med.STOCK_ACTUAL !== undefined && med.STOCK_MINIMO !== undefined) {
            if (stockFilter === 'BAJO') {                       // <-- valores adaptados
                matchStock = med.STOCK_ACTUAL <= med.STOCK_MINIMO;
            } else if (stockFilter === 'OPTIMO') {
                matchStock = med.STOCK_ACTUAL > med.STOCK_MINIMO;
            } else if (stockFilter === 'SIN_STOCK') {
                matchStock = med.STOCK_ACTUAL === 0;
            }
        }

        return matchSearch && matchEstado && matchStock;
    });

    tablaMedicamentos.clear().rows.add(filteredData).draw();
}

// Resetear filtros
function resetearFiltros() {
    $('#searchInput').val('');
    $('#filterEstado').val('');
    $('#filterStock').val('');
    filtrarMedicamentos();
}

// Abrir modal nuevo
function abrirModalNuevo() {
    $('#modalTitle').html('<i class="fas fa-pills me-2"></i>Nuevo Medicamento');
    $('#formMedicamento')[0].reset();
    $('#idMedicamento').val('');
    limpiarValidaciones();
    modalMedicamento.show();
}

// Editar medicamento (con proveedor)
function editarMedicamento(id) {
    mostrarLoading(true);
    
    $.ajax({
        url: `/inventario/api/medicamentos/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                const med = response.data;
                $('#modalTitle').html('<i class="fas fa-pills me-2"></i>Editar Medicamento');
                $('#idMedicamento').val(med.ID_MEDICAMENTO);
                
                $('#nombreMedicamento').val(med.NOMBRE_MEDICAMENTO || '');
                $('#nombreGenerico').val(med.NOMBRE_GENERICO || '');
                $('#descripcion').val(med.DESCRIPCION || ''); // si existe
                $('#presentacion').val(med.PRESENTACION || '');
                $('#concentracion').val(med.CONCENTRACION || '');
                $('#viaAdministracion').val(med.VIA_ADMINISTRACION || '');
                $('#stockActual').val(med.STOCK_ACTUAL || 0);
                $('#stockMinimo').val(med.STOCK_MINIMO || 10);
                $('#stockMaximo').val(med.STOCK_MAXIMO || 100);
                $('#precioCompra').val(med.PRECIO_COMPRA || '');
                $('#precioVenta').val(med.PRECIO_VENTA || '');
                $('#lote').val(med.LOTE || '');
                $('#fechaVencimiento').val(med.FECHA_VENCIMIENTO || '');
                $('#proveedor').val(med.PROVEEDOR || '');            // <-- se asigna
                $('#requiereReceta').prop('checked', med.REQUIERE_RECETA || false);
                $('#estado').val(med.ESTADO || 'ACTIVO');
                
                limpiarValidaciones();
                modalMedicamento.show();
            } else {
                mostrarAlerta('Error al cargar el medicamento', 'error');
            }
        },
        error: function() {
            mostrarAlerta('Error de conexión', 'error');
        },
        complete: function() {
            mostrarLoading(false);
        }
    });
}

// Guardar medicamento (envía todos los campos)
function guardarMedicamento() {
    mostrarLoading(true);
    
    const formData = {
        NOMBRE_MEDICAMENTO: $('#nombreMedicamento').val(),
        NOMBRE_GENERICO: $('#nombreGenerico').val(),
        DESCRIPCION: $('#descripcion').val(),
        PRESENTACION: $('#presentacion').val(),
        CONCENTRACION: $('#concentracion').val(),
        VIA_ADMINISTRACION: $('#viaAdministracion').val(),
        STOCK_ACTUAL: parseInt($('#stockActual').val()) || 0,
        STOCK_MINIMO: parseInt($('#stockMinimo').val()) || 10,
        STOCK_MAXIMO: parseInt($('#stockMaximo').val()) || 100,
        PRECIO_COMPRA: parseFloat($('#precioCompra').val()) || 0,
        PRECIO_VENTA: parseFloat($('#precioVenta').val()) || 0,
        LOTE: $('#lote').val(),
        FECHA_VENCIMIENTO: $('#fechaVencimiento').val() || null,
        PROVEEDOR: $('#proveedor').val(),                         // <-- se envía
        REQUIERE_RECETA: $('#requiereReceta').is(':checked'),
        ESTADO: $('#estado').val()
    };

    const idMedicamento = $('#idMedicamento').val();
    const method = idMedicamento ? 'PUT' : 'POST';
    const url = idMedicamento ? `/inventario/api/medicamentos/${idMedicamento}` : '/inventario/api/medicamentos';

    $.ajax({
        url: url,
        method: method,
        data: JSON.stringify(formData),
        contentType: 'application/json',
        success: function(response) {
            if (response.success) {
                modalMedicamento.hide();
                mostrarAlerta(response.message, 'success');
                cargarMedicamentos();
            } else {
                mostrarAlerta(response.message || 'Error al guardar', 'error');
            }
        },
        error: function(xhr) {
            let mensaje = 'Error al guardar el medicamento';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                mensaje = xhr.responseJSON.message;
            }
            mostrarAlerta(mensaje, 'error');
        },
        complete: function() {
            mostrarLoading(false);
        }
    });
}

// Eliminar medicamento
function eliminarMedicamento(id) {
    if (confirm('¿Está seguro de que desea eliminar este medicamento?')) {
        mostrarLoading(true);
        
        $.ajax({
            url: `/inventario/api/medicamentos/${id}`,
            method: 'DELETE',
            success: function(response) {
                if (response.success) {
                    mostrarAlerta(response.message, 'success');
                    cargarMedicamentos();
                } else {
                    mostrarAlerta(response.message || 'Error al eliminar', 'error');
                }
            },
            error: function(xhr) {
                let mensaje = 'Error al eliminar el medicamento';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    mensaje = xhr.responseJSON.message;
                }
                mostrarAlerta(mensaje, 'error');
            },
            complete: function() {
                mostrarLoading(false);
            }
        });
    }
}

// ... (resto de funciones auxiliares: validaciones, helpers, etc.) se mantienen igual
// Se incluyen por completitud, pero no se modifican
function getStockClass(stockActual, stockMinimo) {
    if (stockActual < stockMinimo * 0.5) return 'danger';
    else if (stockActual <= stockMinimo) return 'warning';
    else return 'active';
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-ES');
}

function mostrarLoading(mostrar) {
    $('#loadingSpinner').css('display', mostrar ? 'flex' : 'none');
}

function mostrarAlerta(mensaje, tipo) {
    const alerta = $(`
        <div class="alert alert-${tipo === 'error' ? 'danger' : 'success'} alert-dismissible fade show" role="alert">
            <i class="fas fa-${tipo === 'error' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
            ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `);
    alerta.css({
        'position': 'fixed',
        'top': '20px',
        'right': '20px',
        'z-index': '9999',
        'min-width': '300px'
    });
    $('body').append(alerta);
    setTimeout(() => alerta.alert('close'), 5000);
}

function actualizarEstadisticas() {
    const total = medicamentosData.length;
    const activos = medicamentosData.filter(m => m.ESTADO === 'ACTIVO').length;
    const stockBajo = medicamentosData.filter(m => 
        m.STOCK_ACTUAL <= m.STOCK_MINIMO && m.ESTADO === 'ACTIVO'
    ).length;
    
    const hoy = new Date();
    const proximosVencer = medicamentosData.filter(m => {
        if (!m.FECHA_VENCIMIENTO) return false;
        const vencimiento = new Date(m.FECHA_VENCIMIENTO);
        const diffTime = vencimiento - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 30 && diffDays > 0;
    }).length;

    $('#totalMedicamentos').text(total);
    $('#medicamentosActivos').text(activos);
    $('#stockBajo').text(stockBajo);
    $('#proximosVencer').text(proximosVencer);
}
