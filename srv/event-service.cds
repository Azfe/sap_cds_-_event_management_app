using com.gestion_eventos as em from '../db/schema';

service EventManagementService {

  @readonly entity TiposEvento as projection on em.TipoEvento;
  @readonly entity Salas       as projection on em.Sala;

  entity Eventos       as projection on em.Evento;
  entity Sesiones      as projection on em.Sesion;
  entity Asistentes    as projection on em.Asistente;
  entity Inscripciones as projection on em.Inscripcion;
}
