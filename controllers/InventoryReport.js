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
                invoiceOne: true,
                materialNo: true,
                remark: true,
                itemName: true,
                itemSpec: true,
                lotNo: true,
                coil: true,
                qtyKgsPcs: true,
                unit: true,
                unitPrice: true,
                notControl: true

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
  
        // 3) เอา materialNo จาก Incoming ไปหา accountCode จาก table Material
        const materialNos = Array.from(
          new Set(
            chunkRows
              .map(row => row.Incoming?.materialNo)
              .filter(x => x != null && String(x).trim() !== '')
              .map(x => String(x).trim())
          )
        );
  
        let materialMap = new Map();
  
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
              accountCode: true
            }
          });
  
          materialMap = new Map(
            materialRows.map(x => [
              String(x.materialNo || '').trim(),
              x
            ])
          );
        }
  
        // 4) map result
        const mapped = chunkRows.map((row) => {
          const qtyKgsPcs = Number(row.Incoming?.qtyKgsPcs || 0);
          const unitPrice = Number(row.Incoming?.unitPrice || 0);
  
          const materialNo = String(row.Incoming?.materialNo || '').trim();
          const materialMaster = materialMap.get(materialNo);
  
          return {
            transactionStoreId: row.id,
            incomingId: row.incomingId,
  
            jobNo: row.Incoming?.jobNo || '',
            recivedDate: row.Incoming?.recivedDate || '',
            invoiceOne: row.Incoming?.invoiceOne || '',
            materialNo: materialNo,
            itemName: row.Incoming?.itemName || '',
            itemSpec: row.Incoming?.itemSpec || '',
            lotNo: row.Incoming?.lotNo || '',
  
            accountCode: materialMaster?.accountCode || '',
  
            coil: Number(row.Incoming?.coil || 0),
            qtyKgsPcs: qtyKgsPcs,
            unit: row.Incoming?.unit || '',
            unitPrice: unitPrice,
            totalPrice: qtyKgsPcs * unitPrice,
  
            area: row.Store?.name || '',
            stockNote: row.stockNote || '',
            notControl: row.Incoming?.notControl || '',
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
          area,
          notControl
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
              ...(lotNo && lotNo !== 'all' ? { lotNo } : {}),

              ...(notControl === 'Not Control'
                ? {
                    notControl: 'yes'
                  }
                : {}),

              ...(notControl === 'Control'
                ? {
                    OR: [
                      { notControl: { not: 'yes' } },
                      { notControl: null }
                    ]
                  }
                : {})
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

        const areaSortPriority = [
          'Pending',
          '1101', '1102', '1103', '1104', '1105', '1106',
          '1107', '1108', '1109', '1110', '1111',
          '1201', '1202', '1203', '1204', '1205', '1206',
          '1207', '1208', '1209', '1210', '1211',
          '2101', '2102', '2103', '2104', '2105', '2106',
          '2201', '2202', '2203', '2204', '2205', '2206',
          '3101', '3102', '3103', '3104', '3105', '3106',
          '3201', '3202', '3203', '3204', '3205', '3206',
          'Chemical'
        ];

        const getAreaSortIndex = (areaName) => {
          const areaText = String(areaName || '').trim();

          const index = areaSortPriority.findIndex(
            x => x.toLowerCase() === areaText.toLowerCase()
          );

          return index >= 0 ? index : 9999;
        };

        const sortInventoryRows = (rows) => {
          return [...rows].sort((a, b) => {
            // 1) Account Code 4520 มาก่อนเสมอ
            const accountA = String(a.accountCode || '').trim() === '4520' ? 0 : 1;
            const accountB = String(b.accountCode || '').trim() === '4520' ? 0 : 1;

            if (accountA !== accountB) {
              return accountA - accountB;
            }

            // 2) Control มาก่อน Not Control
            const controlA = a.notControl === 'yes' ? 1 : 0;
            const controlB = b.notControl === 'yes' ? 1 : 0;

            if (controlA !== controlB) {
              return controlA - controlB;
            }

            // 3) Sort by Item Name
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

            // 4) Sort by Item Spec
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

            // 5) Sort by Area Priority
            const areaA = getAreaSortIndex(a.area);
            const areaB = getAreaSortIndex(b.area);

            if (areaA !== areaB) {
              return areaA - areaB;
            }

            // Area ที่ไม่อยู่ใน priority list ให้เรียง A-Z ต่อ
            const areaTextCompare = String(a.area || '').localeCompare(
              String(b.area || ''),
              undefined,
              {
                numeric: true,
                sensitivity: 'base'
              }
            );

            if (areaTextCompare !== 0) {
              return areaTextCompare;
            }

            // 6) ถ้ายังเท่ากัน ค่อยเรียงตามเวลาเก่า -> ใหม่
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
          { header: 'Invoice', key: 'invoiceOne', width: 20 },
          { header: 'Lot No', key: 'lotNo', width: 18 },
          { header: 'Coil', key: 'coil', width: 12 },
          { header: 'Qty Kgs/Pcs', key: 'qtyKgsPcs', width: 16 },
          { header: 'Unit', key: 'unit', width: 10 },
          { header: 'Unit Price', key: 'unitPrice', width: 16 },
          { header: 'Total Price', key: 'totalPrice', width: 16 },
          { header: 'Area', key: 'area', width: 14 },
          { header: 'Remark', key: 'remark', width: 28 },
          { header: 'Stock Note', key: 'stockNote', width: 28 },
          { header: 'Not Control', key: 'notControlText', width: 18 },
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
                  invoiceOne: true,
                  lotNo: true,
                  coil: true,
                  qtyKgsPcs: true,
                  unit: true,
                  unitPrice: true,
                  notControl: true
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

          // ดึง accountCode จาก Material ด้วย materialNo
          const materialNos = Array.from(
            new Set(
              chunkRows
                .map(row => row.Incoming?.materialNo)
                .filter(x => x != null && String(x).trim() !== '')
                .map(x => String(x).trim())
            )
          );

          let materialMap = new Map();

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
                accountCode: true
              }
            });

            materialMap = new Map(
              materialRows.map(x => [
                String(x.materialNo || '').trim(),
                x
              ])
            );
          }

          for (const row of chunkRows) {
            const qtyKgsPcs = Number(row.Incoming?.qtyKgsPcs || 0);
            const unitPrice = Number(row.Incoming?.unitPrice || 0);
            const totalPrice = qtyKgsPcs * unitPrice;

            const materialNoText = String(row.Incoming?.materialNo || '').trim();
            const materialMaster = materialMap.get(materialNoText);

            exportRows.push({
              jobNo: row.Incoming?.jobNo || '',
              recivedDate: row.Incoming?.recivedDate || '',
              materialNo: materialNoText,
              itemName: row.Incoming?.itemName || '',
              itemSpec: row.Incoming?.itemSpec || '',
              invoiceOne: row.Incoming?.invoiceOne || '',
              lotNo: row.Incoming?.lotNo || '',
              accountCode: materialMaster?.accountCode || '',
              coil: Number(row.Incoming?.coil || 0),
              qtyKgsPcs,
              unit: row.Incoming?.unit || '',
              unitPrice,
              totalPrice,
              area: row.Store?.name || '',
              remark: row.Incoming?.remark || '',
              stockNote: row.stockNote || '',
              notControl: row.Incoming?.notControl || '',

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
        // 4) Sort by Account Code, Control, Material Name, Spec, Area Priority
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
            invoiceOne: item.invoiceOne,
            lotNo: item.lotNo,
            coil: item.coil,
            qtyKgsPcs: item.qtyKgsPcs,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            area: item.area,
            remark: item.remark,
            stockNote: item.stockNote,
            notControlText: item.notControl === 'yes' ? 'Not Control' : '',
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
                colNumber === 7 || colNumber === 16
                  ? 'center'
                  : colNumber === 8 || colNumber === 9 || colNumber === 11 || colNumber === 12
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
        worksheet.getColumn('qtyKgsPcs').numFmt = '#,##0.###';
        worksheet.getColumn('unitPrice').numFmt = '#,##0.00';
        worksheet.getColumn('totalPrice').numFmt = '#,##0';

        worksheet.autoFilter = {
          from: 'A1',
          to: 'Q1'
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
                qty: parseFloat(checkIncoming.qtyKgsPcs)
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
            const qtyFloat = parseFloat(qty);

            if (
              Number.isNaN(incomingIdInt) ||
              Number.isNaN(userIdInt) ||
              Number.isNaN(qtyFloat)
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
                  qtyKgsPcs: qtyFloat
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
                  qty: qtyFloat
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


    editNotControl: async (req, res) => {
      try {
        const { incomingId, controlKey, userId } = req.body;

        if (incomingId == null) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }

        const checkIncoming = await prisma.incoming.findFirst({
            where: {
              id: parseInt(incomingId),
              status: 'use',
            },
          });

          if (!checkIncoming) {
            return res.status(400).send({ message: 'incoming_not_found' });
          }
          

          const results = await prisma.$transaction(async (tx) => {

                const latestTransactionStore = await tx.transactionStore.findFirst({
                  where: {
                    incomingId: parseInt(incomingId),
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
                    id: parseInt(incomingId)
                  },
                  data: {
                    notControl: controlKey
                  }
                });

                const createdHistory = await tx.transactionStoreHistory.create({
                  data: {
                    storeId: latestTransactionStore.storeId,
                    incomingId: latestTransactionStore.incomingId,
                    userId: parseInt(userId),
                    stockNote: latestTransactionStore.stockNote || '',
                    type: 'EditNotControl',
                    coil: parseInt(checkIncoming.coil),
                    qty: parseFloat(checkIncoming.qtyKgsPcs)
                  }
                });

                const createNotControl = await tx.logNotControl.create ({
                  data:{
                    historyId: parseInt(createdHistory.id),
                    notControl: controlKey
                  }
                })

            return {
              updateIncoming,
              createdHistory,
              createNotControl
            };
          });
          
          return res.send({
            message: 'success',
            results
          });

      }catch(e){
        if (
          e.message === 'transaction_store_not_found'
        ) {
          return res.status(400).send({ message: e.message });
        }
        return res.status(500).send({ error: e.message });
      } 
    }





}