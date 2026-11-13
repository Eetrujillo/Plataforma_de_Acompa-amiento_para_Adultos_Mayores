/**
 * Dashboard module registry (S3): the four functional areas. The dashboard
 * home renders cards from this list; each module screen owns its colors.
 */

export interface DashboardModule {
  route: string;
  title: string;
  titleMobile: string;
  description: string;
  emoji: string;
}

export const dashboardModules: DashboardModule[] = [
  {
    route: '/dosificaciones',
    title: 'Dosificación',
    titleMobile: 'Mis remedios',
    description: 'Medicamentos, dosis y horarios indicados por el médico',
    emoji: '💊',
  },
  {
    route: '/alertas',
    title: 'Alertas',
    titleMobile: 'Mis avisos',
    description: 'Recordatorios y avisos importantes del día',
    emoji: '🔔',
  },
  {
    route: '/tareas',
    title: 'Tareas',
    titleMobile: 'Mis quehaceres',
    description: 'Actividades diarias con estado pendiente/completada',
    emoji: '📝',
  },
  {
    route: '/citas',
    title: 'Citas',
    titleMobile: 'Mis citas',
    description: 'Turnos médicos con lugar, fecha y hora',
    emoji: '📅',
  },
];
