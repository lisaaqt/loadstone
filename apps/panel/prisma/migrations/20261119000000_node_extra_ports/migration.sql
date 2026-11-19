-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "extraPorts" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
