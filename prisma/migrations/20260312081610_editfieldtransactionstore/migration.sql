BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TransactionStore] ADD [stockNote] NVARCHAR(1000);

-- AlterTable
ALTER TABLE [dbo].[TransactionStoreHistory] ADD [stockNote] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
