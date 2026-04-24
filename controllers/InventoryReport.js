const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


const ExcelJS = require('exceljs');

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
      },


      exportExcel: async (req, res) => {
        try {
          const chunkSize = 500;
    
          const {
            startDate,
            endDate,
            jobNo,
            materialNo,
            itemName,
            spec,
            lotNo,
            area
          } = req.body || {};
    
          const where = {
            status: 'use',
    
            ...(startDate || endDate
              ? {
                  timeStmp: {
                    ...(startDate
                      ? { gte: new Date(`${startDate}T00:00:00`) }
                      : {}),
                    ...(endDate
                      ? { lte: new Date(`${endDate}T23:59:59.999`) }
                      : {})
                  }
                }
              : {}),
    
            Incoming: {
              is: {
                status: 'use',
                ...(jobNo && jobNo !== 'all' ? { jobNo } : {}),
                ...(materialNo && materialNo !== 'all' ? { materialNo } : {}),
                ...(itemName && itemName !== 'all' ? { itemName } : {}),
                ...(spec && spec !== 'all' ? { itemSpec: spec } : {}),
                ...(lotNo && lotNo !== 'all' ? { lotNo } : {})
              }
            },
    
            ...(area && area !== 'all'
              ? {
                  Store: {
                    is: {
                      name: area
                    }
                  }
                }
              : {})
          };
    
          const idRows = await prisma.transactionStore.findMany({
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
          const worksheet = workbook.addWorksheet('Inventory Report', {
            views: [{ state: 'frozen', ySplit: 1 }]
          });
    
          worksheet.columns = [
            { header: 'Job No', key: 'jobNo', width: 20 },
            { header: 'Material No', key: 'materialNo', width: 22 },
            { header: 'Item Name', key: 'itemName', width: 28 },
            { header: 'Spec', key: 'itemSpec', width: 22 },
            { header: 'Lot No', key: 'lotNo', width: 18 },
            { header: 'Coil', key: 'coil', width: 12 },
            { header: 'Qty Kgs/Pcs', key: 'qtyKgsPcs', width: 16 },
            { header: 'Unit', key: 'unit', width: 10 },
            { header: 'Total Price', key: 'totalPrice', width: 16 },
            { header: 'Area', key: 'area', width: 14 },
            { header: 'Stock Note', key: 'stockNote', width: 28 },
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
    
          for (let i = 0; i < allIds.length; i += chunkSize) {
            const chunkIds = allIds.slice(i, i + chunkSize);
    
            const chunkRows = await prisma.transactionStore.findMany({
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
    
            for (const row of chunkRows) {
              const qtyKgsPcs = Number(row.Incoming?.qtyKgsPcs || 0);
              const unitPrice = Number(row.Incoming?.unitPrice || 0);
              const totalPrice = qtyKgsPcs * unitPrice;
    
              const excelRow = worksheet.addRow({
                jobNo: row.Incoming?.jobNo || '',
                materialNo: row.Incoming?.materialNo || '',
                itemName: row.Incoming?.itemName || '',
                itemSpec: row.Incoming?.itemSpec || '',
                lotNo: row.Incoming?.lotNo || '',
                coil: Number(row.Incoming?.coil || 0),
                qtyKgsPcs: qtyKgsPcs,
                unit: row.Incoming?.unit || '',
                totalPrice: totalPrice,
                area: row.Store?.name || '',
                stockNote: row.stockNote || '',
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
                  horizontal:
                    colNumber === 6
                      ? 'center'
                      : colNumber === 7 || colNumber === 9
                      ? 'right'
                      : 'left',
                  wrapText: true
                };
    
                cell.font = {
                  size: 12,
                  bold: colNumber === 1 || colNumber === 2 || colNumber === 9,
                  color: { argb: colNumber === 1 || colNumber === 2 || colNumber === 9 ? 'FF0F172A' : 'FF334155' }
                };
              });
    
              excelRowIndex++;
            }
          }
    
          worksheet.autoFilter = {
            from: 'A1',
            to: 'L1'
          };
    
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          res.setHeader(
            'Content-Disposition',
            `attachment; filename=inventory_report_${Date.now()}.xlsx`
          );
    
          await workbook.xlsx.write(res);
          return res.end();
        } catch (e) {
          return res.status(500).send({ error: e.message });
        }
      },




      
      editStockNote: async (req, res) => {
        try {
          const { userId, stockNote, incomingId } = req.body;
      
          if (userId == null || stockNote == null || incomingId == null) {
            return res.status(400).send({ message: 'missing_required_fields' });
          }
      
          const latestTransactionStore = await prisma.transactionStore.findFirst({
            where: {
              incomingId: Number(incomingId),
              status: 'use'
            },
            orderBy: [
              { timeStmp: 'desc' },
              { id: 'desc' }
            ]
          });
      
          if (!latestTransactionStore) {
            return res.status(404).send({ message: 'transaction_store_not_found' });
          }
      
          await prisma.transactionStore.update({
            where: {
              id: latestTransactionStore.id
            },
            data: {
              stockNote: String(stockNote)
            }
          });
      
          const latestHistory = await prisma.transactionStoreHistory.findFirst({
            where: {
              incomingId: Number(incomingId),
              status: 'use'
            },
            orderBy: [
              { timeStmp: 'desc' },
              { id: 'desc' }
            ]
          });
      
          if (!latestHistory) {
            return res.status(404).send({ message: 'transaction_store_history_not_found' });
          }
      
          const createdHistory = await prisma.transactionStoreHistory.create({
            data: {
              storeId: latestHistory.storeId,
              incomingId: latestHistory.incomingId,
              userId: Number(userId),
              stockNote: String(stockNote),
              type: 'EditStockNote',
              coil: latestHistory.coil,
              qty: latestHistory.qty
            }
          });
      
          return res.send({
            message: 'success',
            results: {
              transactionStoreId: latestTransactionStore.id,
              transactionStoreHistoryId: createdHistory.id
            }
          });
        } catch (e) {
          return res.status(500).send({ error: e.message });
        }
      },






}