/**
 * Central content module for the "Acompañamiento de Adulto Mayor" landing page.
 * Placeholder copy lives here so the owner can replace texts in one place.
 * Two voices: the web landing speaks to a trained caregiver (technical tone),
 * the mobile landing speaks to the elderly end user (simple, warm tone).
 */

export const brand = {
  name: 'Acompañamiento de Adulto Mayor',
  shortName: 'AAM',
  domain: 'acompanamientoadultomayor',
} as const;

export const navSections = [
  { id: 'vision', label: 'Visión', mobileLabel: 'Visión' },
  { id: 'mission', label: 'Misión', mobileLabel: 'Misión' },
  { id: 'info', label: 'Información', mobileLabel: '¿Cómo funciona?' },
] as const;

export type NavSectionId = (typeof navSections)[number]['id'];

/** Landing copy for the caregiver-facing technical website. */
export const landingWeb = {
  hero: {
    kicker: 'Gestión de medicación para cuidadores',
    title:
      'Cargue las dosificaciones del médico y nos aseguramos de que el adulto mayor las siga a tiempo.',
    subtitle:
      'Plataforma diseñada para encargados capacitados: registre el plan de medicación indicado por el médico y la aplicación del paciente recibirá recordatorios puntuales en cada horario, con confirmación de toma.',
    ctaPrimary: 'Comenzar a cargar dosificaciones',
    ctaSecondary: 'Conocer el flujo de trabajo',
  },
  vision: {
    title: 'Visión',
    body: 'Ser la plataforma de referencia en gestión de adherencia a tratamientos para adultos mayores: un flujo confiable y trazable que conecta la indicación médica, la carga del encargado y el recordatorio oportuno al paciente, reduciendo olvidos y errores de medicación.',
  },
  mission: {
    title: 'Misión',
    body: 'Recordar cada dosificación indicada por el médico de forma puntual y verificable. Le damos al encargado una herramienta técnica y clara para administrar tratamientos, y al adulto mayor una aplicación simple que solo le pide confirmar su toma.',
  },
  info: {
    title: 'Información',
    lead: 'El flujo completo funciona en tres pasos:',
    steps: [
      {
        title: '1. Indicación médica',
        body: 'El médico define el plan de medicación: fármaco, dosis, horarios y duración del tratamiento.',
      },
      {
        title: '2. Carga del encargado',
        body: 'El encargado capacitado registra cada dosificación en esta plataforma web, con control de dosis y horarios por paciente.',
      },
      {
        title: '3. Recordatorio al paciente',
        body: 'La aplicación móvil del adulto mayor avisa en el horario indicado, con recordatorios simples y registro de la toma confirmada.',
      },
    ],
    note: 'Próximamente: control de stock, historial de adherencia y reportes para el médico tratante.',
  },
  footer: 'Acompañamiento de Adulto Mayor — recordatorios de dosificaciones indicadas por su médico.',
} as const;

/** Landing copy for the elderly-person-facing mobile app. */
export const landingMobile = {
  hero: {
    title: 'Tus remedios a horario, sin preocupaciones 😊',
    subtitle:
      'Nosotros te avisamos cuándo tomar cada remedio. Vos solo tocás un botón para confirmar.',
    cta: 'Entrar a mi cuenta',
  },
  vision: {
    title: 'Nuestra visión',
    body: 'Que ningún adulto mayor se olvide de sus remedios: una aplicación simple, con letras grandes y avisos claros, siempre a tu lado.',
  },
  mission: {
    title: 'Nuestra misión',
    body: 'Recordarte tus medicamentos todos los días, en el horario que te indicó tu médico, de una manera fácil de entender.',
  },
  info: {
    title: '¿Cómo funciona?',
    steps: [
      {
        title: '1. Tu médico te receta 👨‍⚕️',
        body: 'Tu médico indica qué remedios tomar y a qué hora.',
      },
      {
        title: '2. Tu cuidador los carga 📝',
        body: 'Un familiar o cuidador anota tus remedios en la computadora.',
      },
      {
        title: '3. Te avisamos y confirmás 🔔',
        body: 'La aplicación suena en el horario y tocás el botón verde para confirmar.',
      },
    ],
  },
  footer: 'Acompañamiento de Adulto Mayor',
} as const;
