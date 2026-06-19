const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();

module.exports = {
    saveInventory: async (req, res) => {
        try {
          const { timeStmp } = req.body;
      
          if (timeStmp == null || String(timeStmp).trim() === '') {
            return res.status(400).send({
              message: 'missing_required_fields'
            });
          }
      
          const inventoryTime = new Date(timeStmp);
      
          if (Number.isNaN(inventoryTime.getTime())) {
            return res.status(400).send({
              message: 'invalid_timeStmp'
            });
          }
      
          const chunkSize = 500;
      
          // =============================
          // 1) ดึง ID ของ TransactionStore ที่ยังใช้งานอยู่
          // =============================
          const transactionStoreIdRows =
            await prisma.transactionStore.findMany({
              where: {
                status: 'use'
              },
              orderBy: {
                id: 'asc'
              },
              select: {
                id: true
              }
            });
      
          const allTransactionStoreIds =
            transactionStoreIdRows.map(row => row.id);
      
          if (!allTransactionStoreIds.length) {
            return res.send({
              message: 'save_inventory_success',
              totalTransactionStore: 0,
              createdCount: 0,
              skippedCount: 0,
              timeStmp: inventoryTime,
              results: []
            });
          }
      
          const recordItems = [];
          const skippedItems = [];
      
          // =============================
          // 2) ดึง TransactionStore และ Incoming ทีละ 500
          // =============================
          for (
            let i = 0;
            i < allTransactionStoreIds.length;
            i += chunkSize
          ) {
            const chunkIds = allTransactionStoreIds.slice(
              i,
              i + chunkSize
            );
      
            const transactionStoreRows =
              await prisma.transactionStore.findMany({
                where: {
                  id: {
                    in: chunkIds
                  },
                  status: 'use'
                },
                orderBy: {
                  id: 'asc'
                },
                select: {
                  id: true,
                  incomingId: true,
                  storeId: true,
      
                  Incoming: {
                    select: {
                      id: true,
                      materialNo: true,
                      coil: true,
                      qtyKgsPcs: true,
                      unitPrice: true,
                      status: true
                    }
                  }
                }
              });
      
            // =============================
            // 3) ใช้ materialNo ไปหา lineNo จาก Material
            // =============================
            const materialNos = Array.from(
              new Set(
                transactionStoreRows
                  .map(row => row.Incoming?.materialNo)
                  .filter(
                    value =>
                      value != null &&
                      String(value).trim() !== ''
                  )
                  .map(value => String(value).trim())
              )
            );
      
            const materialMap = new Map();
      
            if (materialNos.length) {
              const materialRows =
                await prisma.material.findMany({
                  where: {
                    materialNo: {
                      in: materialNos
                    },
                    status: 'use'
                  },
                  select: {
                    id: true,
                    materialNo: true,
                    lineNo: true
                  }
                });
      
              for (const material of materialRows) {
                const key = String(
                  material.materialNo || ''
                ).trim();
      
                if (!materialMap.has(key)) {
                  materialMap.set(key, material);
                }
              }
            }
      
            // =============================
            // 4) เตรียมข้อมูลสำหรับ RecordInventory
            // =============================
            for (const transactionStore of transactionStoreRows) {
              const incoming = transactionStore.Incoming;
      
              if (!incoming || incoming.status !== 'use') {
                skippedItems.push({
                  transactionStoreId: transactionStore.id,
                  incomingId: transactionStore.incomingId,
                  reason: 'incoming_not_found_or_inactive'
                });
      
                continue;
              }
      
              const materialNo = String(
                incoming.materialNo || ''
              ).trim();
      
              const material = materialMap.get(materialNo);
      
              const coil = Number(incoming.coil || 0);
              const qty = Number(incoming.qtyKgsPcs || 0);
              const unitPrice = Number(incoming.unitPrice || 0);
      
              // ทำงานเหมือน ROUND ใน Excel แบบไม่มีทศนิยม
              const totalPrice = Math.round(
                unitPrice * qty
              );
      
              const lineNo = String(
                material?.lineNo || ''
              )
                .trim()
                .toUpperCase();
      
              recordItems.push({
                incomingId: Number(transactionStore.incomingId),
                storeId: Number(transactionStore.storeId),
                coil,
                qty,
                totalPrice,
                lineNo,
                timeStmp: inventoryTime
              });
            }
          }
      
          // =============================
          // 5) Create RecordInventory ทีละ 500
          // =============================
          let createdCount = 0;
      
          for (
            let i = 0;
            i < recordItems.length;
            i += chunkSize
          ) {
            const chunk = recordItems.slice(
              i,
              i + chunkSize
            );
      
            if (!chunk.length) {
              continue;
            }
      
            const created =
              await prisma.recordInventory.createMany({
                data: chunk
              });
      
            createdCount += created.count || chunk.length;
          }
      
          return res.send({
            message: 'save_inventory_success',
      
            timeStmp: inventoryTime,
      
            totalTransactionStore:
              allTransactionStoreIds.length,
      
            preparedCount: recordItems.length,
            createdCount,
            skippedCount: skippedItems.length,
      
            totalReadChunks: Math.ceil(
              allTransactionStoreIds.length / chunkSize
            ),
      
            totalCreateChunks: Math.ceil(
              recordItems.length / chunkSize
            ),
      
            chunkSize,
      
            skippedSample: skippedItems.slice(0, 30)
          });
        } catch (e) {
          console.error('saveInventory error:', e);
      
          return res.status(500).send({
            message: 'save_inventory_failed',
            error: e.message
          });
        }
      },
}



