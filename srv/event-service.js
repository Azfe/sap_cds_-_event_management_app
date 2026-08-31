const cds = require('@sap/cds');

module.exports = class EventManagementService extends cds.ApplicationService {
  init() {
    const { Eventos, Inscripciones } = this.entities;
    const { Secuencia } = cds.entities('com.gestion_eventos');

    /* Validación de inscripciones */

    this.before('CREATE', 'Inscripciones', async (req) => {
      const eventoID    = req.data.evento_ID;
      const asistenteID = req.data.asistente_ID;
      if (!eventoID || !asistenteID) return;

      const evento = await SELECT.one.from(Eventos)
        .columns('ID', 'aforoMaximo')
        .where({ ID: eventoID });
      if (!evento) return req.reject(404, `El evento ${eventoID} no existe`);

      const yaInscrito = await SELECT.one.from(Inscripciones)
        .where({ evento_ID: eventoID, asistente_ID: asistenteID });
      if (yaInscrito) return req.reject(409, 'Este asistente ya está inscrito en este evento');

      const inscritosActuales = await SELECT.from(Inscripciones)
        .columns('ID')
        .where({ evento_ID: eventoID, estado: { '!=': 'Cancelada' } });
      if (inscritosActuales.length >= evento.aforoMaximo) {
        return req.reject(409, `Aforo máximo (${evento.aforoMaximo}) alcanzado para este evento`);
      }

      req.data.codigo = await generarCodigoInscripcion(cds.tx(req), Secuencia, new Date().getFullYear());
    });

    return super.init();
  }
};

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
    // No existía fila para este año todavía: la creamos arrancando en 1
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
