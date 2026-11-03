'use strict';

const { PrismaClient } = require('@prisma/client');

let prismaClient = null;

function getPrismaClient() {
  if (!prismaClient) {
    prismaClient = new PrismaClient({ log: ['error', 'warn'] });
  }

  return prismaClient;
}

async function connectDatabase() {
  await getPrismaClient().$connect();
}

async function disconnectDatabase() {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}

module.exports = { getPrismaClient, connectDatabase, disconnectDatabase };
