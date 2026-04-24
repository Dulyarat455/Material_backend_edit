const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();



module.exports = {
    

  list: async (req, res) => {
    try {
      const chunkSize = 500;

      const idRows = await prisma.job.findMany({
        where: {
          status: 'use',
          state: {
            not: 'wait'
          }
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

        const chunkRows = await prisma.job.findMany({
          where: {
            id: {
              in: chunkIds
            },
            status: 'use',
            state: {
              not: 'wait'
            }
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Area: {
              select: {
                name: true
              }
            },
            RequestUser: {
              select: {
                id: true,
                empNo: true,
                name: true
              }
            },
            Material: {
              select: {
                materialNo: true,
                materialName: true,
                materialSpec: true
              }
            },
            IncomingLoc: {
              where: {
                status: 'use'
              },
              orderBy: {
                id: 'desc'
              },
              select: {
                id: true,
                coil: true,
                qty: true,
                incomingId: true,
                jobId: true
              }
            }
          }
        });

        const inchargeIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.inchargeByUserId)
              .filter(id => id != null)
          )
        );

        const incomingIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.IncomingId)
              .filter(id => id != null)
          )
        );

        let inchargeMap = new Map();
        let incomingMap = new Map();

        if (inchargeIds.length) {
          const inchargeUsers = await prisma.user.findMany({
            where: {
              id: {
                in: inchargeIds
              },
              status: 'use'
            },
            select: {
              id: true,
              empNo: true,
              name: true
            }
          });

          inchargeMap = new Map(
            inchargeUsers.map(user => [user.id, user])
          );
        }

        if (incomingIds.length) {
          const incomingRows = await prisma.incoming.findMany({
            where: {
              id: {
                in: incomingIds
              },
              status: 'use'
            },
            select: {
              id: true,
              jobNo: true,
              materialNo: true,
              itemName: true,
              itemSpec: true,
              lotNo: true,
              recivedDate: true
            }
          });

          incomingMap = new Map(
            incomingRows.map(row => [row.id, row])
          );
        }

        const mapped = chunkRows.map((row) => {
          const latestIncomingLoc = row.IncomingLoc?.[0] || null;
          const inchargeUser = row.inchargeByUserId
            ? inchargeMap.get(row.inchargeByUserId) || null
            : null;
          const incoming = row.IncomingId
            ? incomingMap.get(row.IncomingId) || null
            : null;

          return {
            jobId: row.id,

            // Job
            jobNo: row.jobNo || '',
            type: row.type || '',
            state: row.state || '',
            remark: row.remark || '',
            remarkMC: row.remarkMC || '',
            accountCode: row.accountCode || '',
            priority: row.priority || '',
            requestTime: row.requestTime,
            inchargeTime: row.inchargeTime,
            state: row.state || '',

            // Area
            area: row.Area?.name || '',

            // Incoming
            incomingJobNo: incoming?.jobNo || '',
            materialNo: incoming?.materialNo || row.Material?.materialNo || '',
            materialName: incoming?.itemName || row.Material?.materialName || '',
            materialSpec: incoming?.itemSpec || row.Material?.materialSpec || '',
            lotNo: incoming?.lotNo || '',
            recivedDate: incoming?.recivedDate || '',

            // IncomingLoc
            coil: latestIncomingLoc?.coil || 0,
            qty: latestIncomingLoc?.qty || 0,

            // Users
            requestBy: row.RequestUser?.name || '',
            requestByEmpNo: row.RequestUser?.empNo || '',
            inchargeBy: inchargeUser?.name || '',
            inchargeByEmpNo: inchargeUser?.empNo || ''
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
        startDateRequest,
        endDateRequest,
        startDateIncharge,
        endDateIncharge,
        jobNo,
        type,
        state,
        accountCode,
        priority,
        area,
        incomingJobNo,
        materialNo,
        materialName,
        materialSpec,
        lotNo,
        recivedDate,
        requestBy,
        inchargeBy
      } = req.body || {};
  
      const where = {
        status: 'use',
        state: {
          not: 'wait'
        },
  
        ...(startDateRequest || endDateRequest
          ? {
              requestTime: {
                ...(startDateRequest ? { gte: new Date(`${startDateRequest}T00:00:00`) } : {}),
                ...(endDateRequest ? { lte: new Date(`${endDateRequest}T23:59:59.999`) } : {})
              }
            }
          : {}),
  
        ...(startDateIncharge || endDateIncharge
          ? {
              inchargeTime: {
                ...(startDateIncharge ? { gte: new Date(`${startDateIncharge}T00:00:00`) } : {}),
                ...(endDateIncharge ? { lte: new Date(`${endDateIncharge}T23:59:59.999`) } : {})
              }
            }
          : {}),
  
        ...(jobNo && jobNo !== 'all' ? { jobNo } : {}),
        ...(type && type !== 'all' ? { type } : {}),
        ...(state && state !== 'all' ? { state } : {}),
        ...(accountCode && accountCode !== 'all' ? { accountCode } : {}),
        ...(priority && priority !== 'all' ? { priority } : {}),
  
        ...(area && area !== 'all'
          ? {
              Area: {
                is: {
                  name: area
                }
              }
            }
          : {}),
  
        ...(requestBy && requestBy !== 'all'
          ? {
              RequestUser: {
                is: {
                  name: requestBy
                }
              }
            }
          : {}),
  
        ...(incomingJobNo ||
        materialNo ||
        materialName ||
        materialSpec ||
        lotNo ||
        recivedDate
          ? {
              IncomingId: {
                not: null
              }
            }
          : {})
      };
  
      const idRows = await prisma.job.findMany({
        where,
        orderBy: {
          id: 'desc'
        },
        select: {
          id: true
        }
      });
  
      const allIds = idRows.map(x => x.id);
  
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Transaction Job Report', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });
  
      worksheet.columns = [
        { header: 'Job No', key: 'jobNo', width: 20 },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'State', key: 'state', width: 14 },
        { header: 'Account Code', key: 'accountCode', width: 16 },
        { header: 'Priority', key: 'priority', width: 14 },
        { header: 'Area', key: 'area', width: 18 },
  
        { header: 'Incoming Job No', key: 'incomingJobNo', width: 20 },
        { header: 'Material No', key: 'materialNo', width: 22 },
        { header: 'Material Name', key: 'materialName', width: 28 },
        { header: 'Material Spec', key: 'materialSpec', width: 24 },
        { header: 'Lot No', key: 'lotNo', width: 18 },
        { header: 'Received Date', key: 'recivedDate', width: 18 },
  
        { header: 'Coil', key: 'coil', width: 12 },
        { header: 'Qty', key: 'qty', width: 14 },
  
        { header: 'Request By', key: 'requestBy', width: 20 },
        { header: 'Request By EmpNo', key: 'requestByEmpNo', width: 18 },
        { header: 'Incharge By', key: 'inchargeBy', width: 20 },
        { header: 'Incharge By EmpNo', key: 'inchargeByEmpNo', width: 18 },
  
        { header: 'Request Time', key: 'requestTime', width: 24 },
        { header: 'Incharge Time', key: 'inchargeTime', width: 24 },
  
        { header: 'Remark PD', key: 'remark', width: 28 },
        { header: 'Remark MC', key: 'remarkMC', width: 28 }
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
  
      for (let i = 0; i < allIds.length; i += chunkSize) {
        const chunkIds = allIds.slice(i, i + chunkSize);
  
        const chunkRows = await prisma.job.findMany({
          where: {
            id: {
              in: chunkIds
            },
            ...where
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Area: {
              select: {
                name: true
              }
            },
            RequestUser: {
              select: {
                id: true,
                empNo: true,
                name: true
              }
            },
            Material: {
              select: {
                materialNo: true,
                materialName: true,
                materialSpec: true
              }
            },
            IncomingLoc: {
              where: {
                status: 'use'
              },
              orderBy: {
                id: 'desc'
              },
              select: {
                id: true,
                coil: true,
                qty: true,
                incomingId: true,
                jobId: true
              }
            }
          }
        });
  
        const inchargeIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.inchargeByUserId)
              .filter(id => id != null)
          )
        );
  
        const incomingIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.IncomingId)
              .filter(id => id != null)
          )
        );
  
        let inchargeMap = new Map();
        let incomingMap = new Map();
  
        if (inchargeIds.length) {
          const inchargeUsers = await prisma.user.findMany({
            where: {
              id: {
                in: inchargeIds
              },
              status: 'use',
              ...(inchargeBy && inchargeBy !== 'all' ? { name: inchargeBy } : {})
            },
            select: {
              id: true,
              empNo: true,
              name: true
            }
          });
  
          inchargeMap = new Map(
            inchargeUsers.map(user => [user.id, user])
          );
        }
  
        if (incomingIds.length) {
          const incomingRows = await prisma.incoming.findMany({
            where: {
              id: {
                in: incomingIds
              },
              status: 'use',
              ...(incomingJobNo && incomingJobNo !== 'all' ? { jobNo: incomingJobNo } : {}),
              ...(materialNo && materialNo !== 'all' ? { materialNo } : {}),
              ...(materialName && materialName !== 'all' ? { itemName: materialName } : {}),
              ...(materialSpec && materialSpec !== 'all' ? { itemSpec: materialSpec } : {}),
              ...(lotNo && lotNo !== 'all' ? { lotNo } : {}),
              ...(recivedDate && recivedDate !== 'all' ? { recivedDate } : {})
            },
            select: {
              id: true,
              jobNo: true,
              materialNo: true,
              itemName: true,
              itemSpec: true,
              lotNo: true,
              recivedDate: true
            }
          });
  
          incomingMap = new Map(
            incomingRows.map(row => [row.id, row])
          );
        }
  
        const mapped = chunkRows
          .map((row) => {
            const latestIncomingLoc = row.IncomingLoc?.[0] || null;
            const inchargeUser = row.inchargeByUserId
              ? inchargeMap.get(row.inchargeByUserId) || null
              : null;
            const incoming = row.IncomingId
              ? incomingMap.get(row.IncomingId) || null
              : null;
  
            return {
              jobId: row.id,
              jobNo: row.jobNo || '',
              type: row.type || '',
              state: row.state || '',
              remark: row.remark || '',
              remarkMC: row.remarkMC || '',
              accountCode: row.accountCode || '',
              priority: row.priority || '',
              requestTime: row.requestTime,
              inchargeTime: row.inchargeTime,
  
              area: row.Area?.name || '',
  
              incomingJobNo: incoming?.jobNo || '',
              materialNo: incoming?.materialNo || row.Material?.materialNo || '',
              materialName: incoming?.itemName || row.Material?.materialName || '',
              materialSpec: incoming?.itemSpec || row.Material?.materialSpec || '',
              lotNo: incoming?.lotNo || '',
              recivedDate: incoming?.recivedDate || '',
  
              coil: latestIncomingLoc?.coil || 0,
              qty: latestIncomingLoc?.qty || 0,
  
              requestBy: row.RequestUser?.name || '',
              requestByEmpNo: row.RequestUser?.empNo || '',
              inchargeBy: inchargeUser?.name || '',
              inchargeByEmpNo: inchargeUser?.empNo || ''
            };
          })
          .filter((row) => {
            if (incomingJobNo && incomingJobNo !== 'all' && row.incomingJobNo !== incomingJobNo) return false;
            if (materialNo && materialNo !== 'all' && row.materialNo !== materialNo) return false;
            if (materialName && materialName !== 'all' && row.materialName !== materialName) return false;
            if (materialSpec && materialSpec !== 'all' && row.materialSpec !== materialSpec) return false;
            if (lotNo && lotNo !== 'all' && row.lotNo !== lotNo) return false;
            if (recivedDate && recivedDate !== 'all' && row.recivedDate !== recivedDate) return false;
            if (inchargeBy && inchargeBy !== 'all' && row.inchargeBy !== inchargeBy) return false;
            return true;
          });
  
        for (const row of mapped) {
          const excelRow = worksheet.addRow({
            jobNo: row.jobNo || '',
            type: row.type || '',
            state: row.state === 'denial' ? 'deny' : (row.state || ''),
            accountCode: row.accountCode || '',
            priority: row.priority || '',
            area: row.area || '',
  
            incomingJobNo: row.incomingJobNo || '',
            materialNo: row.materialNo || '',
            materialName: row.materialName || '',
            materialSpec: row.materialSpec || '',
            lotNo: row.lotNo || '',
            recivedDate: row.recivedDate || '',
  
            coil: Number(row.coil || 0),
            qty: Number(row.qty || 0),
  
            requestBy: row.requestBy || '',
            requestByEmpNo: row.requestByEmpNo || '',
            inchargeBy: row.inchargeBy || '',
            inchargeByEmpNo: row.inchargeByEmpNo || '',
  
            requestTime: row.requestTime
              ? new Date(row.requestTime).toLocaleString('th-TH', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : '',
            inchargeTime: row.inchargeTime
              ? new Date(row.inchargeTime).toLocaleString('th-TH', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : '',
  
            remark: row.remark || '',
            remarkMC: row.remarkMC || ''
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
              horizontal:
                colNumber === 13
                  ? 'center'
                  : colNumber === 14
                  ? 'right'
                  : 'left',
              wrapText: true
            };
  
            cell.font = {
              size: 12,
              bold: colNumber === 1 || colNumber === 7 || colNumber === 8,
              color: {
                argb: colNumber === 1 || colNumber === 7 || colNumber === 8
                  ? 'FF0F172A'
                  : 'FF334155'
              }
            };
          });
  
          excelRowIndex++;
        }
      }
  
      worksheet.autoFilter = {
        from: 'A1',
        to: 'V1'
      };
  
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=transaction_job_report_${Date.now()}.xlsx`
      );
  
      await workbook.xlsx.write(res);
      return res.end();
    } catch (e) {
      return res.status(500).send({ error: e.message });
    }
  }




}