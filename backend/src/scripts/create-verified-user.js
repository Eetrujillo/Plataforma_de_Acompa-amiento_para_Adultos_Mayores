require('dotenv').config();

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/mearn_db';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*\p{L})(?=.*\d).{8,}$/u;
const PRIVACY_POLICY_VERSION = '1.0';

async function askConfirmation(question) {
  const confirmation = readline.createInterface({ input: stdin, output: stdout });
  const answer = await confirmation.question(question);
  confirmation.close();
  return answer.trim().toUpperCase() === 'SI';
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    let value = '';

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    }

    function onData(character) {
      if (character === '\u0003') {
        cleanup();
        stdout.write('\n');
        reject(new Error('Operación cancelada.'));
        return;
      }

      if (character === '\r' || character === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(value);
        return;
      }

      if (character === '\u007f' || character === '\b') {
        value = Array.from(value).slice(0, -1).join('');
        return;
      }

      if (character >= ' ') {
        value += character;
      }
    }

    stdin.on('data', onData);
  });
}

async function createVerifiedUser() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Ejecuta este comando en una terminal interactiva.');
  }

  const prompt = readline.createInterface({ input: stdin, output: stdout });

  try {
    const name = (await prompt.question('Nombre: ')).trim();
    const email = (await prompt.question('Correo: ')).trim().toLowerCase();
    prompt.close();

    if (name.length < 2 || name.length > 80) {
      throw new Error('El nombre debe tener entre 2 y 80 caracteres.');
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('Escribe un correo electrónico válido.');
    }

    const existing = await User.findOne({ email }).select('emailVerified');
    if (existing) {
      if (existing.emailVerified) {
        throw new Error('La cuenta ya está verificada. Inicia sesión con ella.');
      }

      const confirmVerification = await askConfirmation(
        'La cuenta existe y no está verificada. ¿Marcarla como verificada? Escribe SI: '
      );
      if (!confirmVerification) {
        throw new Error('No se modificó la cuenta.');
      }

      const result = await User.updateOne(
        { _id: existing._id, emailVerified: { $ne: true } },
        { $set: { emailVerified: true, emailVerifiedAt: new Date() } }
      );
      if (result.modifiedCount !== 1) {
        throw new Error('No se pudo verificar la cuenta; vuelve a consultar su estado.');
      }

      console.log(`Correo verificado para ${email}. Inicia sesión con tu contraseña actual.`);
      return;
    }

    const password = await askHidden('Contraseña (mínimo 8 caracteres, letras y números): ');
    const passwordConfirmation = await askHidden('Repite la contraseña: ');
    if (password !== passwordConfirmation) {
      throw new Error('Las contraseñas no coinciden.');
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new Error('La contraseña debe tener mínimo 8 caracteres, letras y números.');
    }

    const acceptedPrivacyPolicy = await askConfirmation(
      '¿Aceptas la política de privacidad para esta cuenta? Escribe SI: '
    );
    if (!acceptedPrivacyPolicy) {
      throw new Error('No se creó la cuenta porque no se confirmó la aceptación de privacidad.');
    }

    const now = new Date();
    await User.create({
      name,
      email,
      password,
      role: 'familiar',
      emailVerified: true,
      emailVerifiedAt: now,
      privacyPolicy: {
        version: PRIVACY_POLICY_VERSION,
        acceptedAt: now,
      },
    });

    console.log(`Cuenta verificada creada para ${email}. Ya puedes iniciar sesión.`);
  } finally {
    prompt.close();
  }
}

(async () => {
  try {
    await mongoose.connect(MONGO_URL);
    await createVerifiedUser();
  } catch (error) {
    console.error('No se pudo crear la cuenta:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
})();
