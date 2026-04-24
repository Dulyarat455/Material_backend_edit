const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken')


const ExcelJS = require('exceljs');

module.exports = {

  create: async (req, res) => {
    try {
      const { rfId, empNo, name, password, role, groupId, sectionId } = req.body;
  
      if (
        role == null ||
        rfId == null ||
        name == null ||
        empNo == null ||
        password == null ||
        groupId == null ||
        sectionId == null
      ) {
        return res.status(400).send({ message: 'missing_required_fields' });
      }
  
      const rfIdStr = String(rfId).trim();
      const empNoStr = String(empNo).trim();
      const nameStr = String(name).trim();
      const passwordStr = String(password).trim();
      const roleStr = String(role).trim();
      const groupIdNum = parseInt(groupId);
      const sectionIdNum = parseInt(sectionId);
  
      const existUsers = await prisma.user.findMany({
        where: {
          status: 'use',
          OR: [
            { empNo: empNoStr },
            { name: nameStr },
            rfIdStr ? { rfId: rfIdStr } : undefined,
          ].filter(Boolean),
        },
        select: {
          id: true,
          empNo: true,
          name: true,
          rfId: true,
        },
      });
  
      if (existUsers.length) {
        const removeRows = await prisma.removeUser.findMany({
          where: {
            userId: { in: existUsers.map(x => x.id) },
            status: 'use'
          },
          select: {
            userId: true
          }
        });
  
        const removedUserIdSet = new Set(removeRows.map(x => x.userId));
  
        const activeDuplicate = existUsers.find(x => !removedUserIdSet.has(x.id));
  
        if (activeDuplicate) {
          return res.status(400).send({
            message: 'user_already_exists',
            detail: {
              empNo: activeDuplicate.empNo === empNoStr,
              name: activeDuplicate.name === nameStr,
              rfId: rfIdStr ? activeDuplicate.rfId === rfIdStr : false,
            },
          });
        }
      }
  
      const checkGroup = await prisma.group.findFirst({
        where: {
          id: groupIdNum,
          status: 'use'
        }
      });
  
      if (!checkGroup) {
        return res.status(400).send({ message: 'group_not_found' });
      }
  
      const checkSection = await prisma.section.findFirst({
        where: {
          id: sectionIdNum,
          status: 'use'
        }
      });
  
      if (!checkSection) {
        return res.status(400).send({ message: 'section_not_found' });
      }
  
      const data = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: nameStr,
            password: passwordStr,
            role: roleStr,
            rfId: rfIdStr,
            empNo: empNoStr
          }
        });
  
        const mapSectionGroupUser = await tx.mapSectionGroupUser.create({
          data: {
            userId: user.id,
            groupId: groupIdNum,
            sectionId: sectionIdNum
          }
        });
  
        return {
          user,
          mapSectionGroupUser
        };
      });
  
      return res.send({
        message: 'Add user success',
        data
      });
    } catch (e) {
      return res.status(500).send({ error: e.message });
    }
  },



    signin: async (req, res) => {
      try {
        const { empNo, password } = req.body;
    
        if (!empNo || !password) {
          return res.status(400).send({ message: 'missing_empNo_or_password' });
        }
    
        const u = await prisma.user.findFirst({
          where: {
            empNo: String(empNo).trim(),
            password: String(password),
            status: 'use',
          },
          include: {
            MapSectionGroupUser: {
              where: {
                status: 'use',
              },
              include: {
                Group: true,
                Section: true,
              },
              take: 1,
            },
          },
        });
    
        if (!u) {
          return res.status(401).send({ message: 'unauthorized' });
        }


        const checkUserRemove = await prisma.removeUser.findFirst({
          where: {
            userId: parseInt(u.id),
            status: 'use'
          }
        });
    
        if (checkUserRemove) {
          return res.status(400).send({ message: 'user_has_been_delete' });
        }
        
        


        const map = u.MapSectionGroupUser?.[0] || null;
    
        const payload = {
          id: u.id,
          empNo: u.empNo,
          name: u.name,
          role: u.role,
          rfId: u.rfId,
          status: u.status,
    
          groupId: map?.groupId || null,
          groupName: map?.Group?.name || null,
          sectionId: map?.sectionId || null,
          sectionName: map?.Section?.name || null,
        };
    
        const key = process.env.SECRET_KEY;
        if (!key) {
          return res.status(500).send({ message: 'missing_SECRET_KEY' });
        }
    
        const token = jwt.sign(
          {
            id: payload.id,
            empNo: payload.empNo,
            role: payload.role,
            name: payload.name,
            groupId: payload.groupId,
            groupName: payload.groupName,
            sectionId: payload.sectionId,
            sectionName: payload.sectionName,
          },
          key,
          { expiresIn: '30d' }
        );
    
        return res.send({ token, ...payload });
      } catch (e) {
        console.error(e);
        return res.status(500).send({ error: e.message });
      }
    },


    mapSectionGroupUser: async (req,res) =>{
      try{
         const {userId, groupId, sectionId} = req.body;
         
         if (userId == null || groupId == null || sectionId == null) {
            return res.status(400).send({ message: 'missing_required_fields' });
        }      


        const checkMapSectionGroupUser  = await prisma.mapSectionGroupUser.findFirst({
          where: {
            status: 'use',
            userId: parseInt(userId) ,
            groupId: parseInt(groupId),
            sectionId: parseInt(sectionId)
          },
        });

        if (checkMapSectionGroupUser) {
          return res.status(400).send({ message: 'mapSectionGroupUser_name_already' });
        }  


        const mapSectionGroupUser = await prisma.mapSectionGroupUser.create({
          data: {
            userId: parseInt(userId),
            groupId: parseInt(groupId),
            sectionId: parseInt(sectionId)
          },
        });

      return res.send({
          message: 'map_sectionGroupUser_success',
          data: mapSectionGroupUser,
      });


      }catch(e){
        return res.status(500).send({ error: e.message });
      }
    },


    list: async (req, res) => {
      try {
        const chunkSize = 500;
    
        const idRows = await prisma.user.findMany({
          where: {
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true
          }
        });
    
        const allIds = idRows.map(x => x.id);
        const results = [];
    
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunkIds = allIds.slice(i, i + chunkSize);
    
          const chunkRows = await prisma.user.findMany({
            where: {
              id: { in: chunkIds },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            include: {
              MapSectionGroupUser: {
                where: {
                  status: 'use'
                },
                include: {
                  Group: {
                    select: {
                      id: true,
                      name: true
                    }
                  },
                  Section: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            }
          });
    
          const chunkUserIds = chunkRows.map(x => x.id);
    
          // check removed user
          const removedRows = await prisma.removeUser.findMany({
            where: {
              userId: { in: chunkUserIds },
              status: 'use'
            },
            select: {
              userId: true
            }
          });
    
          const removedUserIdSet = new Set(removedRows.map(x => x.userId));
    
          // ตัด user ที่โดนลบออก
          const activeChunkRows = chunkRows.filter(row => !removedUserIdSet.has(row.id));
          const activeUserIds = activeChunkRows.map(x => x.id);
    
          let waitJobMap = new Map();
    
          if (activeUserIds.length) {
            const waitJobs = await prisma.job.findMany({
              where: {
                requestByUserId: { in: activeUserIds },
                status: 'use',
                state: 'wait',
                type: {
                  in: ['issue', 'return']
                }
              },
              orderBy: {
                id: 'desc'
              },
              select: {
                id: true,
                jobNo: true,
                type: true,
                requestByUserId: true
              }
            });
    
            for (const job of waitJobs) {
              const userId = job.requestByUserId;
    
              if (!waitJobMap.has(userId)) {
                waitJobMap.set(userId, {
                  issueWaitCount: 0,
                  returnWaitCount: 0,
                  issueWaitJobNos: [],
                  returnWaitJobNos: []
                });
              }
    
              const bucket = waitJobMap.get(userId);
    
              if (job.type === 'issue') {
                bucket.issueWaitCount += 1;
                bucket.issueWaitJobNos.push(job.jobNo || '');
              }
    
              if (job.type === 'return') {
                bucket.returnWaitCount += 1;
                bucket.returnWaitJobNos.push(job.jobNo || '');
              }
            }
          }
    
          const mapped = activeChunkRows.map((row) => {
            const mapRow = row.MapSectionGroupUser?.[0] || null;
            const waitInfo = waitJobMap.get(row.id) || {
              issueWaitCount: 0,
              returnWaitCount: 0,
              issueWaitJobNos: [],
              returnWaitJobNos: []
            };
    
            const totalWaitCount =
              waitInfo.issueWaitCount + waitInfo.returnWaitCount;
    
            return {
              id: row.id,
              rfId: row.rfId || '',
              empNo: row.empNo || '',
              name: row.name || '',
              password: row.password || '',
              role: row.role || '',
              status: row.status || '',
              groupId: mapRow?.groupId || null,
              groupName: mapRow?.Group?.name || '',
              sectionId: mapRow?.sectionId || null,
              sectionName: mapRow?.Section?.name || '',
    
              issueWaitCount: waitInfo.issueWaitCount,
              returnWaitCount: waitInfo.returnWaitCount,
              issueWaitJobNos: waitInfo.issueWaitJobNos,
              returnWaitJobNos: waitInfo.returnWaitJobNos,
              totalWaitCount,
              hasPending: totalWaitCount > 0
            };
          });
    
          results.push(...mapped);
        }
    
        return res.send({ results });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },



    edit: async (req, res) => {
      try {
        const { userId, rfId, empNo, name, password, role, groupId, sectionId } = req.body;
    
        if (
          userId == null ||
          rfId == null ||
          !empNo ||
          !name ||
          !password ||
          !role ||
          groupId == null ||
          sectionId == null
        ) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }
    
        const userIdNum = parseInt(userId);
        const groupIdNum = parseInt(groupId);
        const sectionIdNum = parseInt(sectionId);
    
        const empNoStr = String(empNo).trim();
        const nameStr = String(name).trim();
        const rfIdStr = String(rfId).trim();
        const passwordStr = String(password).trim();
        const roleStr = String(role).trim();
    
        const existing = await prisma.user.findFirst({
          where: {
            id: userIdNum,
            status: 'use'
          },
          select: { id: true, empNo: true, name: true, rfId: true }
        });
    
        if (!existing) {
          return res.status(404).send({ message: 'user_not_found' });
        }
    
        const removed = await prisma.removeUser.findFirst({
          where: {
            userId: userIdNum,
            status: 'use'
          },
          select: { id: true }
        });
    
        if (removed) {
          return res.status(404).send({ message: 'user_have_been_delete' });
        }
    
        const duplicate = await prisma.user.findFirst({
          where: {
            id: { not: userIdNum },
            status: 'use',
            OR: [
              { empNo: empNoStr },
              { name: nameStr },
              { rfId: rfIdStr }
            ]
          },
          select: { id: true, empNo: true, name: true, rfId: true }
        });
    
        if (duplicate) {
          const duplicateRemoved = await prisma.removeUser.findFirst({
            where: {
              userId: duplicate.id,
              status: 'use'
            },
            select: { id: true }
          });
    
          if (!duplicateRemoved) {
            return res.status(400).send({
              message: 'user_already_exists',
              detail: {
                empNo: duplicate.empNo === empNoStr,
                name: duplicate.name === nameStr,
                rfId: duplicate.rfId === rfIdStr
              }
            });
          }
        }
    
        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.update({
            where: { id: userIdNum },
            data: {
              empNo: empNoStr,
              name: nameStr,
              role: roleStr,
              rfId: rfIdStr,
              password: passwordStr
            }
          });
    
          const mapOld = await tx.mapSectionGroupUser.findFirst({
            where: {
              userId: userIdNum,
              status: 'use'
            },
            orderBy: { id: 'asc' },
            select: { id: true }
          });
    
          if (mapOld) {
            await tx.mapSectionGroupUser.update({
              where: { id: mapOld.id },
              data: {
                groupId: groupIdNum,
                sectionId: sectionIdNum
              }
            });
          } else {
            await tx.mapSectionGroupUser.create({
              data: {
                userId: userIdNum,
                groupId: groupIdNum,
                sectionId: sectionIdNum
              }
            });
          }
    
          return user;
        });
    
        return res.send({
          message: 'edit_user_success',
          data: result
        });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },








    delete: async (req, res) => {
      try {
        const { userId } = req.body;
    
        if (userId == null) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }
    
        const userIdNum = parseInt(userId);
    
        const existing = await prisma.user.findFirst({
          where: {
            id: userIdNum,
            status: 'use'
          },
          select: { id: true, empNo: true, name: true, rfId: true }
        });
    
        if (!existing) {
          return res.status(404).send({ message: 'user_not_found' });
        }
    
        const checkRemoveUser = await prisma.removeUser.findFirst({
          where: {
            userId: userIdNum,
            status: 'use'
          }
        });
    
        if (checkRemoveUser) {
          return res.status(400).send({ message: 'user_has_been_delete' });
        }
    
        const removed = await prisma.removeUser.create({
          data: {
            userId: userIdNum
          }
        });
    
        return res.send({
          message: 'delete_user_success',
          data: removed
        });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },

    exportExcel: async (req, res) => {
      try {
        const chunkSize = 500;
    
        const {
          searchText = '',
          roleFilter = 'all',
          groupFilter = 'all',
          sectionFilter = 'all'
        } = req.body || {};
    
        const searchKey = String(searchText || '').trim().toLowerCase();
        const roleKey = String(roleFilter || 'all').trim().toLowerCase();
        const groupKey = String(groupFilter || 'all').trim();
        const sectionKey = String(sectionFilter || 'all').trim();
    
        const idRows = await prisma.user.findMany({
          where: {
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true
          }
        });
    
        const allIds = idRows.map(x => x.id);
        const results = [];
    
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunkIds = allIds.slice(i, i + chunkSize);
    
          const chunkRows = await prisma.user.findMany({
            where: {
              id: { in: chunkIds },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            include: {
              MapSectionGroupUser: {
                where: {
                  status: 'use'
                },
                include: {
                  Group: {
                    select: {
                      id: true,
                      name: true
                    }
                  },
                  Section: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            }
          });
    
          const chunkUserIds = chunkRows.map(x => x.id);
    
          const removedRows = await prisma.removeUser.findMany({
            where: {
              userId: { in: chunkUserIds },
              status: 'use'
            },
            select: {
              userId: true
            }
          });
    
          const removedUserIdSet = new Set(removedRows.map(x => x.userId));
          const activeChunkRows = chunkRows.filter(row => !removedUserIdSet.has(row.id));
          const activeUserIds = activeChunkRows.map(x => x.id);
    
          let waitJobMap = new Map();
    
          if (activeUserIds.length) {
            const waitJobs = await prisma.job.findMany({
              where: {
                requestByUserId: { in: activeUserIds },
                status: 'use',
                state: 'wait',
                type: {
                  in: ['issue', 'return']
                }
              },
              orderBy: {
                id: 'desc'
              },
              select: {
                id: true,
                jobNo: true,
                type: true,
                requestByUserId: true
              }
            });
    
            for (const job of waitJobs) {
              const userId = job.requestByUserId;
    
              if (!waitJobMap.has(userId)) {
                waitJobMap.set(userId, {
                  issueWaitCount: 0,
                  returnWaitCount: 0,
                  issueWaitJobNos: [],
                  returnWaitJobNos: []
                });
              }
    
              const bucket = waitJobMap.get(userId);
    
              if (job.type === 'issue') {
                bucket.issueWaitCount += 1;
                bucket.issueWaitJobNos.push(job.jobNo || '');
              }
    
              if (job.type === 'return') {
                bucket.returnWaitCount += 1;
                bucket.returnWaitJobNos.push(job.jobNo || '');
              }
            }
          }
    
          const mapped = activeChunkRows.map((row) => {
            const mapRow = row.MapSectionGroupUser?.[0] || null;
            const waitInfo = waitJobMap.get(row.id) || {
              issueWaitCount: 0,
              returnWaitCount: 0,
              issueWaitJobNos: [],
              returnWaitJobNos: []
            };
    
            const totalWaitCount =
              waitInfo.issueWaitCount + waitInfo.returnWaitCount;
    
            return {
              id: row.id,
              rfId: row.rfId || '',
              empNo: row.empNo || '',
              name: row.name || '',
              password: row.password || '',
              role: row.role || '',
              status: row.status || '',
              groupId: mapRow?.groupId || null,
              groupName: mapRow?.Group?.name || '',
              sectionId: mapRow?.sectionId || null,
              sectionName: mapRow?.Section?.name || '',
              issueWaitCount: waitInfo.issueWaitCount,
              returnWaitCount: waitInfo.returnWaitCount,
              issueWaitJobNos: waitInfo.issueWaitJobNos,
              returnWaitJobNos: waitInfo.returnWaitJobNos,
              totalWaitCount,
              hasPending: totalWaitCount > 0
            };
          });
    
          const filtered = mapped.filter((row) => {
            const matchSearch =
              !searchKey ||
              [
                row.rfId,
                row.empNo,
                row.name,
                row.password,
                row.role,
                row.groupName,
                row.sectionName,
                ...(row.issueWaitJobNos || []),
                ...(row.returnWaitJobNos || [])
              ]
                .map(v => String(v || '').toLowerCase())
                .some(v => v.includes(searchKey));
    
            const matchRole =
              roleKey === 'all' ||
              String(row.role || '').toLowerCase() === roleKey;
    
            const matchGroup =
              groupKey === 'all' ||
              String(row.groupId || '') === groupKey;
    
            const matchSection =
              sectionKey === 'all' ||
              String(row.sectionId || '') === sectionKey;
    
            return matchSearch && matchRole && matchGroup && matchSection;
          });
    
          results.push(...filtered);
        }
    
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'OpenAI';
        workbook.created = new Date();
    
        const worksheet = workbook.addWorksheet('User Master', {
          properties: {
            defaultRowHeight: 22
          },
          views: [{ state: 'frozen', ySplit: 1 }]
        });
    
        worksheet.columns = [
          { header: 'RFID', key: 'rfId', width: 18 },
          { header: 'Password', key: 'password', width: 18 },
          { header: 'Emp No', key: 'empNo', width: 16 },
          { header: 'Name', key: 'name', width: 24 },
          { header: 'Role', key: 'role', width: 16 },
          { header: 'Group', key: 'groupName', width: 20 },
          { header: 'Section', key: 'sectionName', width: 20 }
        ];
    
        worksheet.autoFilter = {
          from: 'A1',
          to: 'G1'
        };
    
        worksheet.pageSetup = {
          printArea: 'A:G',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          orientation: 'landscape',
          margins: {
            left: 0.25,
            right: 0.25,
            top: 0.4,
            bottom: 0.4,
            header: 0.2,
            footer: 0.2
          }
        };
    
        const headerFill = 'FF5B8FC9';
        const headerBorder = 'FF4A7DB7';
        const rowBorder = 'FFB8C9DC';
        const oddFill = 'FFDDEAF6';
        const evenFill = 'FFFFFFFF';
        const textColor = 'FF334155';
    
        const headerRow = worksheet.getRow(1);
        headerRow.height = 26;
    
        for (let col = 1; col <= 7; col++) {
          const cell = headerRow.getCell(col);
          cell.font = {
            bold: true,
            size: 13,
            name: 'Calibri',
            color: { argb: 'FFFFFFFF' }
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: headerFill }
          };
          cell.border = {
            top: { style: 'thin', color: { argb: headerBorder } },
            left: { style: 'thin', color: { argb: headerBorder } },
            bottom: { style: 'thin', color: { argb: headerBorder } },
            right: { style: 'thin', color: { argb: headerBorder } }
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center'
          };
        }
    
        results.forEach((row, index) => {
          const excelRow = worksheet.addRow([
            row.rfId || '',
            row.password || '',
            row.empNo || '',
            row.name || '',
            row.role || '',
            row.groupName || '',
            row.sectionName || ''
          ]);
    
          excelRow.height = 22;
    
          const fillColor = index % 2 === 0 ? oddFill : evenFill;
    
          for (let col = 1; col <= 7; col++) {
            const cell = excelRow.getCell(col);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: fillColor }
            };
            cell.border = {
              top: { style: 'thin', color: { argb: rowBorder } },
              left: { style: 'thin', color: { argb: rowBorder } },
              bottom: { style: 'thin', color: { argb: rowBorder } },
              right: { style: 'thin', color: { argb: rowBorder } }
            };
            cell.font = {
              bold: false,
              size: 13,
              name: 'Calibri',
              color: { argb: textColor }
            };
            cell.alignment = {
              vertical: 'middle',
              horizontal: 'left',
              wrapText: true
            };
          }
        });
    
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=user-master-report.xlsx'
        );
    
        await workbook.xlsx.write(res);
        return res.end();
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },

   importExcel: async (req, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          return res.status(400).send({ message: 'file_not_found' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          return res.status(400).send({ message: 'sheet_not_found' });
        }

        const rows = [];
        const skipped = [];
        const inserted = [];

        const groupRows = await prisma.group.findMany({
          where: { status: 'use' },
          select: { id: true, name: true }
        });

        const sectionRows = await prisma.section.findMany({
          where: { status: 'use' },
          select: { id: true, name: true }
        });

        const groupMap = new Map(
          groupRows.map(x => [String(x.name || '').trim().toLowerCase(), x])
        );

        const sectionMap = new Map(
          sectionRows.map(x => [String(x.name || '').trim().toLowerCase(), x])
        );

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;

          const rfId = String(row.getCell(1).value ?? '').trim();
          const password = String(row.getCell(2).value ?? '').trim();
          const empNo = String(row.getCell(3).value ?? '').trim();
          const name = String(row.getCell(4).value ?? '').trim();
          const role = String(row.getCell(5).value ?? '').trim().toLowerCase();
          const groupName = String(row.getCell(6).value ?? '').trim();
          const sectionName = String(row.getCell(7).value ?? '').trim();

          const isEmptyRow =
            !rfId && !password && !empNo && !name && !role && !groupName && !sectionName;

          if (isEmptyRow) return;

          rows.push({
            rowNumber,
            rfId,
            password,
            empNo,
            name,
            role,
            groupName,
            sectionName
          });
        });

        if (!rows.length) {
          return res.status(400).send({ message: 'excel_no_data' });
        }

        for (const row of rows) {
          const {
            rowNumber,
            rfId,
            password,
            empNo,
            name,
            role,
            groupName,
            sectionName
          } = row;

          if (!rfId || !password || !empNo || !name || !role || !groupName || !sectionName) {
            skipped.push({
              rowNumber,
              empNo: empNo || '-',
              name: name || '-',
              reason: 'missing_required_fields'
            });
            continue;
          }

          const foundGroup = groupMap.get(groupName.toLowerCase());
          const foundSection = sectionMap.get(sectionName.toLowerCase());

          if (!foundGroup) {
            skipped.push({
              rowNumber,
              empNo,
              name,
              reason: `group_not_found: ${groupName}`
            });
            continue;
          }

          if (!foundSection) {
            skipped.push({
              rowNumber,
              empNo,
              name,
              reason: `section_not_found: ${sectionName}`
            });
            continue;
          }

          const duplicateUsers = await prisma.user.findMany({
            where: {
              status: 'use',
              OR: [
                { empNo },
                { name },
                { rfId }
              ]
            },
            select: {
              id: true,
              empNo: true,
              name: true,
              rfId: true
            }
          });

          let hasActiveDuplicate = false;

          if (duplicateUsers.length) {
            const removedRows = await prisma.removeUser.findMany({
              where: {
                userId: { in: duplicateUsers.map(x => x.id) },
                status: 'use'
              },
              select: {
                userId: true
              }
            });

            const removedUserIdSet = new Set(removedRows.map(x => x.userId));
            hasActiveDuplicate = duplicateUsers.some(x => !removedUserIdSet.has(x.id));
          }

          if (hasActiveDuplicate) {
            skipped.push({
              rowNumber,
              empNo,
              name,
              reason: 'user_already_exists'
            });
            continue;
          }

          const created = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                rfId,
                empNo,
                name,
                password,
                role
              }
            });

            await tx.mapSectionGroupUser.create({
              data: {
                userId: user.id,
                groupId: foundGroup.id,
                sectionId: foundSection.id
              }
            });

            return user;
          });

          inserted.push({
            id: created.id,
            empNo: created.empNo,
            name: created.name
          });
        }

        return res.send({
          message: 'import_excel_success',
          completeCount: inserted.length,
          skipCount: skipped.length,
          skipped
        });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },
}

