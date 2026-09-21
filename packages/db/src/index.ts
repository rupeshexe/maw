import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { mawPrisma?: PrismaClient };

export const prisma = globalForPrisma.mawPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.mawPrisma = prisma;

export { PrismaClient, Prisma };
export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
