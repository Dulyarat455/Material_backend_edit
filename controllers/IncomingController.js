const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {

    list: async (req, res) => {
      try {
        const chunkSize = 500;
        const results = [];
    
        let lastId = 0;
    
        while (true) {
          // =============================
          // 1) ดึง Incoming ที่ยังไม่อยู่ใน StockOut
          // =============================
    
          const incomingRows = await prisma.incoming.findMany({
            where: {
              status: 'use',
              id: {
                gt: lastId
              },
    
              /*
                เอาเฉพาะ Incoming ที่ไม่มี StockOut status = use
                ถ้าต้องการเช็คทุก StockOut ไม่สน status
                ให้ลบ status: 'use' ออก
              */
              StockOut: {
                none: {
                  status: 'use'
                }
              }
            },
            orderBy: {
              id: 'asc'
            },
            take: chunkSize
          });
    
          if (!incomingRows.length) {
            break;
          }
    
          lastId = incomingRows[incomingRows.length - 1].id;
    
          // =============================
          // 2) เอา materialNo ไปหา Material.lineNo
          // =============================
    
          const materialNos = Array.from(
            new Set(
              incomingRows
                .map(row => row.materialNo)
                .filter(value => value != null && String(value).trim() !== '')
                .map(value => String(value).trim())
            )
          );
    
          const materialMap = new Map();
    
          if (materialNos.length) {
            const materialRows = await prisma.material.findMany({
              where: {
                materialNo: {
                  in: materialNos
                },
                status: 'use'
              },
              select: {
                materialNo: true,
                lineNo: true
              }
            });
    
            for (const material of materialRows) {
              materialMap.set(
                String(material.materialNo || '').trim(),
                String(material.lineNo || '').trim().toUpperCase()
              );
            }
          }
    
          // =============================
          // 3) เอา incomingId ไปหา TransactionStore.storeId
          // =============================
    
          const incomingIds = incomingRows.map(row => Number(row.id));
    
          const transactionStoreRows = await prisma.transactionStore.findMany({
            where: {
              incomingId: {
                in: incomingIds
              },
              status: 'use'
            },
            select: {
              incomingId: true,
              storeId: true,
              timeStmp: true
            },
            orderBy: {
              timeStmp: 'desc'
            }
          });
    
          /*
            incomingId อาจมี TransactionStore มากกว่า 1 row
            ใช้ตัวล่าสุดจาก orderBy timeStmp desc
          */
          const incomingStoreMap = new Map();
    
          for (const transactionStore of transactionStoreRows) {
            const incomingId = Number(transactionStore.incomingId);
    
            if (!incomingStoreMap.has(incomingId)) {
              incomingStoreMap.set(
                incomingId,
                Number(transactionStore.storeId)
              );
            }
          }
    
          // =============================
          // 4) เอา storeId ไปหา Store.name
          // =============================
    
          const storeIds = Array.from(
            new Set(
              transactionStoreRows
                .map(row => Number(row.storeId))
                .filter(id => id > 0)
            )
          );
    
          const storeMap = new Map();
    
          if (storeIds.length) {
            const storeRows = await prisma.store.findMany({
              where: {
                id: {
                  in: storeIds
                },
                status: 'use'
              },
              select: {
                id: true,
                name: true
              }
            });
    
            for (const store of storeRows) {
              storeMap.set(
                Number(store.id),
                String(store.name || '').trim()
              );
            }
          }
    
          // =============================
          // 5) Map result: เอาทุก field ของ Incoming + lineNo + area
          // =============================
    
          const mappedRows = incomingRows.map((incoming) => {
            const materialNo = String(incoming.materialNo || '').trim();
            const incomingId = Number(incoming.id);
    
            const storeId = incomingStoreMap.get(incomingId);
            const area = storeId
              ? storeMap.get(storeId) || ''
              : '';
    
            return {
              ...incoming,
              lineNo: materialMap.get(materialNo) || '',
              area
            };
          });
    
          results.push(...mappedRows);
        }
    
        return res.send({
          results,
          total: results.length,
          chunkSize
        });
      } catch (e) {
        console.error('IncomingController list error:', e);
    
        return res.status(500).send({
          message: 'incoming_list_failed',
          error: e.message
        });
      }
    },



      updateReportField: async (req, res) => {
        try {
          const { id, field, value } = req.body;
      
          if (!id || !field) {
            return res.status(400).send({
              message: 'missing_required_fields'
            });
          }
      
          const allowFields = [
            'invoiceOne',
            'lotNo',
            'remark'
          ];
      
          if (!allowFields.includes(field)) {
            return res.status(400).send({
              message: 'field_not_allowed',
              allowFields
            });
          }
      
          const incoming = await prisma.incoming.findFirst({
            where: {
              id: Number(id),
              status: 'use'
            }
          });
      
          if (!incoming) {
            return res.status(404).send({
              message: 'incoming_not_found'
            });
          }
      
          const updated = await prisma.incoming.update({
            where: {
              id: Number(id)
            },
            data: {
              [field]: value == null ? '' : String(value)
            }
          });
      
          return res.send({
            message: 'update_incoming_field_success',
            data: updated
          });
      
        } catch (e) {
          console.error('updateReportField error:', e);
      
          return res.status(500).send({
            message: 'update_incoming_field_failed',
            error: e.message
          });
        }
      },


    
    



}