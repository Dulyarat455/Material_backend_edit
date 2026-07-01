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
            // 3) Map result: เอาทุก field ของ Incoming + lineNo
            // =============================
      
            const mappedRows = incomingRows.map((incoming) => {
              const materialNo = String(incoming.materialNo || '').trim();
      
              return {
                ...incoming,
                lineNo: materialMap.get(materialNo) || ''
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