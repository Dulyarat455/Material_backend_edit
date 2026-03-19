BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Job] (
    [id] INT NOT NULL IDENTITY(1,1),
    [incomingId] INT NOT NULL,
    [areaId] INT NOT NULL,
    [requestByUserId] INT NOT NULL,
    [requestTime] DATETIME2 NOT NULL CONSTRAINT [Job_requestTime_df] DEFAULT CURRENT_TIMESTAMP,
    [inchargeByUserId] INT,
    [inchargeTime] DATETIME2,
    [type] NVARCHAR(1000) NOT NULL,
    [materialId] INT NOT NULL,
    [state] NVARCHAR(1000) NOT NULL,
    [remark] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Job_status_df] DEFAULT 'use',
    CONSTRAINT [Job_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StockOut] (
    [id] INT NOT NULL IDENTITY(1,1),
    [incomingId] INT NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [inchargeByUserId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [StockOut_status_df] DEFAULT 'use',
    CONSTRAINT [StockOut_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Job] ADD CONSTRAINT [Job_incomingId_fkey] FOREIGN KEY ([incomingId]) REFERENCES [dbo].[Incoming]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Job] ADD CONSTRAINT [Job_areaId_fkey] FOREIGN KEY ([areaId]) REFERENCES [dbo].[Area]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Job] ADD CONSTRAINT [Job_requestByUserId_fkey] FOREIGN KEY ([requestByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Job] ADD CONSTRAINT [Job_materialId_fkey] FOREIGN KEY ([materialId]) REFERENCES [dbo].[Material]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[StockOut] ADD CONSTRAINT [StockOut_incomingId_fkey] FOREIGN KEY ([incomingId]) REFERENCES [dbo].[Incoming]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[StockOut] ADD CONSTRAINT [StockOut_inchargeByUserId_fkey] FOREIGN KEY ([inchargeByUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
