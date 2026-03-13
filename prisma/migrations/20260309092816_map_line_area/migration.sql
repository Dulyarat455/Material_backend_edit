BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[MapSectionGroupUser] ADD [status] NVARCHAR(1000) NOT NULL CONSTRAINT [MapSectionGroupUser_status_df] DEFAULT 'use';

-- CreateTable
CREATE TABLE [dbo].[Area] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Area_status_df] DEFAULT 'use',
    CONSTRAINT [Area_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Line] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Line_status_df] DEFAULT 'use',
    CONSTRAINT [Line_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MapLineArea] (
    [id] INT NOT NULL IDENTITY(1,1),
    [areaId] INT NOT NULL,
    [lineId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [MapLineArea_status_df] DEFAULT 'use',
    CONSTRAINT [MapLineArea_pkey] PRIMARY KEY CLUSTERED ([id])
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
