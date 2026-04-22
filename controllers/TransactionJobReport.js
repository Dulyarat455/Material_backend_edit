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
  }


}