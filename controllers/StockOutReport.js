const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

module.exports = {
  list: async (req, res) => {
    try {
      const chunkSize = 500;
  
      const idRows = await prisma.stockOut.findMany({
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
  
        const chunkRows = await prisma.stockOut.findMany({
          where: {
            id: {
              in: chunkIds
            },
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Incoming: {
              select: {
                jobNo: true
              }
            },
            User: {
              select: {
                id: true,
                name: true,
                empNo: true
              }
            }
          }
        });
  
        const userIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.inchargeByUserId)
              .filter(id => id != null)
          )
        );
  
        let mapSectionGroupUsers = [];
        let sectionRows = [];
        let userSectionMap = new Map();
        let sectionMap = new Map();
  
        if (userIds.length) {
          mapSectionGroupUsers = await prisma.mapSectionGroupUser.findMany({
            where: {
              userId: {
                in: userIds
              },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              userId: true,
              sectionId: true
            }
          });
  
          const sectionIds = Array.from(
            new Set(
              mapSectionGroupUsers
                .map(row => row.sectionId)
                .filter(id => id != null)
            )
          );
  
          if (sectionIds.length) {
            sectionRows = await prisma.section.findMany({
              where: {
                id: {
                  in: sectionIds
                },
                status: 'use'
              },
              select: {
                id: true,
                name: true
              }
            });
  
            sectionMap = new Map(
              sectionRows.map(row => [row.id, row.name])
            );
          }
  
          for (const row of mapSectionGroupUsers) {
            if (!userSectionMap.has(row.userId)) {
              userSectionMap.set(row.userId, row.sectionId);
            }
          }
        }
  
        const mapped = chunkRows.map((row) => {
          const sectionId = userSectionMap.get(row.inchargeByUserId);
          const sectionName = sectionId ? (sectionMap.get(sectionId) || '') : '';
  
          return {
            stockOutId: row.id,
            jobNoIncoming: row.Incoming?.jobNo || '',
            sectionName: sectionName || '',
            inchargeBy: row.User?.name || '',
            inchargeEmpNo: row.User?.empNo || '',
            remark: row.remark || '',
            timeStmp: row.timeStmp
          };
        });
  
        results.push(...mapped);
      }
  
      return res.send({
        results
      });
    } catch (e) {
      return res.status(500).send({ error: e.message });
    }
  },

  
  exportExcel: async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const chunkSize = 500;
  
      const {
        startDate,
        endDate,
        jobNoIncoming,
        sectionName,
        inchargeBy
      } = req.body || {};
  
      const toDateOnly = (value) => {
        if (!value) return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        return d;
      };
  
      const inDateRange = (value) => {
        const start = startDate ? toDateOnly(startDate) : null;
        const end = endDate ? toDateOnly(endDate) : null;
        const rowDate = toDateOnly(value);
  
        const matchStart = !start || (!!rowDate && rowDate >= start);
        const matchEnd = !end || (!!rowDate && rowDate <= end);
  
        return matchStart && matchEnd;
      };
  
      const matchExact = (actual, expected) => {
        if (!expected || expected === 'all') return true;
        return String(actual || '') === String(expected || '');
      };
  
      const idRows = await prisma.stockOut.findMany({
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
  
        const chunkRows = await prisma.stockOut.findMany({
          where: {
            id: {
              in: chunkIds
            },
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Incoming: {
              select: {
                jobNo: true
              }
            },
            User: {
              select: {
                id: true,
                name: true,
                empNo: true
              }
            }
          }
        });
  
        const userIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.inchargeByUserId)
              .filter(id => id != null)
          )
        );
  
        let mapSectionGroupUsers = [];
        let sectionRows = [];
        let userSectionMap = new Map();
        let sectionMap = new Map();
  
        if (userIds.length) {
          mapSectionGroupUsers = await prisma.mapSectionGroupUser.findMany({
            where: {
              userId: {
                in: userIds
              },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              userId: true,
              sectionId: true
            }
          });
  
          const sectionIds = Array.from(
            new Set(
              mapSectionGroupUsers
                .map(row => row.sectionId)
                .filter(id => id != null)
            )
          );
  
          if (sectionIds.length) {
            sectionRows = await prisma.section.findMany({
              where: {
                id: {
                  in: sectionIds
                },
                status: 'use'
              },
              select: {
                id: true,
                name: true
              }
            });
  
            sectionMap = new Map(
              sectionRows.map(row => [row.id, row.name])
            );
          }
  
          for (const row of mapSectionGroupUsers) {
            if (!userSectionMap.has(row.userId)) {
              userSectionMap.set(row.userId, row.sectionId);
            }
          }
        }
  
        const mapped = chunkRows.map((row) => {
          const sectionId = userSectionMap.get(row.inchargeByUserId);
          const sectionNameValue = sectionId ? (sectionMap.get(sectionId) || '') : '';
  
          return {
            stockOutId: row.id,
            jobNoIncoming: row.Incoming?.jobNo || '',
            sectionName: sectionNameValue || '',
            inchargeBy: row.User?.name || '',
            inchargeEmpNo: row.User?.empNo || '',
            remark: row.remark || '',
            timeStmp: row.timeStmp
          };
        });
  
        results.push(...mapped);
      }
  
      const finalRows = results.filter((row) => {
        return (
          inDateRange(row.timeStmp) &&
          matchExact(row.jobNoIncoming, jobNoIncoming) &&
          matchExact(row.sectionName, sectionName) &&
          matchExact(row.inchargeBy, inchargeBy)
        );
      });
  
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Stock Out Report', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });
  
      worksheet.columns = [
        { header: 'Incoming Job No', key: 'jobNoIncoming', width: 22 },
        { header: 'Section', key: 'sectionName', width: 20 },
        { header: 'Incharge By', key: 'inchargeBy', width: 22 },
        { header: 'Incharge EmpNo', key: 'inchargeEmpNo', width: 18 },
        { header: 'Remark', key: 'remark', width: 34 },
        { header: 'Time', key: 'timeStmp', width: 24 }
      ];
  
      const headerRow = worksheet.getRow(1);
      headerRow.height = 22;
  
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF5B8FC9' }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF4A7DB7' } },
          left: { style: 'thin', color: { argb: 'FFE5EEF7' } },
          bottom: { style: 'thin', color: { argb: 'FF4A7DB7' } },
          right: { style: 'thin', color: { argb: 'FFE5EEF7' } }
        };
      });
  
      let excelRowIndex = 2;
  
      for (const row of finalRows) {
        const excelRow = worksheet.addRow({
          jobNoIncoming: row.jobNoIncoming || '',
          sectionName: row.sectionName || '',
          inchargeBy: row.inchargeBy || '',
          inchargeEmpNo: row.inchargeEmpNo || '',
          remark: row.remark || '',
          timeStmp: row.timeStmp
            ? new Date(row.timeStmp).toLocaleString('th-TH', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            : ''
        });
  
        const isBlueRow = excelRowIndex % 2 === 0;
        const bgColor = isBlueRow ? 'FFDBE7F3' : 'FFFFFFFF';
  
        excelRow.height = 22;
  
        excelRow.eachCell((cell, colNumber) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgColor }
          };
  
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFB8C9DC' } },
            left: { style: 'thin', color: { argb: 'FFB8C9DC' } },
            bottom: { style: 'thin', color: { argb: 'FFB8C9DC' } },
            right: { style: 'thin', color: { argb: 'FFB8C9DC' } }
          };
  
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'left',
            wrapText: true
          };
  
          cell.font = {
            size: 12,
            bold: colNumber === 1,
            color: {
              argb: colNumber === 1 ? 'FF0F172A' : 'FF334155'
            }
          };
        });
  
        excelRowIndex++;
      }
  
      worksheet.autoFilter = {
        from: 'A1',
        to: 'F1'
      };
  
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=stock_out_report_${Date.now()}.xlsx`
      );
  
      await workbook.xlsx.write(res);
      return res.end();
    } catch (e) {
      return res.status(500).send({ error: e.message });
    }
  }

};