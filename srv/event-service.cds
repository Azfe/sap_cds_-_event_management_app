using com.gestion_eventos as em from '../db/schema';

service EventManagementService {

  @readonly
  entity TiposEvento   as projection on em.TipoEvento;

  @readonly
  entity Salas         as projection on em.Sala;

  entity Sesiones      as projection on em.Sesion;
  entity Asistentes    as projection on em.Asistente;

  entity Inscripciones as projection on em.Inscripcion
    actions {
      action confirmar() returns Inscripciones;
    };

  entity Eventos       as projection on em.Evento
    actions {
      function plazasDisponibles()                      returns Integer;
      function numeroAsistentesInscritos()              returns Integer;
      function recaudacionTotal()                       returns Decimal(10, 2);
      function duracionTotal()                          returns Decimal(10, 2);
      function numeroSesiones()                         returns Integer;

      action   publicar()                               returns Eventos;
      action   cerrar()                                 returns Eventos;
      action   cancelar()                               returns Eventos;
      action   registrarAsistente(nombre: String(80),
                                  apellidos: String(120),
                                  email: String(150),
                                  telefono: String(30),
                                  empresa: String(120)) returns Inscripciones;
    };
}
