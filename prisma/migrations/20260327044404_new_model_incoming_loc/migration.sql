BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[IncomingLoc] (
    [id] INT NOT NULL IDENTITY(1,1),
    [incomingId] INT NOT NULL,
    [coil] INT NOT NULL,
    [qty] INT NOT NULL,
    [jobId] INT NOT NULL,
    [timeStmp] DATETIME2 NOT NULL CONSTRAINT [IncomingLoc_timeStmp_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [IncomingLoc_status_df] DEFAULT 'use',
    CONSTRAINT [IncomingLoc_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[IncomingLoc] ADD CONSTRAINT [IncomingLoc_incomingId_fkey] FOREIGN KEY ([incomingId]) REFERENCES [dbo].[Incoming]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[IncomingLoc] ADD CONSTRAINT [IncomingLoc_jobId_fkey] FOREIGN KEY ([jobId]) REFERENCES [dbo].[Job]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
