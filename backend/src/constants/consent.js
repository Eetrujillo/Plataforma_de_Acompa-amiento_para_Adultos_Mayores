const CONSENT_VERSION = '1.0';

const CONSENT_TEXT = {
  version: CONSENT_VERSION,
  title: 'Qué información compartes con tu familiar',
  intro:
    'Para que tu familiar pueda acompañarte, la app comparte con él o ella solamente esta información:',
  items: [
    {
      title: 'Si cumpliste tus actividades',
      description:
        'Tu familiar puede ver si marcaste como hechas las actividades que te recordamos.',
    },
    {
      title: 'Tus alertas de ayuda',
      description:
        'Si usas el botón de ayuda, tu familiar recibe el aviso para poder comunicarse contigo.',
    },
    {
      title: 'Tu ubicación cuando pides ayuda',
      description:
        'Solo cuando usas el botón de ayuda se comparte tu ubicación. No se comparte en otro momento.',
    },
  ],
  closing:
    'Tú decides. Si no aceptas, no se compartirá nada con tu familiar y la app no quedará vinculada.',
  legal:
    'Los datos de salud y ubicación son datos sensibles según la Ley 1581 de 2012 de Colombia. ' +
    'Este texto debe ser revisado y validado por un asesor jurídico antes de publicarse.',
  acceptLabel: 'Acepto que se comparta esta información con mi familiar',
  rejectMessage: 'No se compartirá nada. La app no quedará vinculada.',
};

module.exports = {
  CONSENT_TEXT,
  CONSENT_VERSION,
};
