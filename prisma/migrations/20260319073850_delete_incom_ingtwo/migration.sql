/*
  Warnings:

  - You are about to drop the column `incomingId` on the `Job` table. All the data in the column will be lost.
  - Added the required column `priority` to the `Job` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[Job] DROP CONSTRAINT [Job_incomingId_fkey];

-- AlterTable
ALTER TABLE [dbo].[Job] DROP COLUMN [incomingId];
ALTER TABLE [dbo].[Job] ADD [priority] NVARCHAR(1000) NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
