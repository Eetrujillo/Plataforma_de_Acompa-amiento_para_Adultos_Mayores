import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { createFamilyLink } from '../src/modules/seniors/domain/seniorLink.ts';
import {
  FIXED_NOW,
  TEST_JWT_SECRET,
  VALID_BODY,
  errorEnvelope,
  get,
  makeHarness,
  post,
  withServer,
} from './support/registerHarness.ts';
import type { Harness } from './support/registerHarness.ts';

const SENIORS = '/api/seniors';

const PROFILE_BODY = {
  fullName: 'Rosa Pérez',
  timezone: 'America/Bogota',
  bloodType: 'O+',
  allergies: ['penicilina'],
  conditions: ['hipertensión'],
  medications: ['losartán'],
  emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
};

interface CaregiverSession {
  token: string;
  userId: string;
  email: string;
}

/**
 * Registra y loguea un familiar por HTTP real: la sesión del pipeline de tests
 * es la misma que la del panel (registro + verificación + login), tal como en
 * tests/authLogin.test.ts.
 */
async function seedCaregiver(
  harness: Harness,
  base: string,
  email: string,
): Promise<CaregiverSession> {
  const registered = await post(base, '/api/auth/register', { ...VALID_BODY, email });
  assert.equal(registered.status, 201, `cuerpo: ${registered.text}`);
  const userId = (registered.json as { user: { id: string } }).user.id;
  harness.repo.verifiedAt.set(email, FIXED_NOW);
  const logged = await post(base, '/api/auth/login', { email, password: VALID_BODY.password });
  assert.equal(logged.status, 200, `cuerpo: ${logged.text}`);
  const token = (logged.json as { token: string }).token;
  return { token, userId, email };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Da de alta un perfil por HTTP y devuelve su `id`. */
async function createSenior(
  base: string,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; status: number; text: string }> {
  const result = await post(base, SENIORS, { ...PROFILE_BODY, ...overrides }, auth(token));
  assert.equal(result.status, 201, `cuerpo: ${result.text}`);
  const body = result.json as { id: string };
  return { id: body.id, status: result.status, text: result.text };
}

test('S22: el alta responde 201 con exactamente la proyección pública, sin ficha médica', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'cuidadora1@example.com');
    const result = await post(base, SENIORS, PROFILE_BODY, auth(caregiver.token));
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), [
      'createdAt',
      'fullName',
      'id',
      'linkStatus',
      'timezone',
    ]);
    assert.equal(body['fullName'], 'Rosa Pérez');
    assert.equal(body['timezone'], 'America/Bogota');
    assert.equal(body['linkStatus'], 'PENDING');
    // El doble usa el reloj inyectado; el adaptador real deja que el motor
    // selle el documento, así que acá se pinea la forma ISO, no el instante.
    assert.match(String(body['createdAt']), /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/);
    assert.equal(typeof body['id'], 'string');
    for (const field of ['bloodType', 'allergies', 'conditions', 'medications', 'emergencyContact']) {
      assert.equal(field in body, false, `la proyección pública no puede traer ${field}`);
    }
  });
});

test('S17: timezone opcional cae a Bogotá, una zona real se respeta y una inventada no', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'cuidadora1@example.com');

    const sinZona = await post(
      base,
      SENIORS,
      // Sin el campo: cae a America/Bogota (S17), no 400.
      { ...PROFILE_BODY, timezone: undefined },
      auth(caregiver.token),
    );
    assert.equal(sinZona.status, 201, `cuerpo: ${sinZona.text}`);
    assert.equal((sinZona.json as { timezone: string }).timezone, 'America/Bogota');

    const madrid = await createSenior(base, caregiver.token, { timezone: 'Europe/Madrid' });
    const detalle = await get(base, `${SENIORS}/${madrid.id}`, auth(caregiver.token));
    assert.equal(detalle.status, 200, `cuerpo: ${detalle.text}`);
    assert.equal((detalle.json as { timezone: string }).timezone, 'Europe/Madrid');

    const inventada = await post(
      base,
      SENIORS,
      { ...PROFILE_BODY, timezone: 'Marte/Olympus' },
      auth(caregiver.token),
    );
    assert.equal(inventada.status, 400, `cuerpo: ${inventada.text}`);
    const envelope = errorEnvelope(inventada.json);
    assert.equal(envelope.code, 'INVALID_TIMEZONE');
  });
});

test('S18: un nombre que queda con menos de 3 caracteres responde 400 INVALID_NAME', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'cuidadora1@example.com');
    const result = await post(
      base,
      SENIORS,
      { ...PROFILE_BODY, fullName: 'Ab' },
      auth(caregiver.token),
    );
    assert.equal(result.status, 400, `cuerpo: ${result.text}`);
    const envelope = errorEnvelope(result.json);
    assert.equal(envelope.code, 'INVALID_NAME');
  });
});

test('S16: ficha inválida responde 400 con el código del campo que falla', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'cuidadora1@example.com');
    const casos: { body: Record<string, unknown>; code: string; cual: string }[] = [
      { body: { bloodType: 'Z+' }, code: 'INVALID_BLOOD_TYPE', cual: 'bloodType' },
      {
        body: { allergies: Array.from({ length: 21 }, () => 'alergia') },
        code: 'INVALID_ALLERGIES',
        cual: '21 alergias',
      },
      {
        body: { emergencyContact: { fullName: 'Ana Pérez', phone: 'no-phone' } },
        code: 'INVALID_EMERGENCY_CONTACT',
        cual: 'contacto sin teléfono válido',
      },
      { body: { allergies: 'no-es-array' }, code: 'INVALID_BODY', cual: 'allergies no array' },
      {
        body: { allergies: [42] },
        code: 'INVALID_BODY',
        cual: 'allergies con ítem no textual',
      },
    ];
    for (const caso of casos) {
      const result = await post(base, SENIORS, { ...PROFILE_BODY, ...caso.body }, auth(caregiver.token));
      assert.equal(result.status, 400, `cuerpo (${caso.cual}): ${result.text}`);
      const envelope = errorEnvelope(result.json);
      assert.equal(envelope.code, caso.code, `código (${caso.cual}): ${envelope.code}`);
    }
    // S16: nada se escribió — todos los rechazos son previos a la escritura.
    assert.equal(harness.seniorRepo.profiles.size, 0);
  });
});

test('S14: un caregiverId ajeno en el cuerpo se ignora: la propiedad sale de la sesión', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const alice = await seedCaregiver(harness, base, 'alice@example.com');
    const bob = await seedCaregiver(harness, base, 'bob@example.com');

    const created = await post(
      base,
      SENIORS,
      // El cuerpo intenta adjudicar el perfil a otra cuenta (S14).
      { ...PROFILE_BODY, caregiverId: bob.userId },
      auth(alice.token),
    );
    assert.equal(created.status, 201, `cuerpo: ${created.text}`);
    const seniorId = (created.json as { id: string }).id;

    const listaBob = await get(base, SENIORS, auth(bob.token));
    assert.equal(listaBob.status, 200, `cuerpo: ${listaBob.text}`);
    assert.deepEqual(listaBob.json, { seniors: [] });

    const listaAlice = await get(base, SENIORS, auth(alice.token));
    assert.equal(listaAlice.status, 200, `cuerpo: ${listaAlice.text}`);
    const seniors = (listaAlice.json as { seniors: { id: string }[] }).seniors;
    assert.deepEqual(
      seniors.map((senior) => senior.id),
      [seniorId],
    );
  });
});

test('S21: la lista de un familiar sin perfiles responde 200 con {seniors: []}', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'cuidadora1@example.com');
    const result = await get(base, SENIORS, auth(caregiver.token));
    assert.equal(result.status, 200, `cuerpo: ${result.text}`);
    assert.deepEqual(result.json, { seniors: [] });
  });
});

test('S1/S2/S4: los N familiares vinculados ven lista y detalle; el no vinculado no ve nada', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const primera = await seedCaregiver(harness, base, 'primera@example.com');
    const segunda = await seedCaregiver(harness, base, 'segunda@example.com');
    const tercera = await seedCaregiver(harness, base, 'tercera@example.com');
    // S2: ambos familiares hacen lo mismo, no hay roles asimétricos por HTTP.
    const { id } = await createSenior(base, primera.token);
    // S1: el segundo familiar entra con un vínculo FAMILY activo (HU-005/D1).
    await harness.seniorRepo.addCaregiverLink(
      createFamilyLink({
        seniorId: id,
        caregiverId: segunda.userId,
        createdAt: FIXED_NOW,
        invitedBy: primera.userId,
      }),
    );
    harness.seniorRepo.caregiverNames.set(primera.userId, 'Primera Cuidadora');

    for (const familiar of [primera, segunda]) {
      const lista = await get(base, SENIORS, auth(familiar.token));
      assert.equal(lista.status, 200, `cuerpo: ${lista.text}`);
      const seniors = (lista.json as { seniors: { id: string }[] }).seniors;
      assert.deepEqual(
        seniors.map((senior) => senior.id),
        [id],
        `la lista del familiar ${familiar.email} debe incluir al adulto`,
      );
      const detalle = await get(base, `${SENIORS}/${id}`, auth(familiar.token));
      assert.equal(detalle.status, 200, `cuerpo: ${detalle.text}`);
      assert.equal((detalle.json as { id: string }).id, id);
    }

    // S4: quien no tiene vínculo no ve el perfil en la lista...
    const listaAjena = await get(base, SENIORS, auth(tercera.token));
    assert.equal(listaAjena.status, 200, `cuerpo: ${listaAjena.text}`);
    assert.deepEqual(listaAjena.json, { seniors: [] });
  });
});

test('S3: agregar un segundo familiar no altera el acceso del primero', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const primera = await seedCaregiver(harness, base, 'primera@example.com');
    const segunda = await seedCaregiver(harness, base, 'segunda@example.com');
    const { id } = await createSenior(base, primera.token);
    assert.equal(harness.seniorRepo.links.length, 1);

    await harness.seniorRepo.addCaregiverLink(
      createFamilyLink({
        seniorId: id,
        caregiverId: segunda.userId,
        createdAt: FIXED_NOW,
        invitedBy: primera.userId,
      }),
    );
    // S3: el vínculo del dueño sigue activo y el total de vínculos es 2, no se
    // duplica ni se revoca ninguno.
    assert.equal(harness.seniorRepo.links.length, 2);
    assert.equal(
      harness.seniorRepo.links.filter((link) => link.status === 'ACTIVE').length,
      2,
    );
    const detalle = await get(base, `${SENIORS}/${id}`, auth(primera.token));
    assert.equal(detalle.status, 200, `cuerpo: ${detalle.text}`);
    assert.equal((detalle.json as { id: string }).id, id);
  });
});

test('S19: ajeno, inexistente, malformado e id de caregiver responde el MISMO 404', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const primera = await seedCaregiver(harness, base, 'primera@example.com');
    const segunda = await seedCaregiver(harness, base, 'segunda@example.com');
    const { id: perfilAjeno } = await createSenior(base, segunda.token);
    const inexistente = `${'a'.repeat(23)}b`;

    const casos = [
      perfilAjeno, // perfil de otro familiar (S5)
      inexistente, // 24 hex que no existe
      'no-es-un-id', // malformado: nunca llega al driver
      primera.userId, // id de un CAREGIVER, no de un senior
    ];
    const texts: string[] = [];
    for (const id of casos) {
      const result = await get(base, `${SENIORS}/${id}`, auth(primera.token));
      assert.equal(result.status, 404, `cuerpo (id ${id}): ${result.text}`);
      const envelope = errorEnvelope(result.json);
      assert.equal(envelope.code, 'SENIOR_NOT_FOUND');
      assert.equal(envelope.message, 'No encontramos ese perfil');
      assert.equal(envelope.details, undefined, 'el 404 no delata cuál de los casos fue');
      texts.push(result.text);
    }
    // El mismo 404, byte a byte: distinguirlos confirmaría que un id existe.
    assert.equal(new Set(texts).size, 1);
  });
});

test('S20: sin token 401 UNAUTHORIZED; con token de rol SENIOR 403 FORBIDDEN', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const sinToken = await get(base, SENIORS);
    assert.equal(sinToken.status, 401, `cuerpo: ${sinToken.text}`);
    assert.equal(errorEnvelope(sinToken.json).code, 'UNAUTHORIZED');

    // Sesión con rol SENIOR: sembramos la cuenta directamente (los seniors
    // no tienen credenciales, S15): el token es válido, el rol no sirve (S20).
    const seniorEmail = 'senior@example.com';
    harness.repo.users.set(seniorEmail, {
      id: 'senior-0000000000000001',
      email: seniorEmail,
      fullName: 'Rosa Pérez',
      role: 'SENIOR',
    });
    const seniorToken = jwt.sign(
      { sub: 'senior-0000000000000001', email: seniorEmail, role: 'SENIOR', sv: 0 },
      TEST_JWT_SECRET,
    );
    const rolIncorrecto = await get(base, SENIORS, auth(seniorToken));
    assert.equal(rolIncorrecto.status, 403, `cuerpo: ${rolIncorrecto.text}`);
    const envelope = errorEnvelope(rolIncorrecto.json);
    assert.equal(envelope.code, 'FORBIDDEN');
    assert.equal(envelope.message, 'La ruta es solo para el rol CAREGIVER');
  });
});

test('S7/S11: la ficha médica via en ruta propia; el detalle público nunca la trae', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const primera = await seedCaregiver(harness, base, 'primera@example.com');
    const segunda = await seedCaregiver(harness, base, 'segunda@example.com');
    const { id } = await createSenior(base, primera.token);
    await harness.seniorRepo.addCaregiverLink(
      createFamilyLink({
        seniorId: id,
        caregiverId: segunda.userId,
        createdAt: FIXED_NOW,
        invitedBy: primera.userId,
      }),
    );

    const ficha = await get(base, `${SENIORS}/${id}/medical`, auth(segunda.token));
    assert.equal(ficha.status, 200, `cuerpo: ${ficha.text}`);
    const fichaBody = ficha.json as Record<string, unknown>;
    assert.deepEqual(Object.keys(fichaBody).sort(), [
      'allergies',
      'bloodType',
      'conditions',
      'emergencyContact',
      'medications',
    ]);
    assert.equal(fichaBody['bloodType'], 'O+');
    assert.deepEqual(fichaBody['allergies'], ['penicilina']);
    assert.deepEqual(fichaBody['conditions'], ['hipertensión']);
    assert.deepEqual(fichaBody['medications'], ['losartán']);
    assert.deepEqual(fichaBody['emergencyContact'], {
      fullName: 'Ana Pérez',
      phone: '+573001234567',
    });

    // El familiar vinculado equivale (S2): el dueño también la ve.
    const fichaDueño = await get(base, `${SENIORS}/${id}/medical`, auth(primera.token));
    assert.equal(fichaDueño.status, 200, `cuerpo: ${fichaDueño.text}`);

    // El no vinculado recibe el mismo 404 de propiedad (S5/S10).
    const tercera = await seedCaregiver(harness, base, 'tercera@example.com');
    const fichaAjena = await get(base, `${SENIORS}/${id}/medical`, auth(tercera.token));
    assert.equal(fichaAjena.status, 404, `cuerpo: ${fichaAjena.text}`);
    assert.equal(errorEnvelope(fichaAjena.json).code, 'SENIOR_NOT_FOUND');

    // S11: el detalle público del alta jamás expone la ficha.
    const detalle = await get(base, `${SENIORS}/${id}`, auth(segunda.token));
    assert.equal(detalle.status, 200, `cuerpo: ${detalle.text}`);
    const publico = detalle.json as Record<string, unknown>;
    for (const field of ['bloodType', 'allergies', 'conditions', 'medications', 'emergencyContact']) {
      assert.equal(field in publico, false, `el detalle público no puede traer ${field}`);
    }
  });
});

test('S4/caregivers: el listado de familiares solo lo ve un vinculado, con N familiares', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const primera = await seedCaregiver(harness, base, 'primera@example.com');
    const segunda = await seedCaregiver(harness, base, 'segunda@example.com');
    const tercera = await seedCaregiver(harness, base, 'tercera@example.com');
    const { id } = await createSenior(base, primera.token);
    await harness.seniorRepo.addCaregiverLink(
      createFamilyLink({
        seniorId: id,
        caregiverId: segunda.userId,
        createdAt: FIXED_NOW,
        invitedBy: primera.userId,
      }),
    );
    harness.seniorRepo.caregiverNames.set(primera.userId, 'Primera Cuidadora');
    harness.seniorRepo.caregiverNames.set(segunda.userId, 'Segunda Cuidadora');

    const lista = await get(base, `${SENIORS}/${id}/caregivers`, auth(segunda.token));
    assert.equal(lista.status, 200, `cuerpo: ${lista.text}`);
    const body = lista.json as {
      caregivers: { id: string; fullName: string; role: string; linkedAt: string }[];
    };
    assert.deepEqual(
      body.caregivers.map((caregiver) => caregiver.fullName),
      ['Primera Cuidadora', 'Segunda Cuidadora'],
    );
    // OWNER primero (quien dio el alta), FAMILY después: el rol es informativo (S2/D2).
    assert.deepEqual(
      body.caregivers.map((caregiver) => caregiver.role),
      ['OWNER', 'FAMILY'],
    );
    for (const caregiver of body.caregivers) {
      assert.deepEqual(Object.keys(caregiver).sort(), ['fullName', 'id', 'linkedAt', 'role']);
      assert.equal(caregiver.linkedAt, FIXED_NOW.toISOString());
    }

    const ajena = await get(base, `${SENIORS}/${id}/caregivers`, auth(tercera.token));
    assert.equal(ajena.status, 404, `cuerpo: ${ajena.text}`);
    assert.equal(errorEnvelope(ajena.json).code, 'SENIOR_NOT_FOUND');
  });
});
