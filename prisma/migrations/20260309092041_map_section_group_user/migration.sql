BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[MapSectionGroupUser] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [groupId] INT NOT NULL,
    [sectionId] INT NOT NULL,
    CONSTRAINT [MapSectionGroupUser_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[MapSectionGroupUser] ADD CONSTRAINT [MapSectionGroupUser_sectionId_fkey] FOREIGN KEY ([sectionId]) REFERENCES [dbo].[Section]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MapSectionGroupUser] ADD CONSTRAINT [MapSectionGroupUser_groupId_fkey] FOREIGN KEY ([groupId]) REFERENCES [dbo].[Group]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MapSectionGroupUser] ADD CONSTRAINT [MapSectionGroupUser_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
