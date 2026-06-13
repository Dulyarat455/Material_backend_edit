BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[LogEditLastReturn] (
    [id] INT NOT NULL IDENTITY(1,1),
    [historyId] INT NOT NULL,
    [lastReturn] NVARCHAR(1000) NOT NULL,
    [lastReturnId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [LogEditLastReturn_status_df] DEFAULT 'use',
    CONSTRAINT [LogEditLastReturn_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LogEditInSpection] (
    [id] INT NOT NULL IDENTITY(1,1),
    [historyId] INT NOT NULL,
    [incomingId] INT NOT NULL,
    [inSpection] NVARCHAR(1000) NOT NULL,
    [timeStmp] DATETIME2 NOT NULL CONSTRAINT [LogEditInSpection_timeStmp_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [LogEditInSpection_status_df] DEFAULT 'use',
    CONSTRAINT [LogEditInSpection_pkey] PRIMARY KEY CLUSTERED ([id])
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
