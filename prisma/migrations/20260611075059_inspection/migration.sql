BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Incoming] ADD [reInspectionDate] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[IncomingEditReturn] (
    [id] INT NOT NULL IDENTITY(1,1),
    [incomingId] INT NOT NULL,
    [timeStmp] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [IncomingEditReturn_status_df] DEFAULT 'use',
    CONSTRAINT [IncomingEditReturn_pkey] PRIMARY KEY CLUSTERED ([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
