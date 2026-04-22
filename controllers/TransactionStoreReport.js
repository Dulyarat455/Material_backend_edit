const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();



module.exports = {
    list: async (req, res) => {
        try {
          const chunkSize = 500;
    
          // 1) ดึง id ทั้งหมดก่อน
          const idRows = await prisma.transactionStoreHistory.findMany({
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
    
          // 2) วนดึงทีละ 500
          for (let i = 0; i < allIds.length; i += chunkSize) {
            const chunkIds = allIds.slice(i, i + chunkSize);
    
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
                    jobNo: true
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
    
            const mapped = chunkRows.map((row) => {
              return {
                transactionStoreHistoryId: row.id,
                storeName: row.Store?.name || '',
                jobNoIncoming: row.Incoming?.jobNo || '',
                type: row.type || '',
                timeStmp: row.timeStmp,
                stockNote: row.stockNote || '',
                inchargeBy: row.User?.name || '',
                inchargeEmpNo: row.User?.empNo || ''
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