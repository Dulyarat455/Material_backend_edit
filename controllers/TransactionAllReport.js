const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();



module.exports = {
  list: async (req, res) => {
     try {
          const chunkSize = 500;
          const results = [];

      // =========================
      // 1) TransactionStoreHistory
      // =========================
      const tshIds = await prisma.transactionStoreHistory.findMany({
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

      const allTshIds = tshIds.map(x => x.id);

      for (let i = 0; i < allTshIds.length; i += chunkSize) {
        const chunkIds = allTshIds.slice(i, i + chunkSize);

        const chunkRows = await prisma.transactionStoreHistory.findMany({
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
            Store: {
              select: {
                name: true
              }
            },
            Incoming: {
              select: {
                jobNo: true,
                materialNo: true,
                itemName: true,
                itemSpec: true,
                lotNo: true,
                notControl: true
              }
            },
            User: {
              select: {
                name: true,
                empNo: true
              }
            }
          }
        });

        // =========================
        // เตรียม History IDs
        // =========================

        const notControlHistoryIds = Array.from(
          new Set(
            chunkRows
              .filter(row => row.type === 'EditNotControl')
              .map(row => row.id)
              .filter(id => id != null)
          )
        );

        const editLastReturnHistoryIds = Array.from(
          new Set(
            chunkRows
              .filter(row => row.type === 'EditLastReturn')
              .map(row => row.id)
              .filter(id => id != null)
          )
        );

        const editReInspectionHistoryIds = Array.from(
          new Set(
            chunkRows
              .filter(row => row.type === 'EditReInspection')
              .map(row => row.id)
              .filter(id => id != null)
          )
        );

        // =========================
        // Maps
        // =========================

        const logNotControlMap = new Map();
        const logEditLastReturnMap = new Map();
        const logEditInSpectionMap = new Map();

        // =========================
        // LogNotControl
        // =========================

        if (notControlHistoryIds.length) {
          const logRows = await prisma.logNotControl.findMany({
            where: {
              historyId: {
                in: notControlHistoryIds
              },
              status: 'use'
            },
            orderBy: [
              {
                timeStmp: 'desc'
              },
              {
                id: 'desc'
              }
            ],
            select: {
              id: true,
              historyId: true,
              notControl: true,
              timeStmp: true
            }
          });

          for (const log of logRows) {
            if (!logNotControlMap.has(log.historyId)) {
              logNotControlMap.set(
                log.historyId,
                log.notControl || ''
              );
            }
          }
        }

        // =========================
        // LogEditLastReturn
        // =========================

        if (editLastReturnHistoryIds.length) {
          const logRows = await prisma.logEditLastReturn.findMany({
            where: {
              historyId: {
                in: editLastReturnHistoryIds
              },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              historyId: true,
              lastReturn: true
            }
          });

          for (const log of logRows) {
            if (!logEditLastReturnMap.has(log.historyId)) {
              logEditLastReturnMap.set(
                log.historyId,
                log.lastReturn || ''
              );
            }
          }
        }

        // =========================
        // LogEditInSpection
        // =========================

        if (editReInspectionHistoryIds.length) {
          const logRows = await prisma.logEditInSpection.findMany({
            where: {
              historyId: {
                in: editReInspectionHistoryIds
              },
              status: 'use'
            },
            orderBy: [
              {
                timeStmp: 'desc'
              },
              {
                id: 'desc'
              }
            ],
            select: {
              id: true,
              historyId: true,
              inSpection: true,
              timeStmp: true
            }
          });

          for (const log of logRows) {
            if (!logEditInSpectionMap.has(log.historyId)) {
              logEditInSpectionMap.set(
                log.historyId,
                log.inSpection || ''
              );
            }
          }
        }

        // =========================
        // Map Result
        // =========================

        const mapped = chunkRows.map((row) => {
          let remark = row.stockNote || '';

          if (row.type === 'EditLastReturn') {
            remark = logEditLastReturnMap.get(row.id) || '';
          } else if (row.type === 'DeleteLastReturn') {
            remark = '';
          } else if (row.type === 'EditReInspection') {
            remark = logEditInSpectionMap.get(row.id) || '';
          }

          return {
            areaName: row.Store?.name || '',
            incomingJobNo: row.Incoming?.jobNo || '',
            materialNo: row.Incoming?.materialNo || '',
            materialName: row.Incoming?.itemName || '',
            materialSpec: row.Incoming?.itemSpec || '',
            lotNo: row.Incoming?.lotNo || '',

            notControl:
              row.type === 'EditNotControl'
                ? logNotControlMap.get(row.id) || ''
                : row.Incoming?.notControl || '',

            coil: Number(row.coil || 0),
            qty: Number(row.qty || 0),
            type: row.type || '',

            inchargeBy: row.User
              ? `${row.User.name || ''} (${row.User.empNo || '-'})`
              : '',

            remark,
            time: row.timeStmp
          };
        });

        results.push(...mapped);
      }

      // =========================
      // 2) Job (issue only, state = complete)
      // =========================
      const jobIds = await prisma.job.findMany({
        where: {
          status: 'use',
          type: 'issue',
          state: 'complete'
        },
        orderBy: {
          id: 'desc'
        },
        select: {
          id: true
        }
      });

      const allJobIds = jobIds.map(x => x.id);

      for (let i = 0; i < allJobIds.length; i += chunkSize) {
        const chunkIds = allJobIds.slice(i, i + chunkSize);

        const chunkRows = await prisma.job.findMany({
          where: {
            id: { in: chunkIds },
            status: 'use',
            type: 'issue',
            state: 'complete'
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Area: {
              select: {
                name: true
              }
            }
          }
        });

        const incomingIds = Array.from(
          new Set(chunkRows.map(x => x.IncomingId).filter(x => x != null))
        );

        const inchargeIds = Array.from(
          new Set(chunkRows.map(x => x.inchargeByUserId).filter(x => x != null))
        );

        const jobIdList = chunkRows.map(x => x.id);

        let incomingMap = new Map();
        let userMap = new Map();
        let incomingLocQtyMap = new Map();
        let incomingLocCoilMap = new Map();

        if (incomingIds.length) {
          const incomingRows = await prisma.incoming.findMany({
            where: {
              id: { in: incomingIds },
              status: 'use'
            },
            select: {
              id: true,
              jobNo: true,
              materialNo: true,
              itemName: true,
              itemSpec: true,
              lotNo: true,
              notControl: true
            }
          });

          incomingMap = new Map(incomingRows.map(x => [x.id, x]));
        }

        if (inchargeIds.length) {
          const userRows = await prisma.user.findMany({
            where: {
              id: { in: inchargeIds },
              status: 'use'
            },
            select: {
              id: true,
              name: true,
              empNo: true
            }
          });

          userMap = new Map(userRows.map(x => [x.id, x]));
        }

        if (jobIdList.length) {
          const incomingLocRows = await prisma.incomingLoc.findMany({
            where: {
              jobId: { in: jobIdList },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              jobId: true,
              coil: true,
              qty: true
            }
          });

          for (const loc of incomingLocRows) {
            if (!incomingLocQtyMap.has(loc.jobId)) {
              incomingLocQtyMap.set(loc.jobId, Number(loc.qty || 0));
              incomingLocCoilMap.set(loc.jobId, Number(loc.coil || 0));
            }
          }
        }

        const mapped = chunkRows.map((row) => {
          const incoming = row.IncomingId ? incomingMap.get(row.IncomingId) : null;
          const user = row.inchargeByUserId ? userMap.get(row.inchargeByUserId) : null;
          const qty = incomingLocQtyMap.get(row.id) || 0;
          const coil = incomingLocCoilMap.get(row.id) || 0;

          return {
            areaName: row.Area?.name || '',
            incomingJobNo: incoming?.jobNo || '',
            materialNo: incoming?.materialNo || '',
            materialName: incoming?.itemName || '',
            materialSpec: incoming?.itemSpec || '',
            lotNo: incoming?.lotNo || '',
            notControl: incoming?.notControl || '',
            coil: Number(coil || 0),
            qty: Number(qty || 0),
            type: 'Issue',
            inchargeBy: user ? `${user.name || ''} (${user.empNo || '-'})` : '',
            remark: row.remarkMC || '',
            time: row.inchargeTime || null
          };
        });

        results.push(...mapped);
      }

      // =========================
      // 3) StockOut
      // =========================
      const stockOutIds = await prisma.stockOut.findMany({
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

      const allStockOutIds = stockOutIds.map(x => x.id);

      for (let i = 0; i < allStockOutIds.length; i += chunkSize) {
        const chunkIds = allStockOutIds.slice(i, i + chunkSize);

        const chunkRows = await prisma.stockOut.findMany({
          where: {
            id: { in: chunkIds },
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Incoming: {
              select: {
                jobNo: true,
                materialNo: true,
                itemName: true,
                itemSpec: true,
                lotNo: true,
                notControl: true
              }
            },
            User: {
              select: {
                name: true,
                empNo: true
              }
            }
          }
        });

        const mapped = chunkRows.map((row) => ({
          areaName: 'OutSideStore',
          incomingJobNo: row.Incoming?.jobNo || '',
          materialNo: row.Incoming?.materialNo || '',
          materialName: row.Incoming?.itemName || '',
          materialSpec: row.Incoming?.itemSpec || '',
          lotNo: row.Incoming?.lotNo || '',
          notControl: row.Incoming?.notControl || '',
          coil: Number(row.coil || 0),
          qty: Number(row.qty || 0),
          type: 'StockOut',
          inchargeBy: row.User
            ? `${row.User.name || ''} (${row.User.empNo || '-'})`
            : '',
          remark: row.remark || '',
          time: row.timeStmp
        }));

        results.push(...mapped);
      }

      // =========================
      // 4) Sort รวมตามเวลา ล่าสุด -> เก่าสุด
      // =========================
      const toSortableTime = (value) => {
        if (!value) return 0;
        const d = new Date(value);
        const t = d.getTime();
        return Number.isNaN(t) ? 0 : t;
      };

      results.sort((a, b) => {
        return toSortableTime(b.time) - toSortableTime(a.time);
      });

      return res.send({ results });
    } catch (e) {
      return res.status(500).send({ error: e.message });
    }
  },


  

  exportExcel: async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const chunkSize = 500;
      const results = [];
  
      const {
        startDate,
        endDate,
        incomingJobNo,
        materialNo,
        materialName,
        materialSpec,
        lotNo,
        areaName,
        type,
        inchargeBy,
        remark
      } = req.body || {};
  
      const toSortableTime = (value) => {
        if (!value) return 0;
        const d = new Date(value);
        const t = d.getTime();
        return Number.isNaN(t) ? 0 : t;
      };
  
      const inDateRange = (value) => {
        if (!startDate && !endDate) return true;
  
        const rowDate = value ? new Date(value) : null;
        if (!rowDate || Number.isNaN(rowDate.getTime())) return false;
  
        rowDate.setHours(0, 0, 0, 0);
  
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
  
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(0, 0, 0, 0);
  
        if (start && rowDate < start) return false;
        if (end && rowDate > end) return false;
  
        return true;
      };
  
      const matchExact = (actual, expected) => {
        if (!expected || expected === 'all') return true;
        return String(actual || '') === String(expected || '');
      };
  
      const passFilter = (row) => {
        return (
          inDateRange(row.time) &&
          matchExact(row.incomingJobNo, incomingJobNo) &&
          matchExact(row.materialNo, materialNo) &&
          matchExact(row.materialName, materialName) &&
          matchExact(row.materialSpec, materialSpec) &&
          matchExact(row.lotNo, lotNo) &&
          matchExact(row.areaName, areaName) &&
          matchExact(row.type, type) &&
          matchExact(row.inchargeBy, inchargeBy) &&
          matchExact(row.remark, remark)
        );
      };
  
      // =========================
      // 1) TransactionStoreHistory
      // =========================
      const tshIds = await prisma.transactionStoreHistory.findMany({
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

      const allTshIds = tshIds.map(x => x.id);

      for (let i = 0; i < allTshIds.length; i += chunkSize) {
        const chunkIds = allTshIds.slice(i, i + chunkSize);

        const chunkRows = await prisma.transactionStoreHistory.findMany({
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
            Store: {
              select: {
                name: true
              }
            },
            Incoming: {
              select: {
                jobNo: true,
                materialNo: true,
                itemName: true,
                itemSpec: true,
                lotNo: true,
                notControl: true
              }
            },
            User: {
              select: {
                name: true,
                empNo: true
              }
            }
          }
        });

        // =========================
        // เตรียม History IDs
        // =========================

        const notControlHistoryIds = Array.from(
          new Set(
            chunkRows
              .filter(row => row.type === 'EditNotControl')
              .map(row => row.id)
              .filter(id => id != null)
          )
        );

        const editLastReturnHistoryIds = Array.from(
          new Set(
            chunkRows
              .filter(row => row.type === 'EditLastReturn')
              .map(row => row.id)
              .filter(id => id != null)
          )
        );

        const editReInspectionHistoryIds = Array.from(
          new Set(
            chunkRows
              .filter(row => row.type === 'EditReInspection')
              .map(row => row.id)
              .filter(id => id != null)
          )
        );

        // =========================
        // Maps
        // =========================

        const logNotControlMap = new Map();
        const logEditLastReturnMap = new Map();
        const logEditInSpectionMap = new Map();

        // =========================
        // LogNotControl
        // =========================

        if (notControlHistoryIds.length) {
          const logRows = await prisma.logNotControl.findMany({
            where: {
              historyId: {
                in: notControlHistoryIds
              },
              status: 'use'
            },
            orderBy: [
              {
                timeStmp: 'desc'
              },
              {
                id: 'desc'
              }
            ],
            select: {
              id: true,
              historyId: true,
              notControl: true,
              timeStmp: true
            }
          });

          for (const log of logRows) {
            if (!logNotControlMap.has(log.historyId)) {
              logNotControlMap.set(
                log.historyId,
                log.notControl || ''
              );
            }
          }
        }

        // =========================
        // LogEditLastReturn
        // =========================

        if (editLastReturnHistoryIds.length) {
          const logRows = await prisma.logEditLastReturn.findMany({
            where: {
              historyId: {
                in: editLastReturnHistoryIds
              },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              historyId: true,
              lastReturn: true
            }
          });

          for (const log of logRows) {
            if (!logEditLastReturnMap.has(log.historyId)) {
              logEditLastReturnMap.set(
                log.historyId,
                log.lastReturn || ''
              );
            }
          }
        }

        // =========================
        // LogEditInSpection
        // =========================

        if (editReInspectionHistoryIds.length) {
          const logRows = await prisma.logEditInSpection.findMany({
            where: {
              historyId: {
                in: editReInspectionHistoryIds
              },
              status: 'use'
            },
            orderBy: [
              {
                timeStmp: 'desc'
              },
              {
                id: 'desc'
              }
            ],
            select: {
              id: true,
              historyId: true,
              inSpection: true,
              timeStmp: true
            }
          });

          for (const log of logRows) {
            if (!logEditInSpectionMap.has(log.historyId)) {
              logEditInSpectionMap.set(
                log.historyId,
                log.inSpection || ''
              );
            }
          }
        }

        // =========================
        // Map Result
        // =========================

        const mapped = chunkRows.map((row) => {
          let remark = row.stockNote || '';

          if (row.type === 'EditLastReturn') {
            remark = logEditLastReturnMap.get(row.id) || '';
          } else if (row.type === 'DeleteLastReturn') {
            remark = '';
          } else if (row.type === 'EditReInspection') {
            remark = logEditInSpectionMap.get(row.id) || '';
          }

          return {
            areaName: row.Store?.name || '',
            incomingJobNo: row.Incoming?.jobNo || '',
            materialNo: row.Incoming?.materialNo || '',
            materialName: row.Incoming?.itemName || '',
            materialSpec: row.Incoming?.itemSpec || '',
            lotNo: row.Incoming?.lotNo || '',

            notControl:
              row.type === 'EditNotControl'
                ? logNotControlMap.get(row.id) || ''
                : row.Incoming?.notControl || '',

            coil: Number(row.coil || 0),
            qty: Number(row.qty || 0),
            type: row.type || '',

            inchargeBy: row.User
              ? `${row.User.name || ''} (${row.User.empNo || '-'})`
              : '',

            remark,
            time: row.timeStmp
          };
        });

        results.push(...mapped);
      }

    // =========================
    // 2) Job (issue only, state = complete)
    // =========================
    const jobIds = await prisma.job.findMany({
      where: {
        status: 'use',
        type: 'issue',
        state: 'complete'
      },
      orderBy: {
        id: 'desc'
      },
      select: {
        id: true
      }
    });

    const allJobIds = jobIds.map(x => x.id);

    for (let i = 0; i < allJobIds.length; i += chunkSize) {
      const chunkIds = allJobIds.slice(i, i + chunkSize);

      const chunkRows = await prisma.job.findMany({
        where: {
          id: { in: chunkIds },
          status: 'use',
          type: 'issue',
          state: 'complete'
        },
        orderBy: {
          id: 'desc'
        },
        include: {
          Area: {
            select: {
              name: true
            }
          }
        }
      });

      const incomingIds = Array.from(
        new Set(chunkRows.map(x => x.IncomingId).filter(x => x != null))
      );

      const inchargeIds = Array.from(
        new Set(chunkRows.map(x => x.inchargeByUserId).filter(x => x != null))
      );

      const jobIdList = chunkRows.map(x => x.id);

      let incomingMap = new Map();
      let userMap = new Map();
      let incomingLocQtyMap = new Map();
      let incomingLocCoilMap = new Map();

      if (incomingIds.length) {
        const incomingRows = await prisma.incoming.findMany({
          where: {
            id: { in: incomingIds },
            status: 'use'
          },
          select: {
            id: true,
            jobNo: true,
            materialNo: true,
            itemName: true,
            itemSpec: true,
            lotNo: true,
            notControl: true
          }
        });

        incomingMap = new Map(incomingRows.map(x => [x.id, x]));
      }

      if (inchargeIds.length) {
        const userRows = await prisma.user.findMany({
          where: {
            id: { in: inchargeIds },
            status: 'use'
          },
          select: {
            id: true,
            name: true,
            empNo: true
          }
        });

        userMap = new Map(userRows.map(x => [x.id, x]));
      }

      if (jobIdList.length) {
        const incomingLocRows = await prisma.incomingLoc.findMany({
          where: {
            jobId: { in: jobIdList },
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true,
            jobId: true,
            coil: true,
            qty: true
          }
        });

        for (const loc of incomingLocRows) {
          if (!incomingLocQtyMap.has(loc.jobId)) {
            incomingLocQtyMap.set(loc.jobId, Number(loc.qty || 0));
            incomingLocCoilMap.set(loc.jobId, Number(loc.coil || 0));
          }
        }
      }

      const mapped = chunkRows.map((row) => {
        const incoming = row.IncomingId ? incomingMap.get(row.IncomingId) : null;
        const user = row.inchargeByUserId ? userMap.get(row.inchargeByUserId) : null;
        const qty = incomingLocQtyMap.get(row.id) || 0;
        const coil = incomingLocCoilMap.get(row.id) || 0;

        return {
          areaName: row.Area?.name || '',
          incomingJobNo: incoming?.jobNo || '',
          materialNo: incoming?.materialNo || '',
          materialName: incoming?.itemName || '',
          materialSpec: incoming?.itemSpec || '',
          lotNo: incoming?.lotNo || '',
          notControl: incoming?.notControl || '',
          coil: Number(coil || 0),
          qty: Number(qty || 0),
          type: 'Issue',
          inchargeBy: user ? `${user.name || ''} (${user.empNo || '-'})` : '',
          remark: row.remarkMC || '',
          time: row.inchargeTime || null
        };
      });

      results.push(...mapped);
    }
  
      // =========================
      // 3) StockOut
      // =========================
      const stockOutIds = await prisma.stockOut.findMany({
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

      const allStockOutIds = stockOutIds.map(x => x.id);

      for (let i = 0; i < allStockOutIds.length; i += chunkSize) {
        const chunkIds = allStockOutIds.slice(i, i + chunkSize);

        const chunkRows = await prisma.stockOut.findMany({
          where: {
            id: { in: chunkIds },
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          include: {
            Incoming: {
              select: {
                jobNo: true,
                materialNo: true,
                itemName: true,
                itemSpec: true,
                lotNo: true,
                notControl: true
              }
            },
            User: {
              select: {
                name: true,
                empNo: true
              }
            }
          }
        });

        const mapped = chunkRows.map((row) => ({
          areaName: 'OutSideStore',
          incomingJobNo: row.Incoming?.jobNo || '',
          materialNo: row.Incoming?.materialNo || '',
          materialName: row.Incoming?.itemName || '',
          materialSpec: row.Incoming?.itemSpec || '',
          lotNo: row.Incoming?.lotNo || '',
          notControl: row.Incoming?.notControl || '',
          coil: Number(row.coil || 0),
          qty: Number(row.qty || 0),
          type: 'StockOut',
          inchargeBy: row.User
            ? `${row.User.name || ''} (${row.User.empNo || '-'})`
            : '',
          remark: row.remark || '',
          time: row.timeStmp
        }));

        results.push(...mapped);
      }
  
      // รวม + filter + sort
      const finalRows = results
        .filter(passFilter)
        .sort((a, b) => toSortableTime(b.time) - toSortableTime(a.time));
  
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Transaction All Report', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });
  
      worksheet.columns = [
        { header: 'Incoming Job No', key: 'incomingJobNo', width: 22 },
        { header: 'Material No', key: 'materialNo', width: 22 },
        { header: 'Material Name', key: 'materialName', width: 28 },
        { header: 'Material Spec', key: 'materialSpec', width: 24 },
        { header: 'Lot No', key: 'lotNo', width: 20 },
        { header: 'Coil', key: 'coil', width: 12 },
        { header: 'Qty', key: 'qty', width: 12 },
        { header: 'Area Name', key: 'areaName', width: 20 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Incharge By', key: 'inchargeBy', width: 28 },
        { header: 'Remark', key: 'remark', width: 30 },
        { header: 'Not Control', key: 'notControlText', width: 18 },
        { header: 'Time', key: 'time', width: 24 }
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
          incomingJobNo: row.incomingJobNo || '',
          materialNo: row.materialNo || '',
          materialName: row.materialName || '',
          materialSpec: row.materialSpec || '',
          lotNo: row.lotNo || '',
          coil: Number(row.coil || 0),
          qty: Number(row.qty || 0),
          areaName: row.areaName || '',
          type: row.type || '',
          inchargeBy: row.inchargeBy || '',
          remark: row.remark || '',
          notControlText: row.notControl === 'yes' ? 'Not Control' : '',
          time: row.time
            ? new Date(row.time).toLocaleString('th-TH', {
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
            horizontal: colNumber === 6 || colNumber === 7 ? 'right' : 'left',
            wrapText: true
          };
  
          cell.font = {
            size: 12,
            bold: colNumber === 1 || colNumber === 2,
            color: {
              argb: colNumber === 1 || colNumber === 2 ? 'FF0F172A' : 'FF334155'
            }
          };
        });
  
        excelRowIndex++;
      }

      worksheet.getColumn('coil').numFmt = '#,##0';
      worksheet.getColumn('qty').numFmt = '#,##0.###';
  
      worksheet.autoFilter = {
        from: 'A1',
        to: 'M1'
      };
  
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=transaction_all_report_${Date.now()}.xlsx`
      );
  
      await workbook.xlsx.write(res);
      return res.end();
    } catch (e) {
      return res.status(500).send({ error: e.message });
    }
  }

}