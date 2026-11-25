/**
 * HU-005/HU-007 — reglas puras del perfil del adulto mayor.
 * S1-S3, S6-S9, S12-S13, S15-S17 del documento odd/tasks/hu-005-seniors-vinculos.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOOD_TYPES,
  DEFAULT_TIMEZONE,
  createSenior,
  isBloodType,
  isValidSeniorFullName,
  isValidTextList,
  isValidTimezone,
  normalizeFullName,
  normalizeTextList,
  resolveTimezone,
  toPublicSenior,
  toSeniorMedicalRecord,
} from '../src/modules/seniors/domain/seniorProfile.ts';
import type { SeniorProfileRecord } from '../src/modules/seniors/domain/seniorProfile.ts';

const VALID_INPUT = {
  fullName: '  Rosa   Pérez  ',
  bloodType: 'O+' as const,
  allergies: [' penicilina '],
  conditions: [' hipertensión'],
  medications: ['losartán'],
  emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
};

function record(overrides: Partial<SeniorProfileRecord> = {}): SeniorProfileRecord {
  return {
    id: '507f1f77bcf86cd799439011',
    fullName: 'Rosa Pérez',
    timezone: DEFAULT_TIMEZONE,
    linkStatus: 'PENDING',
    createdAt: new Date('2026-11-05T20:41:00.000Z'),
    bloodType: 'O+',
    allergies: ['penicilina'],
    conditions: ['hipertensión'],
    medications: ['losartán'],
    emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
    ...overrides,
  };
}

// S6, S9, S12, S15 — el documento que se persiste.
test('createSenior arma un User SENIOR pendiente, sin credenciales ni consentimiento', () => {
  const senior = createSenior(VALID_INPUT);

  assert.equal(senior.role, 'SENIOR');
  assert.equal(senior.linkStatus, 'PENDING');
  assert.equal(senior.passwordHash, null);
  assert.equal(senior.acceptedTermsAt, null);
  assert.equal(senior.termsVersion, null);
  assert.equal(senior.timezone, DEFAULT_TIMEZONE);
  assert.equal(senior.fullName, 'Rosa Pérez');
  assert.equal(senior.bloodType, 'O+');
});

// S15 — correo sintético único: el índice único de `email` sigue siendo honesto.
test('createSenior emite un correo sintético único por perfil', () => {
  const first = createSenior(VALID_INPUT);
  const second = createSenior(VALID_INPUT);

  assert.match(first.email, /^senior\+[0-9a-f]{12}@seniors\.local$/);
  assert.match(second.email, /^senior\+[0-9a-f]{12}@seniors\.local$/);
  assert.notEqual(first.email, second.email);
});

// S7 — la ficha médica es parte del perfil y viaja normalizada.
test('createSenior guarda la ficha médica normalizada', () => {
  const senior = createSenior(VALID_INPUT);

  assert.deepEqual(senior.allergies, ['penicilina']);
  assert.deepEqual(senior.conditions, ['hipertensión']);
  assert.deepEqual(senior.medications, ['losartán']);
  assert.deepEqual(senior.emergencyContact, { fullName: 'Ana Pérez', phone: '+573001234567' });
});

// S17 — zona horaria por defecto.
test('resolveTimezone cae a Bogotá solo cuando el valor falta o viene vacío', () => {
  assert.equal(resolveTimezone(undefined), DEFAULT_TIMEZONE);
  assert.equal(resolveTimezone(null), DEFAULT_TIMEZONE);
  assert.equal(resolveTimezone('   '), DEFAULT_TIMEZONE);
  assert.equal(resolveTimezone(' America/Bogota '), 'America/Bogota');
  assert.equal(resolveTimezone('Europe/Madrid'), 'Europe/Madrid');
});

// S17 — una zona inventada no se puede convertir en Bogotá en silencio.
test('isValidTimezone rechaza zonas que no existen en la base IANA', () => {
  assert.equal(isValidTimezone('America/Bogota'), true);
  assert.equal(isValidTimezone('Europe/Madrid'), true);
  assert.equal(isValidTimezone('Marte/Olympus'), false);
  assert.equal(isValidTimezone('America/NoExiste'), false);
});

// S16 — grupo sanguíneo de enumeración cerrada.
test('isBloodType acepta solo la enumeración cerrada', () => {
  for (const value of BLOOD_TYPES) assert.equal(isBloodType(value), true);
  assert.equal(isBloodType('O+'), true);
  assert.equal(isBloodType('o+'), false);
  assert.equal(isBloodType('Z+'), false);
  assert.equal(isBloodType(''), false);
  assert.equal(isBloodType(0), false);
  assert.equal(BLOOD_TYPES.length, 8);
});

// S16 — listas acotadas.
test('isValidTextList acota cantidad, longitud y contenido', () => {
  assert.equal(isValidTextList([]), true);
  assert.equal(isValidTextList(['penicilina', 'polen']), true);
  assert.equal(isValidTextList(['']), false);
  assert.equal(isValidTextList(['   ']), false);
  assert.equal(isValidTextList(['x'.repeat(81)]), false);
  assert.equal(isValidTextList(Array.from({ length: 21 }, () => 'algo')), false);
  assert.equal(isValidTextList(['x'.repeat(80)]), true);
});

test('normalizeTextList recorta cada ítem sin reordenar ni deduplicar', () => {
  assert.deepEqual(normalizeTextList([' b ', 'a', 'b']), ['b', 'a', 'b']);
});

// S16 — nombre del perfil: mínimo 3 tras normalizar y un máximo explícito.
test('isValidSeniorFullName exige de 3 a 120 caracteres tras normalizar', () => {
  assert.equal(isValidSeniorFullName('  Rosa   Pérez '), true);
  assert.equal(normalizeFullName('  Rosa   Pérez '), 'Rosa Pérez');
  assert.equal(isValidSeniorFullName('  R  '), false);
  assert.equal(isValidSeniorFullName('x'.repeat(120)), true);
  assert.equal(isValidSeniorFullName('x'.repeat(121)), false);
});

// S16 — la fábrica falla ruidosamente si el caso de uso la llamó mal.
test('createSenior rechaza un perfil inválido en la fábrica', () => {
  assert.throws(() => createSenior({ ...VALID_INPUT, fullName: ' A ' }));
  assert.throws(() => createSenior({ ...VALID_INPUT, bloodType: 'Z+' as never }));
  assert.throws(() => createSenior({ ...VALID_INPUT, allergies: ['x'.repeat(81)] }));
  assert.throws(() => createSenior({ ...VALID_INPUT, timezone: 'Marte/Olympus' }));
  assert.throws(() =>
    createSenior({ ...VALID_INPUT, emergencyContact: { fullName: 'Ana Pérez', phone: 'abc' } }),
  );
});

// S11 — la proyección pública por lista blanca no filtra la ficha médica.
test('toPublicSenior devuelve exactamente los cinco campos del contrato', () => {
  const publicSenior = toPublicSenior(record());

  assert.deepEqual(Object.keys(publicSenior).sort(), [
    'createdAt',
    'fullName',
    'id',
    'linkStatus',
    'timezone',
  ]);
  assert.equal(publicSenior.id, '507f1f77bcf86cd799439011');
  assert.equal(publicSenior.linkStatus, 'PENDING');
  assert.equal(JSON.stringify(publicSenior).includes('penicilina'), false);
});

// S7, S11 — la ficha médica es la otra vista, y solo la ven los vinculados
// (el guardia vive en el caso de uso; acá se pinea lo que devuelve).
test('toSeniorMedicalRecord devuelve solo la ficha médica', () => {
  assert.deepEqual(toSeniorMedicalRecord(record()), {
    bloodType: 'O+',
    allergies: ['penicilina'],
    conditions: ['hipertensión'],
    medications: ['losartán'],
    emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
  });
});
