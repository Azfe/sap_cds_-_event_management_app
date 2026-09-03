const cds = require('@sap/cds');

module.exports = class EventManagementService extends cds.ApplicationService {
  init() {
    const { Eventos, Inscripciones } = this.entities;
    const { Secuencia } = cds.entities('com.gestion_eventos');

    /* Validación de inscripciones */

    this.before('CREATE', 'Inscripciones', async (req) => {
      const eventoID = req.data.evento_ID;
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

    /* Validación de coherencia de fechas de evento */

    this.before(['CREATE', 'UPDATE'], 'Eventos', async (req) => {
      let { fechaInicio, fechaFin } = req.data;

      if (req.event === 'UPDATE' && (fechaInicio === undefined || fechaFin === undefined)) {
        const eventoID = req.data.ID ?? req.params[0]?.ID;
        const actual = await SELECT.one.from(Eventos)
          .columns('fechaInicio', 'fechaFin')
          .where({ ID: eventoID });
        fechaInicio = fechaInicio ?? actual?.fechaInicio;
        fechaFin = fechaFin ?? actual?.fechaFin;
      }

      if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
        return req.reject(400, `La fecha de inicio (${fechaInicio}) no puede ser posterior a la fecha de fin (${fechaFin})`);
      }
    });

    /* Validación de solapamiento de sesiones */

    this.before(['CREATE', 'UPDATE'], 'Sesiones', async (req) => {
      const eventoID = req.data.evento_ID;
      const salaID = req.data.sala_ID;
      const inicio = req.data.fechaHoraInicio;
      const fin = req.data.fechaHoraFin;

      if (!eventoID || !salaID || !inicio || !fin) return;

      if (inicio >= fin) {
        return req.reject(400, 'La hora de inicio de la sesión debe ser anterior a la hora de fin');
      }

      const solapadas = await SELECT.from(Sesiones)
        .columns('ID')
        .where({
          evento_ID: eventoID,
          sala_ID: salaID,
          fechaHoraInicio: { '<': fin },
          fechaHoraFin: { '>': inicio },
          ...(req.event === 'UPDATE' ? { ID: { '!=': req.data.ID ?? req.params[0]?.ID } } : {})
      });

      if (solapadas.length > 0) {
        return req.reject(409, 'Ya existe otra sesión de este evento en esa sala con un horario solapado');
      }
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
