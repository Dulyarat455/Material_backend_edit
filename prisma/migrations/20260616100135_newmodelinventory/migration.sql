BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[RecordInventory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [incomingId] INT NOT NULL,
    [storeId] INT NOT NULL,
    [coil] INT NOT NULL,
    [qty] FLOAT(53) NOT NULL,
    [totalPrice] FLOAT(53) NOT NULL,
    [lineNo] NVARCHAR(1000) NOT NULL,
    [timeStmp] DATETIME2 NOT NULL,
    CONSTRAINT [RecordInventory_pkey] PRIMARY KEY CLUSTERED ([id])
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
