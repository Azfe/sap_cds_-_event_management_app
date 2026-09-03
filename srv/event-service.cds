using com.gestion_eventos as em from '../db/schema';

service EventManagementService {

  @readonly
  entity TiposEvento   as projection on em.TipoEvento;

  @readonly
  entity Salas         as projection on em.Sala;

  entity Sesiones      as projection on em.Sesion;
  entity Asistentes    as projection on em.Asistente;
  entity Inscripciones as projection on em.Inscripcion;

  entity Eventos       as projection on em.Evento
    actions {
      function plazasDisponibles()         returns Integer;
      function numeroAsistentesInscritos() returns Integer;
      function recaudacionTotal()          returns Decimal(10, 2);
      function duracionTotal()             returns Decimal(10, 2);
      function numeroSesiones()            returns Integer;
    };
}
