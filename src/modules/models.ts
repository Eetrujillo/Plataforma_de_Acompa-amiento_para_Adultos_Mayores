/**
 * Dashboard module data models (S3). Every module record extends BaseRecord,
 * so the generic CRUD in `src/services/collections.ts` handles persistence
 * through the shared storage layer on web and mobile.
 */

import type { BaseRecord } from '@/services/collections';

export interface Dosificacion extends BaseRecord {
  medicamento: string;
  dosis: string;
  /** Schedule time in 24h format, `HH:MM`. */
  horario: string;
  notas: string;
}

export interface Alerta extends BaseRecord {
  titulo: string;
  mensaje: string;
  nivel: 'información' | 'importante';
  fecha: string;
}

export interface Tarea extends BaseRecord {
  titulo: string;
  completada: boolean;
}

export interface Cita extends BaseRecord {
  titulo: string;
  medico: string;
  lugar: string;
  /** ISO date `YYYY-MM-DD`. */
  fecha: string;
  hora: string;
}
