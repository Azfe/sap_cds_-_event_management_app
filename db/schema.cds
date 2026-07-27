namespace com.gestion_eventos;

using { cuid, managed } from '@sap/cds/common';

/* Catálogo de tipos de evento: conferencia, taller, webinar... */
entity TipoEvento {
    key codigo      : String(10);
        nombre      : String(60)  not null;
        descripcion : String(255);
        activo      : Boolean default true;
}

/* Catálogo de salas/ubicaciones de la empresa */
entity Sala {
    key codigo      : String(15);
        nombre      : String(60)  not null;
        edificio    : String(60);
        planta      : String(10);
        aforo       : Integer     not null @assert.range: [1, 100000];
        activa      : Boolean default true;
}

entity Evento : cuid, managed {
    titulo        : String(120)  not null;
    descripcion   : String(1000);
    fechaInicio   : Date         not null;
    fechaFin      : Date         not null;
    aforoMaximo   : Integer      not null @assert.range: [1, 100000];
    estado        : String enum {
        Planificado;
        Abierto;
        Cerrado;
        Cancelado;
        Finalizado;
    } default 'Planificado';
    tipoEvento    : Association to one TipoEvento not null;

    // Composition: una Sesión no existe fuera de su Evento
    sesiones      : Composition of many Sesion
                        on sesiones.evento = $self;

    // Composition: la Inscripción nace y se gestiona dentro del Evento
    inscripciones : Composition of many Inscripcion
                        on inscripciones.evento = $self;
}

entity Sesion : cuid, managed {
    titulo          : String(120) not null;
    fechaHoraInicio : Timestamp   not null;
    fechaHoraFin    : Timestamp   not null;
    evento          : Association to one Evento not null;
    // Association (no composition): la Sala es un recurso compartido
    // de la empresa, no se "destruye" al borrar la sesión
    sala            : Association to one Sala   not null;
}

@assert.unique.emailUnico: [email]
entity Asistente : cuid, managed {
    nombre        : String(80)  not null;
    apellidos     : String(120) not null;
    email         : String(150) not null;
    telefono      : String(30);
    empresa       : String(120);
    // Association (no composition): borrar un asistente no debe
    // arrastrar el borrado de su histórico de inscripciones
    inscripciones : Association to many Inscripcion
                        on inscripciones.asistente = $self;
}

@assert.unique.unaInscripcionPorAsistenteYEvento: [asistente, evento]
entity Inscripcion : cuid, managed {
    // Código de negocio autogenerado en el handler .js: INS-{año}-{nnnn}
    codigo        : String(15) @readonly;
    evento        : Association to one Evento    not null;
    asistente     : Association to one Asistente not null;
    estado        : String enum {
        Pendiente;
        Confirmada;
        Cancelada;
        Asistio;
        NoPresentado;
    } default 'Pendiente';
    observaciones : String(500);
}
