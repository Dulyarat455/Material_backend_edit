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
            id: { in: chunkIds },
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
                lotNo: true
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
          areaName: row.Store?.name || '',
          incomingJobNo: row.Incoming?.jobNo || '',
          materialNo: row.Incoming?.materialNo || '',
          materialName: row.Incoming?.itemName || '',
          materialSpec: row.Incoming?.itemSpec || '',
          lotNo: row.Incoming?.lotNo || '',
          qty: Number(row.qty || 0),
          type: row.type || '',
          inchargeBy: row.User
            ? `${row.User.name || ''} (${row.User.empNo || '-'})`
            : '',
          time: row.timeStmp
        }));

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
              lotNo: true
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
              qty: true
            }
          });

          for (const loc of incomingLocRows) {
            if (!incomingLocQtyMap.has(loc.jobId)) {
              incomingLocQtyMap.set(loc.jobId, Number(loc.qty || 0));
            }
          }
        }

        const mapped = chunkRows.map((row) => {
          const incoming = row.IncomingId ? incomingMap.get(row.IncomingId) : null;
          const user = row.inchargeByUserId ? userMap.get(row.inchargeByUserId) : null;
          const qty = incomingLocQtyMap.get(row.id) || 0;

          return {
            areaName: row.Area?.name || '',
            incomingJobNo: incoming?.jobNo || '',
            materialNo: incoming?.materialNo || '',
            materialName: incoming?.itemName || '',
            materialSpec: incoming?.itemSpec || '',
            lotNo: incoming?.lotNo || '',
            qty: Number(qty || 0),
            type: 'Issue',
            inchargeBy: user ? `${user.name || ''} (${user.empNo || '-'})` : '',
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
                lotNo: true
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
          qty: Number(row.qty || 0),
          type: 'StockOut',
          inchargeBy: row.User
            ? `${row.User.name || ''} (${row.User.empNo || '-'})`
            : '',
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
  }

}