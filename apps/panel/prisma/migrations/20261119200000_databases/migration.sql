-- CreateEnum
CREATE TYPE "DatabaseEngine" AS ENUM ('MYSQL', 'MARIADB', 'MONGODB');

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "databaseLimit" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "DatabaseHost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engine" "DatabaseEngine" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "connectHost" TEXT,
    "maxDatabases" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatabaseHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerDatabase" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "remote" TEXT NOT NULL DEFAULT '%',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerDatabase_serverId_idx" ON "ServerDatabase"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerDatabase_hostId_name_key" ON "ServerDatabase"("hostId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServerDatabase_hostId_username_key" ON "ServerDatabase"("hostId", "username");

-- AddForeignKey
ALTER TABLE "ServerDatabase" ADD CONSTRAINT "ServerDatabase_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerDatabase" ADD CONSTRAINT "ServerDatabase_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "DatabaseHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

