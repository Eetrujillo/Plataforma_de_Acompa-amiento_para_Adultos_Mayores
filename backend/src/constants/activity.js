const ACTIVITY_ICONS = [
  { key: 'medicina', label: 'Medicina', emoji: '💊' },
  { key: 'comida', label: 'Comida', emoji: '🍽️' },
  { key: 'ejercicio', label: 'Ejercicio', emoji: '🏃' },
  { key: 'cita', label: 'Cita médica', emoji: '📅' },
  { key: 'paseo', label: 'Paseo', emoji: '🌳' },
  { key: 'otro', label: 'Otro', emoji: '⭐' },
];

const ACTIVITY_ICON_KEYS = ACTIVITY_ICONS.map((icon) => icon.key);

const REPEAT_TYPES = ['once', 'daily', 'weekly'];

function getActivityIcon(key) {
  return ACTIVITY_ICONS.find((icon) => icon.key === key) || ACTIVITY_ICONS[ACTIVITY_ICONS.length - 1];
}

module.exports = {
  ACTIVITY_ICONS,
  ACTIVITY_ICON_KEYS,
  REPEAT_TYPES,
  getActivityIcon,
};
