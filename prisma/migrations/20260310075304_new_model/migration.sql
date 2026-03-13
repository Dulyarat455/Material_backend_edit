BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Store] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Store_status_df] DEFAULT 'use',
    CONSTRAINT [Store_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Incoming] (
    [id] INT NOT NULL IDENTITY(1,1),
    [jobNo] NVARCHAR(1000) NOT NULL,
    [yearMonth] NVARCHAR(1000) NOT NULL,
    [recivedDate] NVARCHAR(1000) NOT NULL,
    [inspector] NVARCHAR(1000) NOT NULL,
    [unloadBy] NVARCHAR(1000) NOT NULL,
    [invoiceOne] NVARCHAR(1000) NOT NULL,
    [taxLnvNo] NVARCHAR(1000) NOT NULL,
    [materialNo] NVARCHAR(1000) NOT NULL,
    [unitPrice] NVARCHAR(1000) NOT NULL,
    [qtyOfPalletPack] NVARCHAR(1000) NOT NULL,
    [coil] INT NOT NULL,
    [qtyKgsPcs] INT NOT NULL,
    [unit] NVARCHAR(1000) NOT NULL,
    [kgsCoil] NVARCHAR(1000) NOT NULL,
    [odCoil] NVARCHAR(1000) NOT NULL,
    [remark] NVARCHAR(1000) NOT NULL,
    [millSheet] NVARCHAR(1000) NOT NULL,
    [itemName] NVARCHAR(1000) NOT NULL,
    [itemSpec] NVARCHAR(1000) NOT NULL,
    [lotNo] NVARCHAR(1000) NOT NULL,
    [packing] NVARCHAR(1000) NOT NULL,
    [rosh] NVARCHAR(1000) NOT NULL,
    [result] NVARCHAR(1000) NOT NULL,
    [supplier] NVARCHAR(1000) NOT NULL,
    [amount] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Incoming_status_df] DEFAULT 'use',
    CONSTRAINT [Incoming_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TimeStateIncoming] (
    [id] INT NOT NULL IDENTITY(1,1),
    [incomingId] INT NOT NULL,
    [areaId] INT NOT NULL,
    [state] NVARCHAR(1000) NOT NULL,
    [timeStmp] DATETIME2 NOT NULL CONSTRAINT [TimeStateIncoming_timeStmp_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TimeStateIncoming_status_df] DEFAULT 'use',
    CONSTRAINT [TimeStateIncoming_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TransactionStore] (
    [id] INT NOT NULL IDENTITY(1,1),
    [storeId] INT NOT NULL,
    [incomingId] INT NOT NULL,
    [timeStmp] DATETIME2 NOT NULL CONSTRAINT [TransactionStore_timeStmp_df] DEFAULT CURRENT_TIMESTAMP,
    [userId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TransactionStore_status_df] DEFAULT 'use',
    CONSTRAINT [TransactionStore_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TransactionStoreHistory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [storeId] INT NOT NULL,
    [incomingId] INT NOT NULL,
    [timeStmp] DATETIME2 NOT NULL CONSTRAINT [TransactionStoreHistory_timeStmp_df] DEFAULT CURRENT_TIMESTAMP,
    [userId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TransactionStoreHistory_status_df] DEFAULT 'use',
    CONSTRAINT [TransactionStoreHistory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Material] (
    [id] INT NOT NULL IDENTITY(1,1),
    [materialNo] NVARCHAR(1000) NOT NULL,
    [materialName] NVARCHAR(1000) NOT NULL,
    [materialSpec] NVARCHAR(1000) NOT NULL,
    [timeStamp] DATETIME2 NOT NULL CONSTRAINT [Material_timeStamp_df] DEFAULT CURRENT_TIMESTAMP,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Material_status_df] DEFAULT 'use',
    CONSTRAINT [Material_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[TimeStateIncoming] ADD CONSTRAINT [TimeStateIncoming_incomingId_fkey] FOREIGN KEY ([incomingId]) REFERENCES [dbo].[Incoming]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TimeStateIncoming] ADD CONSTRAINT [TimeStateIncoming_areaId_fkey] FOREIGN KEY ([areaId]) REFERENCES [dbo].[Area]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TransactionStore] ADD CONSTRAINT [TransactionStore_storeId_fkey] FOREIGN KEY ([storeId]) REFERENCES [dbo].[Store]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TransactionStore] ADD CONSTRAINT [TransactionStore_incomingId_fkey] FOREIGN KEY ([incomingId]) REFERENCES [dbo].[Incoming]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TransactionStore] ADD CONSTRAINT [TransactionStore_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TransactionStoreHistory] ADD CONSTRAINT [TransactionStoreHistory_storeId_fkey] FOREIGN KEY ([storeId]) REFERENCES [dbo].[Store]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TransactionStoreHistory] ADD CONSTRAINT [TransactionStoreHistory_incomingId_fkey] FOREIGN KEY ([incomingId]) REFERENCES [dbo].[Incoming]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TransactionStoreHistory] ADD CONSTRAINT [TransactionStoreHistory_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
