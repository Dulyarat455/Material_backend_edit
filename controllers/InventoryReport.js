const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();



module.exports = {
    list: async (req, res) => {
        try {
          const chunkSize = 500;
    
          // 1) ดึง id ทั้งหมดก่อน
          const idRows = await prisma.transactionStore.findMany({
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
    
          // 2) วนทีละ 500
          for (let i = 0; i < allIds.length; i += chunkSize) {
            const chunkIds = allIds.slice(i, i + chunkSize);
    
            const chunkRows = await prisma.transactionStore.findMany({
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
                    id: true,
                    jobNo: true,
                    materialNo: true,
                    itemName: true,
                    itemSpec: true,
                    lotNo: true,
                    coil: true,
                    qtyKgsPcs: true,
                    unit: true,
                    unitPrice: true
                  }
                },
                Store: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            });
    
            const mapped = chunkRows.map((row) => {
              const qtyKgsPcs = Number(row.Incoming?.qtyKgsPcs || 0);
              const unitPrice = Number(row.Incoming?.unitPrice || 0);
    
              return {
                transactionStoreId: row.id,
                incomingId: row.incomingId,
                jobNo: row.Incoming?.jobNo || '',
                materialNo: row.Incoming?.materialNo || '',
                itemName: row.Incoming?.itemName || '',
                itemSpec: row.Incoming?.itemSpec || '',
                lotNo: row.Incoming?.lotNo || '',
                coil: Number(row.Incoming?.coil || 0),
                qtyKgsPcs: qtyKgsPcs,
                unit: row.Incoming?.unit || '',
                totalPrice: qtyKgsPcs * unitPrice,
                area: row.Store?.name || '',
                stockNote: row.stockNote || '',
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
      }

}