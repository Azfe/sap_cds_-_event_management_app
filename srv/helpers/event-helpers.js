const cds = require('@sap/cds');
const { SELECT, UPDATE, INSERT } = cds.ql;

/* Generación de código de inscripción */

async function generarCodigoInscripcion(tx, Secuencia, anio) {
    const prefijo = `INS-${anio}-`;

    // Intento 1: incrementar el contador si ya existe fila para este año
    const filasActualizadas = await tx.run(
        UPDATE(Secuencia)
            .set('ultimoValor = ultimoValor + 1')
            .where({ entidad: 'INSCRIPCION', anio })
    );

    let siguiente;
    if (filasActualizadas === 0) {
        // No existía fila para este año todavía: se crea arrancando en 1
        await tx.run(
            INSERT.into(Secuencia).entries({ entidad: 'INSCRIPCION', anio, ultimoValor: 1 })
        );
        siguiente = 1;
    } else {
        const fila = await tx.run(
            SELECT.one.from(Secuencia).where({ entidad: 'INSCRIPCION', anio })
        );
        siguiente = fila.ultimoValor;
    }

    return prefijo + String(siguiente).padStart(4, '0');
}

/* Conteo de inscripciones activas de un evento */

async function contarInscritosActivos(Inscripciones, eventoID) {
    const filas = await SELECT.from(Inscripciones)
        .columns('ID')
        .where({ evento_ID: eventoID, estado: { '!=': 'Cancelada' } });
    return filas.length;
}

/* Cambio de estado de un evento con validación de estados permitidos */

async function cambiarEstadoEvento(Eventos, req, eventoID, estadosPermitidos, estadoNuevo) {
    const evento = await SELECT.one.from(Eventos).columns('ID', 'estado').where({ ID: eventoID });
    if (!evento) { req.reject(404, `El evento ${eventoID} no existe`); return; }

    if (!estadosPermitidos.includes(evento.estado)) {
        req.reject(409, `No se puede pasar de "${evento.estado}" a "${estadoNuevo}"`);
        return;
    }

    await UPDATE(Eventos).set({ estado: estadoNuevo }).where({ ID: eventoID });
    return SELECT.one.from(Eventos).where({ ID: eventoID });
}

module.exports = {
    generarCodigoInscripcion,
    contarInscritosActivos,
    cambiarEstadoEvento
};