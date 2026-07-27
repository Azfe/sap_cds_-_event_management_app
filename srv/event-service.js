const cds = require('@sap/cds');

module.exports = class EventManagementService extends cds.ApplicationService {
  init() {
    const { Eventos, Inscripciones } = this.entities;

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

      req.data.codigo = await generarCodigoInscripcion(Inscripciones);
    });

    return super.init();
  }
};

async function generarCodigoInscripcion(Inscripciones) {
  const anio = new Date().getFullYear();
  const prefijo = `INS-${anio}-`;

  const ultima = await SELECT.one.from(Inscripciones)
    .columns('codigo')
    .where({ codigo: { like: `${prefijo}%` } })
    .orderBy('codigo desc');

  let siguiente = 1;
  if (ultima?.codigo) siguiente = parseInt(ultima.codigo.split('-')[2], 10) + 1;

  return prefijo + String(siguiente).padStart(4, '0');
}
