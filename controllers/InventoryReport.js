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
                    recivedDate: true,
                    materialNo: true,
                    remark: true,
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
                recivedDate: row.Incoming?.recivedDate || '',
                materialNo: row.Incoming?.materialNo || '',
                itemName: row.Incoming?.itemName || '',
                itemSpec: row.Incoming?.itemSpec || '',
                lotNo: row.Incoming?.lotNo || '',
                coil: Number(row.Incoming?.coil || 0),
                qtyKgsPcs: qtyKgsPcs,
                unit: row.Incoming?.unit || '',
                unitPrice: unitPrice,
                totalPrice: qtyKgsPcs * unitPrice,
                area: row.Store?.name || '',
                stockNote: row.stockNote || '',
                timeStmp: row.timeStmp,
                remark: row.Incoming?.remark || '' 
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
            recivedDate,
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
                ...(recivedDate && recivedDate !== 'all' ? { recivedDate } : {}),
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
      
         


      
         
      
          const getTimeSortValue = (value) => {
            if (!value) return 0;
      
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return 0;
      
            return d.getTime();
          };
      

         const sortInventoryRows = (rows) => {
                return [...rows].sort((a, b) => {
                  const nameCompare = String(a.itemName || '').localeCompare(
                    String(b.itemName || ''),
                    undefined,
                    {
                      numeric: true,
                      sensitivity: 'base'
                    }
                  );

                  if (nameCompare !== 0) {
                    return nameCompare;
                  }

                  const specCompare = String(a.itemSpec || '').localeCompare(
                    String(b.itemSpec || ''),
                    undefined,
                    {
                      numeric: true,
                      sensitivity: 'base'
                    }
                  );

                  if (specCompare !== 0) {
                    return specCompare;
                  }

                  // ถ้า MaterialName และ Spec เท่ากัน ค่อยเรียงตามเวลาเก่า -> ใหม่
                  return getTimeSortValue(a.rawTimeStmp) - getTimeSortValue(b.rawTimeStmp);
                });
          };
      
          // =============================
          // 1) Get all matching ids first
          // =============================
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
      
          // =============================
          // 2) Prepare Excel
          // =============================
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Inventory Report', {
            views: [{ state: 'frozen', ySplit: 1 }]
          });
      
          worksheet.columns = [
            { header: 'Job No', key: 'jobNo', width: 20 },
            { header: 'Received Date', key: 'recivedDate', width: 18 },
            { header: 'Material No', key: 'materialNo', width: 22 },
            { header: 'Item Name', key: 'itemName', width: 28 },
            { header: 'Spec', key: 'itemSpec', width: 22 },
            { header: 'Lot No', key: 'lotNo', width: 18 },
            { header: 'Coil', key: 'coil', width: 12 },
            { header: 'Qty Kgs/Pcs', key: 'qtyKgsPcs', width: 16 },
            { header: 'Unit', key: 'unit', width: 10 },
            { header: 'Unit Price', key: 'unitPrice', width: 16 },
            { header: 'Total Price', key: 'totalPrice', width: 16 },
            { header: 'Area', key: 'area', width: 14 },
            { header: 'Remark', key: 'remark', width: 28 }, 
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
      
          // =============================
          // 3) Fetch data by chunks
          //    เก็บเข้า exportRows ก่อน ยังไม่ addRow
          // =============================
          const exportRows = [];
      
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
                    recivedDate: true,
                    materialNo: true,
                    remark: true,
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
      
              exportRows.push({
                jobNo: row.Incoming?.jobNo || '',
                recivedDate: row.Incoming?.recivedDate || '',
                materialNo: row.Incoming?.materialNo || '',
                itemName: row.Incoming?.itemName || '',
                itemSpec: row.Incoming?.itemSpec || '',
                lotNo: row.Incoming?.lotNo || '',
                coil: Number(row.Incoming?.coil || 0),
                qtyKgsPcs,
                unit: row.Incoming?.unit || '',
                unitPrice,
                totalPrice,
                area: row.Store?.name || '',
                remark: row.Incoming?.remark || '',
                stockNote: row.stockNote || '',
      
                // ใช้แสดงใน Excel
                timeStmp: row.timeStmp
                  ? new Date(row.timeStmp).toLocaleString('th-TH', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : '',
      
                // ใช้สำหรับ sort เท่านั้น
                rawTimeStmp: row.timeStmp
              });
            }
          }
      
          // =============================
          // 4) Sort by Material Name ASC, then Spec ASC
          // =============================
          const sortedRows = sortInventoryRows(exportRows);
      
          let excelRowIndex = 2;
      
          for (const item of sortedRows) {
            const excelRow = worksheet.addRow({
              jobNo: item.jobNo,
              recivedDate: item.recivedDate,
              materialNo: item.materialNo,
              itemName: item.itemName,
              itemSpec: item.itemSpec,
              lotNo: item.lotNo,
              coil: item.coil,
              qtyKgsPcs: item.qtyKgsPcs,
              unit: item.unit,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              area: item.area,
              remark: item.remark,
              stockNote: item.stockNote,
              timeStmp: item.timeStmp
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
                  colNumber === 7
                    ? 'center'
                    : colNumber === 8 || colNumber === 10 || colNumber === 11
                    ? 'right'
                    : 'left',
                wrapText: true
              };
      
              cell.font = {
                size: 12,
                bold:
                  colNumber === 1 ||
                  colNumber === 3 ||
                  colNumber === 10 ||
                  colNumber === 11,
                color: {
                  argb:
                    colNumber === 1 ||
                    colNumber === 2 ||
                    colNumber === 10 ||
                    colNumber === 11
                      ? 'FF0F172A'
                      : 'FF334155'
                }
              };
            });
      
            excelRowIndex++;
          }
      
          // =============================
          // 5) Number format
          // =============================
          worksheet.getColumn('coil').numFmt = '#,##0';
          worksheet.getColumn('qtyKgsPcs').numFmt = '#,##0';
          worksheet.getColumn('unitPrice').numFmt = '#,##0.00';
          worksheet.getColumn('totalPrice').numFmt = '#,##0';
      
          worksheet.autoFilter = {
            from: 'A1',
            to: 'O1'
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

          if (global.io) {
            global.io.emit('materialStore:changed', {
              type: 'materialStoreMove',
              createdHistory
            });
          }
      
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


      editCoil: async (req, res) => {
        try {
          const { userId, incomingId, coil } = req.body;
      
          if (userId == null || incomingId == null || coil == null) {
            return res.status(400).send({ message: 'missing_required_fields' });
          }
      
          const incomingIdInt = parseInt(incomingId);
          const userIdInt = parseInt(userId);
          const coilInt = parseInt(coil);
      
          if (
            Number.isNaN(incomingIdInt) ||
            Number.isNaN(userIdInt) ||
            Number.isNaN(coilInt)
          ) {
            return res.status(400).send({ message: 'invalid_numeric_fields' });
          }
      
          const results = await prisma.$transaction(async (tx) => {
            const checkIncoming = await tx.incoming.findFirst({
              where: {
                id: incomingIdInt,
                status: 'use'
              }
            });
      
            if (!checkIncoming) {
              throw new Error('incoming_not_found');
            }
      
            const latestTransactionStore = await tx.transactionStore.findFirst({
              where: {
                incomingId: incomingIdInt,
                status: 'use'
              },
              orderBy: [
                { timeStmp: 'desc' },
                { id: 'desc' }
              ]
            });
      
            if (!latestTransactionStore) {
              throw new Error('transaction_store_not_found');
            }
      
            const updateIncoming = await tx.incoming.update({
              where: {
                id: incomingIdInt
              },
              data: {
                coil: coilInt
              }
            });
      
            const createdHistory = await tx.transactionStoreHistory.create({
              data: {
                storeId: latestTransactionStore.storeId,
                incomingId: latestTransactionStore.incomingId,
                userId: userIdInt,
                stockNote: latestTransactionStore.stockNote || '',
                type: 'EditCoil',
                coil: coilInt,
                qty: parseInt(checkIncoming.qtyKgsPcs)
              }
            });
      
            return {
              transactionStoreId: latestTransactionStore.id,
              updateIncoming,
              createdHistory
            };
          });
      
          if (global.io) {
            global.io.emit('materialStore:changed', {
              type: 'materialStoreMove',
              ...results
            });
          }
      
          return res.send({
            message: 'success',
            results
          });
        } catch (e) {
          if (
            e.message === 'incoming_not_found' ||
            e.message === 'transaction_store_not_found'
          ) {
            return res.status(400).send({ message: e.message });
          }
      
          return res.status(500).send({ error: e.message });
        }
      },


     editQty: async (req, res) => {
          try {
            const { userId, incomingId, qty } = req.body;

            if (userId == null || incomingId == null || qty == null) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            const incomingIdInt = parseInt(incomingId);
            const userIdInt = parseInt(userId);
            const qtyInt = parseInt(qty);

            if (
              Number.isNaN(incomingIdInt) ||
              Number.isNaN(userIdInt) ||
              Number.isNaN(qtyInt)
            ) {
              return res.status(400).send({ message: 'invalid_numeric_fields' });
            }

            const results = await prisma.$transaction(async (tx) => {
              const checkIncoming = await tx.incoming.findFirst({
                where: {
                  id: incomingIdInt,
                  status: 'use'
                }
              });

              if (!checkIncoming) {
                throw new Error('incoming_not_found');
              }

              const latestTransactionStore = await tx.transactionStore.findFirst({
                where: {
                  incomingId: incomingIdInt,
                  status: 'use'
                },
                orderBy: [
                  { timeStmp: 'desc' },
                  { id: 'desc' }
                ]
              });

              if (!latestTransactionStore) {
                throw new Error('transaction_store_not_found');
              }

              const updateIncoming = await tx.incoming.update({
                where: {
                  id: incomingIdInt
                },
                data: {
                  qtyKgsPcs: qtyInt
                }
              });

              const createdHistory = await tx.transactionStoreHistory.create({
                data: {
                  storeId: latestTransactionStore.storeId,
                  incomingId: latestTransactionStore.incomingId,
                  userId: userIdInt,
                  stockNote: latestTransactionStore.stockNote || '',
                  type: 'EditQty',
                  coil: parseInt(checkIncoming.coil),
                  qty: qtyInt
                }
              });

              return {
                transactionStoreId: latestTransactionStore.id,
                updateIncoming,
                createdHistory
              };
            });

            if (global.io) {
              global.io.emit('materialStore:changed', {
                type: 'materialStoreMove',
                ...results
              });
            }

            return res.send({
              message: 'success',
              results
            });
          } catch (e) {
            if (
              e.message === 'incoming_not_found' ||
              e.message === 'transaction_store_not_found'
            ) {
              return res.status(400).send({ message: e.message });
            }

            return res.status(500).send({ error: e.message });
          }
    }



}