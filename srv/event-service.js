const cds = require('@sap/cds');
const { generarCodigoInscripcion, contarInscritosActivos, cambiarEstadoEvento } = require('./helpers/event-helpers');

module.exports = class EventManagementService extends cds.ApplicationService {
  init() {
    const { Eventos, Inscripciones, Sesiones, Asistentes } = this.entities;
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

      const inscritosActuales = await contarInscritosActivos(Inscripciones, eventoID);
      if (inscritosActuales >= evento.aforoMaximo) {
        return req.reject(409, `Aforo máximo (${evento.aforoMaximo}) alcanzado para este evento`);
      }

      req.data.codigo = await generarCodigoInscripcion(cds.tx(req), Secuencia, new Date().getFullYear());
    });

    /* Validación de coherencia de fechas de evento */

    this.before(['CREATE', 'UPDATE'], 'Eventos', async (req) => {

      // Valor por defecto dinámico, si no se proporciona fechaFin, se iguala a fechaInicio
      if (req.event === 'CREATE' && !req.data.fechaFin && req.data.fechaInicio) {
        req.data.fechaFin = req.data.fechaInicio;
      }

      let { fechaInicio, fechaFin } = req.data;
      // Validación de coherencia
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

    /* Consulta de plazas disponibles */

    this.on('plazasDisponibles', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      const evento = await SELECT.one.from(Eventos).columns('aforoMaximo').where({ ID });
      const inscritos = await contarInscritosActivos(Inscripciones, ID);
      return evento.aforoMaximo - inscritos;
    });

    /* Consulta de número de asistentes inscritos */

    this.on('numeroAsistentesInscritos', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      const inscritos = await contarInscritosActivos(Inscripciones, ID);
      return inscritos;
    });

    /* Consulta de recaudación total */

    this.on('recaudacionTotal', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      const evento = await SELECT.one.from(Eventos).columns('precio').where({ ID });
      const inscritos = await contarInscritosActivos(Inscripciones, ID);
      return Number(evento.precio) * inscritos;
    });

    /* Consulta de duración total del evento (en horas, con 2 decimales) */

    this.on('duracionTotal', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      const sesiones = await SELECT.from(Sesiones)
        .columns('fechaHoraInicio', 'fechaHoraFin')
        .where({ evento_ID: ID });

      if (sesiones.length === 0) return 0;

      const inicio = Math.min(...sesiones.map(s => new Date(s.fechaHoraInicio).getTime()));
      const fin = Math.max(...sesiones.map(s => new Date(s.fechaHoraFin).getTime()));

      return Math.round(((fin - inicio) / 3_600_000) * 100) / 100;  // horas, 2 decimales
    });

    /* Consulta de número de sesiones del evento */

    this.on('numeroSesiones', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      const sesiones = await SELECT.from(Sesiones).columns('ID').where({ evento_ID: ID });
      return sesiones.length;
    });

    /* Cambio de estado de un evento - Actions */

    this.on('publicar', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      return cambiarEstadoEvento(Eventos, req, ID, ['Planificado'], 'Abierto');
    });

    this.on('cerrar', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      return cambiarEstadoEvento(Eventos, req, ID, ['Abierto'], 'Cerrado');
    });

    this.on('cancelar', 'Eventos', async (req) => {
      const { ID } = req.params[0];
      const evento = await cambiarEstadoEvento(Eventos, req, ID, ['Planificado', 'Abierto', 'Cerrado'], 'Cancelado');
      if (!evento) return; // ya rechazado dentro del helper

      // Cascada de negocio: cancelar también libera las inscripciones activas
      await UPDATE(Inscripciones)
        .set({ estado: 'Cancelada' })
        .where({ evento_ID: ID, estado: { '!=': 'Cancelada' } });

      return evento;
    });

    /* Registro de asistente a un evento (Action) */

    this.on('registrarAsistente', 'Eventos', async (req) => {
      const { ID: eventoID } = req.params[0];
      const { nombre, apellidos, email, telefono, empresa } = req.data;

      let asistente = await SELECT.one.from(Asistentes).where({ email });
      if (!asistente) {
        asistente = await this.create(Asistentes).entries({ nombre, apellidos, email, telefono, empresa });
      }

      // Reutiliza el before CREATE Inscripciones existente (duplicados, aforo, código)
      return this.create(Inscripciones).entries({ evento_ID: eventoID, asistente_ID: asistente.ID });
    });

    /* Confirmación de inscripción (Action) */

    this.on('confirmar', 'Inscripciones', async (req) => {
      const { ID } = req.params[0];
      const inscripcion = await SELECT.one.from(Inscripciones).columns('ID', 'estado').where({ ID });
      if (!inscripcion) return req.reject(404, `La inscripción ${ID} no existe`);

      if (inscripcion.estado !== 'Pendiente') {
        return req.reject(409, `Solo se puede confirmar una inscripción en estado "Pendiente" (actual: "${inscripcion.estado}")`);
      }

      await UPDATE(Inscripciones).set({ estado: 'Confirmada' }).where({ ID });
      return SELECT.one.from(Inscripciones).where({ ID });
    });

    return super.init();
  }
};
