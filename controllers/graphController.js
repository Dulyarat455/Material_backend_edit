const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Helper: Save Inventory Snapshot
|--------------------------------------------------------------------------
| ถูกเรียกได้จาก:
| 1. API Controller
| 2. Scheduler ใน server.js
*/
async function saveInventorySnapshot(timeStmp) {
  const inventoryTime = new Date(timeStmp);

  if (Number.isNaN(inventoryTime.getTime())) {
    throw new Error('invalid_timeStmp');
  }

  const chunkSize = 500;

  /*
  |--------------------------------------------------------------------------
  | 1. ตรวจว่ามี Inventory Snapshot ของวันนี้แล้วหรือยัง
  |--------------------------------------------------------------------------
  */

  const startOfDay = new Date(inventoryTime);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(inventoryTime);
  endOfDay.setHours(23, 59, 59, 999);

  const existingInventory =
    await prisma.recordInventory.findFirst({
      where: {
        timeStmp: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      select: {
        id: true,
        timeStmp: true
      }
    });

  if (existingInventory) {
    return {
      alreadySaved: true,
      existingTimeStmp: existingInventory.timeStmp,
      requestedTimeStmp: inventoryTime,

      totalTransactionStore: 0,
      preparedCount: 0,
      createdCount: 0,
      skippedCount: 0,

      totalReadChunks: 0,
      totalCreateChunks: 0,
      chunkSize,

      skippedSample: []
    };
  }

  /*
  |--------------------------------------------------------------------------
  | 2. ดึง ID จาก TransactionStore ที่ status = use
  |--------------------------------------------------------------------------
  */

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
    return {
      alreadySaved: false,
      timeStmp: inventoryTime,

      totalTransactionStore: 0,
      preparedCount: 0,
      createdCount: 0,
      skippedCount: 0,

      totalReadChunks: 0,
      totalCreateChunks: 0,
      chunkSize,

      skippedSample: []
    };
  }

  const recordItems = [];
  const skippedItems = [];

  /*
  |--------------------------------------------------------------------------
  | 3. ดึง TransactionStore และ Incoming ทีละ 500
  |--------------------------------------------------------------------------
  */

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

    /*
    |--------------------------------------------------------------------------
    | 4. ใช้ materialNo ไปหา lineNo จาก Material
    |--------------------------------------------------------------------------
    */

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
        const materialKey = String(
          material.materialNo || ''
        ).trim();

        if (!materialMap.has(materialKey)) {
          materialMap.set(
            materialKey,
            material
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 5. เตรียมข้อมูล RecordInventory
    |--------------------------------------------------------------------------
    */

    for (const transactionStore of transactionStoreRows) {
      const incoming = transactionStore.Incoming;

      if (!incoming) {
        skippedItems.push({
          transactionStoreId: transactionStore.id,
          incomingId: transactionStore.incomingId,
          reason: 'incoming_not_found'
        });

        continue;
      }

      if (incoming.status !== 'use') {
        skippedItems.push({
          transactionStoreId: transactionStore.id,
          incomingId: transactionStore.incomingId,
          reason: 'incoming_inactive'
        });

        continue;
      }

      const materialNo = String(
        incoming.materialNo || ''
      ).trim();

      const material =
        materialMap.get(materialNo);

      const coil =
        Number(incoming.coil || 0);

      const qty =
        Number(incoming.qtyKgsPcs || 0);

      const unitPrice =
        Number(incoming.unitPrice || 0);

      /*
       * ป้องกันค่า NaN หรือ Infinity
       */
      if (
        !Number.isFinite(coil) ||
        !Number.isFinite(qty) ||
        !Number.isFinite(unitPrice)
      ) {
        skippedItems.push({
          transactionStoreId: transactionStore.id,
          incomingId: transactionStore.incomingId,
          reason: 'invalid_numeric_value'
        });

        continue;
      }

      /*
       * ทำงานเหมือน Excel ROUND(number, 0)
       */
      const totalPrice = Math.round(
        unitPrice * qty
      );

      const lineNo = String(
        material?.lineNo || ''
      )
        .trim()
        .toUpperCase();

      recordItems.push({
        incomingId:
          Number(transactionStore.incomingId),

        storeId:
          Number(transactionStore.storeId),

        coil,
        qty,
        totalPrice,
        lineNo,

        /*
         * ทุกรายการใน Snapshot ใช้เวลาเดียวกัน
         */
        timeStmp: inventoryTime
      });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | 6. Create RecordInventory ทีละ 500
  |--------------------------------------------------------------------------
  */

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

    createdCount +=
      created.count || chunk.length;
  }

  return {
    alreadySaved: false,
    timeStmp: inventoryTime,

    totalTransactionStore:
      allTransactionStoreIds.length,

    preparedCount:
      recordItems.length,

    createdCount,

    skippedCount:
      skippedItems.length,

    totalReadChunks: Math.ceil(
      allTransactionStoreIds.length /
      chunkSize
    ),

    totalCreateChunks: Math.ceil(
      recordItems.length /
      chunkSize
    ),

    chunkSize,

    skippedSample:
      skippedItems.slice(0, 30)
  };
}


/*
|--------------------------------------------------------------------------
| Controller exports
|--------------------------------------------------------------------------
*/

module.exports = {
  /*
   * Scheduler ใน server.js จะเรียก function นี้โดยตรง
   */
  saveInventorySnapshot,

  /*
   * API:
   * POST /api/graph/saveInventory
   */
  saveInventory: async (req, res) => {
    try {
      const { timeStmp } = req.body;

      if (
        timeStmp == null ||
        String(timeStmp).trim() === ''
      ) {
        return res.status(400).send({
          message: 'missing_required_fields'
        });
      }

      const results =
        await saveInventorySnapshot(
          timeStmp
        );

      return res.send({
        message: results.alreadySaved
          ? 'inventory_already_saved_today'
          : 'save_inventory_success',

        results
      });
    } catch (e) {
      console.error(
        'saveInventory error:',
        e
      );

      if (
        e.message === 'invalid_timeStmp'
      ) {
        return res.status(400).send({
          message: e.message
        });
      }

      return res.status(500).send({
        message: 'save_inventory_failed',
        error: e.message
      });
    }
  },

  updateGraph: async (req, res) => {
    try {
      const chunkSize = 500;

      const baseDate = new Date();
  
      const startOfDay = new Date(baseDate);
      startOfDay.setHours(0, 0, 0, 0);
  
      const endOfDay = new Date(baseDate);
      endOfDay.setHours(23, 59, 59, 999);
  
      // =============================
      // 1) ดึง RecordInventory ของวันนี้
      // =============================
  
      const recordInventoryRows =
        await prisma.recordInventory.findMany({
          where: {
            timeStmp: {
              gte: startOfDay,
              lte: endOfDay
            },
            status: 'use'
          },
          select: {
            id: true,
            incomingId: true
          },
          orderBy: {
            id: 'asc'
          }
        });
  
      if (!recordInventoryRows.length) {
        return res.send({
          message: 'update_graph_success',
          date: baseDate,
          recordInventoryTodayCount: 0,
          editCoilHistoryCount: 0,
          editQtyHistoryCount: 0,
          updatedCoilCount: 0,
          updatedQtyCount: 0,
          stockOutIncomingCount: 0,
          softDeletedCount: 0
        });
      }
  
      const recordIdsByIncomingId = new Map();
  
      for (const row of recordInventoryRows) {
        const incomingId = Number(row.incomingId);
  
        if (!recordIdsByIncomingId.has(incomingId)) {
          recordIdsByIncomingId.set(incomingId, []);
        }
  
        recordIdsByIncomingId.get(incomingId).push(row.id);
      }
  
      const todayIncomingIds = Array.from(
        recordIdsByIncomingId.keys()
      );
  
      // =============================
      // 2) ดึง TransactionStoreHistory วันนี้
      //    เฉพาะ EditCoil / EditQty
      // =============================
  
      const historyRows =
        await prisma.transactionStoreHistory.findMany({
          where: {
            status: 'use',
            type: {
              in: ['EditCoil', 'EditQty']
            },
            timeStmp: {
              gte: startOfDay,
              lte: endOfDay
            },
            incomingId: {
              in: todayIncomingIds
            }
          },
          orderBy: [
            {
              timeStmp: 'desc'
            },
            {
              id: 'desc'
            }
          ],
          select: {
            id: true,
            incomingId: true,
            type: true,
            coil: true,
            qty: true,
            timeStmp: true
          }
        });
  
      /*
       * ถ้า incomingId เดียวกันมีการแก้หลายครั้งในวันเดียว
       * ใช้ค่าล่าสุดเท่านั้น เพราะ orderBy desc แล้ว
       */
      const latestEditCoilMap = new Map();
      const latestEditQtyMap = new Map();
  
      for (const row of historyRows) {
        const incomingId = Number(row.incomingId);
  
        if (row.type === 'EditCoil') {
          if (!latestEditCoilMap.has(incomingId)) {
            latestEditCoilMap.set(incomingId, row);
          }
        }
  
        if (row.type === 'EditQty') {
          if (!latestEditQtyMap.has(incomingId)) {
            latestEditQtyMap.set(incomingId, row);
          }
        }
      }
  
      let updatedCoilCount = 0;
      let updatedQtyCount = 0;
  
      // =============================
      // 3) Update Coil ลง RecordInventory
      // =============================
  
      const editCoilEntries = Array.from(
        latestEditCoilMap.entries()
      );
  
      for (
        let i = 0;
        i < editCoilEntries.length;
        i += chunkSize
      ) {
        const chunk = editCoilEntries.slice(
          i,
          i + chunkSize
        );
  
        for (const [incomingId, history] of chunk) {
          const recordIds =
            recordIdsByIncomingId.get(incomingId) || [];
  
          if (!recordIds.length) {
            continue;
          }
  
          const coilValue = Number(history.coil || 0);
  
          if (!Number.isFinite(coilValue)) {
            continue;
          }
  
          const updated =
            await prisma.recordInventory.updateMany({
              where: {
                id: {
                  in: recordIds
                },
                status: 'use',
                timeStmp: {
                  gte: startOfDay,
                  lte: endOfDay
                }
              },
              data: {
                coil: coilValue
              }
            });
  
          updatedCoilCount += updated.count || 0;
        }
      }
  
      // =============================
      // 4) Update Qty ลง RecordInventory
      //    และ update totalPrice ตาม qty ใหม่
      // =============================
  
      const editQtyIncomingIds = Array.from(
        latestEditQtyMap.keys()
      );
  
      const incomingUnitPriceMap = new Map();
  
      for (
        let i = 0;
        i < editQtyIncomingIds.length;
        i += chunkSize
      ) {
        const chunkIncomingIds =
          editQtyIncomingIds.slice(i, i + chunkSize);
  
        const incomingRows =
          await prisma.incoming.findMany({
            where: {
              id: {
                in: chunkIncomingIds
              },
              status: 'use'
            },
            select: {
              id: true,
              unitPrice: true
            }
          });
  
        for (const incoming of incomingRows) {
          incomingUnitPriceMap.set(
            Number(incoming.id),
            Number(incoming.unitPrice || 0)
          );
        }
      }
  
      const editQtyEntries = Array.from(
        latestEditQtyMap.entries()
      );
  
      for (
        let i = 0;
        i < editQtyEntries.length;
        i += chunkSize
      ) {
        const chunk = editQtyEntries.slice(
          i,
          i + chunkSize
        );
  
        for (const [incomingId, history] of chunk) {
          const recordIds =
            recordIdsByIncomingId.get(incomingId) || [];
  
          if (!recordIds.length) {
            continue;
          }
  
          const qtyValue = Number(history.qty || 0);
  
          if (!Number.isFinite(qtyValue)) {
            continue;
          }
  
          const unitPrice =
            Number(incomingUnitPriceMap.get(incomingId) || 0);
  
          const totalPrice =
            Number.isFinite(unitPrice)
              ? Math.round(unitPrice * qtyValue)
              : 0;
  
          const updated =
            await prisma.recordInventory.updateMany({
              where: {
                id: {
                  in: recordIds
                },
                status: 'use',
                timeStmp: {
                  gte: startOfDay,
                  lte: endOfDay
                }
              },
              data: {
                qty: qtyValue,
                totalPrice: totalPrice
              }
            });
  
          updatedQtyCount += updated.count || 0;
        }
      }
  
      // =============================
      // 5) Soft delete RecordInventory
      //    ถ้า incomingId นั้นอยู่ใน StockOut
      // =============================
  
      const stockOutIncomingIdSet = new Set();
  
      for (
        let i = 0;
        i < todayIncomingIds.length;
        i += chunkSize
      ) {
        const chunkIncomingIds =
          todayIncomingIds.slice(i, i + chunkSize);
  
        const stockOutRows =
          await prisma.stockOut.findMany({
            where: {
              incomingId: {
                in: chunkIncomingIds
              },
              status: 'use'
            },
            select: {
              incomingId: true
            }
          });
  
        for (const stockOut of stockOutRows) {
          stockOutIncomingIdSet.add(
            Number(stockOut.incomingId)
          );
        }
      }
  
      const stockOutIncomingIds = Array.from(
        stockOutIncomingIdSet
      );
  
      let softDeletedCount = 0;
  
      for (
        let i = 0;
        i < stockOutIncomingIds.length;
        i += chunkSize
      ) {
        const chunkIncomingIds =
          stockOutIncomingIds.slice(i, i + chunkSize);
  
        const updated =
          await prisma.recordInventory.updateMany({
            where: {
              incomingId: {
                in: chunkIncomingIds
              },
              timeStmp: {
                gte: startOfDay,
                lte: endOfDay
              },
              status: 'use'
            },
            data: {
              status: 'delete'
            }
          });
  
        softDeletedCount += updated.count || 0;
      }
  
      return res.send({
        message: 'update_graph_success',
  
        date: baseDate,
  
        recordInventoryTodayCount:
          recordInventoryRows.length,
  
        editCoilHistoryCount:
          latestEditCoilMap.size,
  
        editQtyHistoryCount:
          latestEditQtyMap.size,
  
        updatedCoilCount,
        updatedQtyCount,
  
        stockOutIncomingCount:
          stockOutIncomingIds.length,
  
        softDeletedCount
      });
    } catch (e) {
      console.error('updateGraph error:', e);
  
      return res.status(500).send({
        message: 'update_graph_failed',
        error: e.message
      });
    }
  },



  listInventory: async (req, res) => {
    try {
      const chunkSize = 500;
  
      const where = {
        status: 'use'
      };
  
      // =============================
      // 1) ดึง id จาก RecordInventory ก่อน
      // =============================
  
      const idRows = await prisma.recordInventory.findMany({
        where,
        orderBy: {
          id: 'desc'
        },
        select: {
          id: true
        }
      });
  
      const allIds = idRows.map(row => row.id);
      const results = [];
  
      // =============================
      // 2) วนทีละ 500
      // =============================
  
      for (let i = 0; i < allIds.length; i += chunkSize) {
        const chunkIds = allIds.slice(i, i + chunkSize);
  
        const recordRows = await prisma.recordInventory.findMany({
          where: {
            id: {
              in: chunkIds
            },
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true,
            incomingId: true,
            storeId: true,
            coil: true,
            qty: true,
            totalPrice: true,
            lineNo: true,
            timeStmp: true,
            status: true
          }
        });
  
        if (!recordRows.length) {
          continue;
        }
  
        // =============================
        // 3) เตรียม incomingIds / storeIds
        // =============================
  
        const incomingIds = Array.from(
          new Set(
            recordRows
              .map(row => row.incomingId)
              .filter(id => id != null)
              .map(id => Number(id))
          )
        );
  
        const storeIds = Array.from(
          new Set(
            recordRows
              .map(row => row.storeId)
              .filter(id => id != null)
              .map(id => Number(id))
          )
        );
  
        // =============================
        // 4) หา Incoming ตาม incomingId
        // =============================
  
        const incomingMap = new Map();
  
        if (incomingIds.length) {
          const incomingRows = await prisma.incoming.findMany({
            where: {
              id: {
                in: incomingIds
              }
            },
            select: {
              id: true,
              jobNo: true,
              materialNo: true,
              notControl: true
            }
          });
  
          for (const incoming of incomingRows) {
            incomingMap.set(
              Number(incoming.id),
              incoming
            );
          }
        }
  
        // =============================
        // 5) หา Store ตาม storeId
        // =============================
  
        const storeMap = new Map();
  
        if (storeIds.length) {
          const storeRows = await prisma.store.findMany({
            where: {
              id: {
                in: storeIds
              }
            },
            select: {
              id: true,
              name: true
            }
          });
  
          for (const store of storeRows) {
            storeMap.set(
              Number(store.id),
              store
            );
          }
        }
  
        // =============================
        // 6) เอา materialNo จาก Incoming ไปหา Material.lineNo
        // =============================
  
        const materialNos = Array.from(
          new Set(
            Array.from(incomingMap.values())
              .map(incoming => incoming.materialNo)
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
              material
            );
          }
        }
  
        // =============================
        // 7) Map result
        // =============================
  
        const mappedRows = recordRows.map((record) => {
          const incomingId = Number(record.incomingId);
          const storeId = Number(record.storeId);
  
          const incoming = incomingMap.get(incomingId);
          const store = storeMap.get(storeId);
  
          const materialNo = String(
            incoming?.materialNo || ''
          ).trim();
  
          const material = materialMap.get(materialNo);
  
          return {
            incomingId,
  
            jobNo: incoming?.jobNo || '',
            notControl: incoming?.notControl || '',
  
            storeId,
            storeName: store?.name || '',
  
            coil: Number(record.coil || 0),
            qty: Number(record.qty || 0),
            totalPrice: Number(record.totalPrice || 0),
  
            lineNo: String(
              material?.lineNo || record.lineNo || ''
            )
              .trim()
              .toUpperCase(),
  
            timeStmp: record.timeStmp
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
      console.error('listInventory error:', e);
  
      return res.status(500).send({
        message: 'list_inventory_failed',
        error: e.message
      });
    }
  },


  // listTransaction: async (req, res) => {
  //   try {
  //     const chunkSize = 500;
  
  //     const where = {
  //       status: 'use'
  //     };
  
  //     // =============================
  //     // 1) ดึง id จาก TransactionStoreHistory ก่อน
  //     // =============================
  
  //     const idRows = await prisma.transactionStoreHistory.findMany({
  //       where,
  //       orderBy: {
  //         id: 'desc'
  //       },
  //       select: {
  //         id: true
  //       }
  //     });
  
  //     const allIds = idRows.map(row => row.id);
  //     const results = [];
  
  //     // =============================
  //     // 2) วนทีละ 500
  //     // =============================
  
  //     for (let i = 0; i < allIds.length; i += chunkSize) {
  //       const chunkIds = allIds.slice(i, i + chunkSize);
  
  //       const historyRows = await prisma.transactionStoreHistory.findMany({
  //         where: {
  //           id: {
  //             in: chunkIds
  //           },
  //           status: 'use'
  //         },
  //         orderBy: {
  //           id: 'desc'
  //         },
  //         select: {
  //           id: true,
  //           incomingId: true,
  //           type: true,
  //           timeStmp: true
  //         }
  //       });
  
  //       if (!historyRows.length) {
  //         continue;
  //       }
  
  //       // =============================
  //       // 3) เตรียม incomingIds
  //       // =============================
  
  //       const incomingIds = Array.from(
  //         new Set(
  //           historyRows
  //             .map(row => row.incomingId)
  //             .filter(id => id != null)
  //             .map(id => Number(id))
  //         )
  //       );
  
  //       // =============================
  //       // 4) หา Incoming ตาม incomingId
  //       // =============================
  
  //       const incomingMap = new Map();
  
  //       if (incomingIds.length) {
  //         const incomingRows = await prisma.incoming.findMany({
  //           where: {
  //             id: {
  //               in: incomingIds
  //             }
  //           },
  //           select: {
  //             id: true,
  //             jobNo: true,
  //             materialNo: true
  //           }
  //         });
  
  //         for (const incoming of incomingRows) {
  //           incomingMap.set(
  //             Number(incoming.id),
  //             incoming
  //           );
  //         }
  //       }
  
  //       // =============================
  //       // 5) เอา materialNo จาก Incoming ไปหา Material.lineNo
  //       // =============================
  
  //       const materialNos = Array.from(
  //         new Set(
  //           Array.from(incomingMap.values())
  //             .map(incoming => incoming.materialNo)
  //             .filter(value => value != null && String(value).trim() !== '')
  //             .map(value => String(value).trim())
  //         )
  //       );
  
  //       const materialMap = new Map();
  
  //       if (materialNos.length) {
  //         const materialRows = await prisma.material.findMany({
  //           where: {
  //             materialNo: {
  //               in: materialNos
  //             },
  //             status: 'use'
  //           },
  //           select: {
  //             materialNo: true,
  //             lineNo: true
  //           }
  //         });
  
  //         for (const material of materialRows) {
  //           materialMap.set(
  //             String(material.materialNo || '').trim(),
  //             material
  //           );
  //         }
  //       }
  
  //       // =============================
  //       // 6) Map result
  //       // =============================
  
  //       const mappedRows = historyRows.map((history) => {
  //         const incomingId = Number(history.incomingId);
  //         const incoming = incomingMap.get(incomingId);
  
  //         const materialNo = String(
  //           incoming?.materialNo || ''
  //         ).trim();
  
  //         const material = materialMap.get(materialNo);
  
  //         return {
  //           incomingId,
  
  //           jobNo: incoming?.jobNo || '',
  
  //           lineNo: String(
  //             material?.lineNo || ''
  //           )
  //             .trim()
  //             .toUpperCase(),
  
  //           type: history.type || '',
  
  //           timeStmp: history.timeStmp
  //         };
  //       });
  
  //       results.push(...mappedRows);
  //     }
  
  //     return res.send({
  //       results,
  //       total: results.length,
  //       chunkSize
  //     });
  //   } catch (e) {
  //     console.error('listTransaction error:', e);
  
  //     return res.status(500).send({
  //       message: 'list_transaction_failed',
  //       error: e.message
  //     });
  //   }
  // },




  listTransaction: async (req, res) => {
    try {
      const chunkSize = 500;
      const results = [];
  
      const getLineNoMapByMaterialNos = async (materialNos) => {
        const cleanMaterialNos = Array.from(
          new Set(
            materialNos
              .filter(value => value != null && String(value).trim() !== '')
              .map(value => String(value).trim())
          )
        );
  
        const materialMap = new Map();
  
        if (!cleanMaterialNos.length) {
          return materialMap;
        }
  
        const materialRows = await prisma.material.findMany({
          where: {
            materialNo: {
              in: cleanMaterialNos
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
  
        return materialMap;
      };
  
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
                materialNo: true
              }
            }
          }
        });
  
        const materialNos = chunkRows.map(row => row.Incoming?.materialNo);
        const materialMap = await getLineNoMapByMaterialNos(materialNos);
  
        const mapped = chunkRows.map((row) => {
          const materialNo = String(row.Incoming?.materialNo || '').trim();
  
          return {
            incomingId: Number(row.incomingId || 0),
            jobNo: row.Incoming?.jobNo || '',
            lineNo: materialMap.get(materialNo) || '',
            type: row.type || '',
            timeStmp: row.timeStmp
          };
        });
  
        results.push(...mapped);
      }
  
      // =========================
      // 2) Job issue complete
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
            id: {
              in: chunkIds
            },
            status: 'use',
            type: 'issue',
            state: 'complete'
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true,
            IncomingId: true,
            inchargeTime: true
          }
        });
  
        const incomingIds = Array.from(
          new Set(
            chunkRows
              .map(row => row.IncomingId)
              .filter(id => id != null)
              .map(id => Number(id))
          )
        );
  
        const incomingMap = new Map();
  
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
              materialNo: true
            }
          });
  
          for (const incoming of incomingRows) {
            incomingMap.set(Number(incoming.id), incoming);
          }
        }
  
        const materialNos = Array.from(incomingMap.values()).map(
          incoming => incoming.materialNo
        );
  
        const materialMap = await getLineNoMapByMaterialNos(materialNos);
  
        const mapped = chunkRows.map((row) => {
          const incomingId = Number(row.IncomingId || 0);
          const incoming = incomingMap.get(incomingId);
  
          const materialNo = String(incoming?.materialNo || '').trim();
  
          return {
            incomingId,
            jobNo: incoming?.jobNo || '',
            lineNo: materialMap.get(materialNo) || '',
            type: 'Issue',
            timeStmp: row.inchargeTime || null
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
                materialNo: true
              }
            }
          }
        });
  
        const materialNos = chunkRows.map(row => row.Incoming?.materialNo);
        const materialMap = await getLineNoMapByMaterialNos(materialNos);
  
        const mapped = chunkRows.map((row) => {
          const materialNo = String(row.Incoming?.materialNo || '').trim();
  
          return {
            incomingId: Number(row.incomingId || 0),
            jobNo: row.Incoming?.jobNo || '',
            lineNo: materialMap.get(materialNo) || '',
            type: 'StockOut',
            timeStmp: row.timeStmp
          };
        });
  
        results.push(...mapped);
      }
  
      // =========================
      // 4) Sort รวมตามเวลา ล่าสุด -> เก่าสุด
      // =========================
  
      const toSortableTime = (value) => {
        if (!value) return 0;
  
        const date = new Date(value);
        const time = date.getTime();
  
        return Number.isNaN(time) ? 0 : time;
      };
  
      results.sort((a, b) => {
        return toSortableTime(b.timeStmp) - toSortableTime(a.timeStmp);
      });
  
      return res.send({
        results,
        total: results.length,
        chunkSize
      });
    } catch (e) {
      console.error('listTransaction error:', e);
  
      return res.status(500).send({
        message: 'list_transaction_failed',
        error: e.message
      });
    }
  },



  createTargetGraph: async (req,res) => {
    try{
      const { graph, target } = req.body;

      if ( !graph  || target == null) {
        return res.status(400).send({ message: 'missing_required_fields' });
      }

      const checkTargetGraph = await prisma.targetGraph.findFirst({
          where: {
            graph: graph ,
            target: parseFloat(target)  ,
            status: 'use',
          },
        });

        if (checkTargetGraph) {
          return res.status(400).send({ message: 'targetGraph_already' });
        }  


        const targetGraph = await prisma.targetGraph.create({
          data: {
            graph: graph,
            target: parseFloat(target)
          },
        });

      return res.send({
          message: 'create_targetGraph_success',
          data: targetGraph,
      });

    }catch(e){
      return res.status(500).send({ error: e.message });
    }
  },


  updateTargetGraph: async (req, res) => {
    try {
      const { graph, target } = req.body;
  
      if (!graph || target == null) {
        return res.status(400).send({
          message: 'missing_required_fields'
        });
      }
  
      const targetValue = parseFloat(target);
  
      if (Number.isNaN(targetValue)) {
        return res.status(400).send({
          message: 'invalid_target'
        });
      }
  
      const oldTargetGraph = await prisma.targetGraph.findFirst({
        where: {
          graph: String(graph),
          status: 'use'
        },
        orderBy: {
          id: 'desc'
        }
      });
  
      let targetGraph;
  
      if (oldTargetGraph) {
        targetGraph = await prisma.targetGraph.update({
          where: {
            id: oldTargetGraph.id
          },
          data: {
            target: targetValue
          }
        });
      } else {
        targetGraph = await prisma.targetGraph.create({
          data: {
            graph: String(graph),
            target: targetValue,
            status: 'use'
          }
        });
      }
  
      return res.send({
        message: 'update_targetGraph_success',
        data: targetGraph
      });
  
    } catch (e) {
      console.error('updateTargetGraph error:', e);
  
      return res.status(500).send({
        message: 'update_targetGraph_failed',
        error: e.message
      });
    }
  },

  listTargetGraph: async (req, res) => {
    try{
      const rows = await prisma.targetGraph.findMany({
        where: {
          status: 'use'
        }
    })
    return res.send({ results: rows })

    }catch(e){
      return res.status(500).send({ error: e.message });
    }
  },


  exportExcel: async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const chunkSize = 500;
  
      const {
        startDate,
        endDate,
        notControlFilter = 'all'
      } = req.body || {};
  
      // =============================
      // Date helper
      // =============================
  
      const toInputDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
  
        return `${year}-${month}-${day}`;
      };
  
      const toDateOnly = (value) => {
        if (!value) return null;
  
        const d = new Date(value);
  
        if (Number.isNaN(d.getTime())) return null;
  
        d.setHours(0, 0, 0, 0);
  
        return d;
      };
  
      const getDefaultDateRange = () => {
        const today = new Date();
  
        const start = new Date(today);
        start.setDate(today.getDate() - 11);
  
        return {
          startDateValue: toInputDate(start),
          endDateValue: toInputDate(today)
        };
      };
  
      const defaultRange = getDefaultDateRange();
  
      const startDateValue = startDate || defaultRange.startDateValue;
      const endDateValue = endDate || defaultRange.endDateValue;
  
      const start = toDateOnly(startDateValue);
      const end = toDateOnly(endDateValue);
  
      if (!start || !end || start > end) {
        return res.status(400).send({
          message: 'invalid_date_range'
        });
      }
  
      const endForQuery = new Date(end);
      endForQuery.setHours(23, 59, 59, 999);
  
      const toDateKey = (value) => {
        if (!value) return '';
  
        const d = new Date(value);
  
        if (Number.isNaN(d.getTime())) return '';
  
        return toInputDate(d);
      };
  
      const toDisplayDate = (dateKey) => {
        if (!dateKey) return '';
  
        const [year, month, day] = dateKey.split('-');
  
        const monthNames = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];
  
        const mIndex = Number(month) - 1;
        const shortYear = String(year).slice(-2);
  
        return `${Number(day)}-${monthNames[mIndex]}-${shortYear}`;
      };
  
      const getDateKeysBetween = (startValue, endValue) => {
        const result = [];
  
        const cursor = new Date(`${startValue}T00:00:00`);
        const endCursor = new Date(`${endValue}T00:00:00`);
  
        while (cursor <= endCursor) {
          result.push(toInputDate(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
  
        return result;
      };
  
      const dateKeys = getDateKeysBetween(startDateValue, endDateValue);
  
      // =============================
      // Common helper
      // =============================
  
      const normalizeText = (value) => {
        return String(value || '').trim();
      };
  
      const normalizeLineNo = (value) => {
        return normalizeText(value).toUpperCase();
      };
  
      const normalizeType = (value) => {
        return normalizeText(value);
      };
  
      const isNotControl = (row) => {
        return normalizeText(row.notControl).toLowerCase() === 'yes';
      };
  
      const applyNotControlFilter = (rows) => {
        if (notControlFilter === 'Control') {
          return rows.filter(row => !isNotControl(row));
        }
  
        if (notControlFilter === 'Not Control') {
          return rows.filter(row => isNotControl(row));
        }
  
        return rows;
      };
  
      const isGen = (row) => {
        return normalizeLineNo(row.lineNo) === 'GEN';
      };
  
      const isLam = (row) => {
        return normalizeLineNo(row.lineNo) === 'LAM';
      };
  
      const isStoreName = (row, storeName) => {
        return normalizeText(row.storeName).toLowerCase() === storeName.toLowerCase();
      };
  
      const sum = (rows, key) => {
        return rows.reduce((total, row) => {
          return total + Number(row?.[key] || 0);
        }, 0);
      };
  
      const countUniqueIncoming = (rows) => {
        return new Set(
          rows
            .map(row => Number(row.incomingId || 0))
            .filter(id => id > 0)
        ).size;
      };
  
      const roundExcel = (value, decimals) => {
        const factor = Math.pow(10, decimals);
  
        return Math.round(Number(value || 0) * factor) / factor;
      };
  
      const toMillionBaht = (value) => {
        return Number(value || 0) / 1000000;
      };
  
      const toTon = (value) => {
        return roundExcel(Number(value || 0) / 1000, 0);
      };
  
      const groupByDate = (rows) => {
        const map = new Map();
  
        for (const row of rows) {
          const dateKey = toDateKey(row.timeStmp);
  
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
  
          map.get(dateKey).push(row);
        }
  
        return map;
      };
  
      // =============================
      // Load Inventory Rows
      // เหมือน /api/graph/listInventory
      // =============================
  
      const loadInventoryRows = async () => {
        const where = {
          status: 'use',
          timeStmp: {
            gte: start,
            lte: endForQuery
          }
        };
  
        const idRows = await prisma.recordInventory.findMany({
          where,
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true
          }
        });
  
        const allIds = idRows.map(row => row.id);
        const results = [];
  
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunkIds = allIds.slice(i, i + chunkSize);
  
          const recordRows = await prisma.recordInventory.findMany({
            where: {
              id: {
                in: chunkIds
              },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              incomingId: true,
              storeId: true,
              coil: true,
              qty: true,
              totalPrice: true,
              lineNo: true,
              timeStmp: true,
              status: true
            }
          });
  
          if (!recordRows.length) {
            continue;
          }
  
          const incomingIds = Array.from(
            new Set(
              recordRows
                .map(row => row.incomingId)
                .filter(id => id != null)
                .map(id => Number(id))
            )
          );
  
          const storeIds = Array.from(
            new Set(
              recordRows
                .map(row => row.storeId)
                .filter(id => id != null)
                .map(id => Number(id))
            )
          );
  
          const incomingMap = new Map();
  
          if (incomingIds.length) {
            const incomingRows = await prisma.incoming.findMany({
              where: {
                id: {
                  in: incomingIds
                }
              },
              select: {
                id: true,
                jobNo: true,
                materialNo: true,
                notControl: true
              }
            });
  
            for (const incoming of incomingRows) {
              incomingMap.set(Number(incoming.id), incoming);
            }
          }
  
          const storeMap = new Map();
  
          if (storeIds.length) {
            const storeRows = await prisma.store.findMany({
              where: {
                id: {
                  in: storeIds
                }
              },
              select: {
                id: true,
                name: true
              }
            });
  
            for (const store of storeRows) {
              storeMap.set(Number(store.id), store);
            }
          }
  
          const materialNos = Array.from(
            new Set(
              Array.from(incomingMap.values())
                .map(incoming => incoming.materialNo)
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
                material
              );
            }
          }
  
          const mappedRows = recordRows.map((record) => {
            const incomingId = Number(record.incomingId);
            const storeId = Number(record.storeId);
  
            const incoming = incomingMap.get(incomingId);
            const store = storeMap.get(storeId);
  
            const materialNo = String(incoming?.materialNo || '').trim();
            const material = materialMap.get(materialNo);
  
            return {
              incomingId,
  
              jobNo: incoming?.jobNo || '',
              notControl: incoming?.notControl || '',
  
              storeId,
              storeName: store?.name || '',
  
              coil: Number(record.coil || 0),
              qty: Number(record.qty || 0),
              totalPrice: Number(record.totalPrice || 0),
  
              lineNo: String(material?.lineNo || record.lineNo || '')
                .trim()
                .toUpperCase(),
  
              timeStmp: record.timeStmp
            };
          });
  
          results.push(...mappedRows);
        }
  
        return results;
      };
  
      // =============================
      // Load Transaction Rows
      // เหมือน /api/graph/listTransaction
      // =============================
  
      const getLineNoMapByMaterialNos = async (materialNos) => {
        const cleanMaterialNos = Array.from(
          new Set(
            materialNos
              .filter(value => value != null && String(value).trim() !== '')
              .map(value => String(value).trim())
          )
        );
  
        const materialMap = new Map();
  
        if (!cleanMaterialNos.length) {
          return materialMap;
        }
  
        const materialRows = await prisma.material.findMany({
          where: {
            materialNo: {
              in: cleanMaterialNos
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
  
        return materialMap;
      };
  
      const loadTransactionRows = async () => {
        const results = [];
  
        // =========================
        // 1) TransactionStoreHistory
        // =========================
  
        const tshIds = await prisma.transactionStoreHistory.findMany({
          where: {
            status: 'use',
            timeStmp: {
              gte: start,
              lte: endForQuery
            }
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
                  materialNo: true
                }
              }
            }
          });
  
          const materialNos = chunkRows.map(row => row.Incoming?.materialNo);
          const materialMap = await getLineNoMapByMaterialNos(materialNos);
  
          const mapped = chunkRows.map((row) => {
            const materialNo = String(row.Incoming?.materialNo || '').trim();
  
            return {
              incomingId: Number(row.incomingId || 0),
              jobNo: row.Incoming?.jobNo || '',
              lineNo: materialMap.get(materialNo) || '',
              type: row.type || '',
              timeStmp: row.timeStmp
            };
          });
  
          results.push(...mapped);
        }
  
        // =========================
        // 2) Job Issue Complete
        // =========================
  
        const jobIds = await prisma.job.findMany({
          where: {
            status: 'use',
            type: 'issue',
            state: 'complete',
            inchargeTime: {
              gte: start,
              lte: endForQuery
            }
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
              id: {
                in: chunkIds
              },
              status: 'use',
              type: 'issue',
              state: 'complete'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              IncomingId: true,
              inchargeTime: true
            }
          });
  
          const incomingIds = Array.from(
            new Set(
              chunkRows
                .map(row => row.IncomingId)
                .filter(id => id != null)
                .map(id => Number(id))
            )
          );
  
          const incomingMap = new Map();
  
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
                materialNo: true
              }
            });
  
            for (const incoming of incomingRows) {
              incomingMap.set(Number(incoming.id), incoming);
            }
          }
  
          const materialNos = Array.from(incomingMap.values()).map(
            incoming => incoming.materialNo
          );
  
          const materialMap = await getLineNoMapByMaterialNos(materialNos);
  
          const mapped = chunkRows.map((row) => {
            const incomingId = Number(row.IncomingId || 0);
            const incoming = incomingMap.get(incomingId);
  
            const materialNo = String(incoming?.materialNo || '').trim();
  
            return {
              incomingId,
              jobNo: incoming?.jobNo || '',
              lineNo: materialMap.get(materialNo) || '',
              type: 'Issue',
              timeStmp: row.inchargeTime || null
            };
          });
  
          results.push(...mapped);
        }
  
        // =========================
        // 3) StockOut
        // ดึงไว้ให้เหมือน listTransaction เดิม
        // แต่ปัจจุบันกราฟไม่ได้ใช้ type StockOut
        // =========================
  
        const stockOutIds = await prisma.stockOut.findMany({
          where: {
            status: 'use',
            timeStmp: {
              gte: start,
              lte: endForQuery
            }
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
                  materialNo: true
                }
              }
            }
          });
  
          const materialNos = chunkRows.map(row => row.Incoming?.materialNo);
          const materialMap = await getLineNoMapByMaterialNos(materialNos);
  
          const mapped = chunkRows.map((row) => {
            const materialNo = String(row.Incoming?.materialNo || '').trim();
  
            return {
              incomingId: Number(row.incomingId || 0),
              jobNo: row.Incoming?.jobNo || '',
              lineNo: materialMap.get(materialNo) || '',
              type: 'StockOut',
              timeStmp: row.timeStmp
            };
          });
  
          results.push(...mapped);
        }
  
        return results;
      };
  
      // =============================
      // Load data
      // =============================
  
      const inventoryRows = await loadInventoryRows();
      const transactionRows = await loadTransactionRows();
  
      const inventoryByDate = groupByDate(inventoryRows);
      const transactionByDate = groupByDate(transactionRows);
  
      // =============================
      // Build Export Rows
      // =============================
  
      const exportRows = dateKeys.map((dateKey) => {
        const inventoryDateRows = inventoryByDate.get(dateKey) || [];
        const transactionDateRows = transactionByDate.get(dateKey) || [];
  
        // =========================
        // Graph 1: Stock Amount by Item
        // ไม่ใช้ Control Filter ตามหน้าเว็บ
        // =========================
  
        const controlRows = inventoryDateRows.filter(row => !isNotControl(row));
        const notControlRows = inventoryDateRows.filter(row => isNotControl(row));
  
        const controlTotalPrice = sum(controlRows, 'totalPrice');
        const notControlTotalPrice = sum(notControlRows, 'totalPrice');

        const amtC = toMillionBaht(controlTotalPrice);
        const amtNC = toMillionBaht(notControlTotalPrice);
        const amtA = toMillionBaht(controlTotalPrice + notControlTotalPrice);
  
        // =========================
        // Graph 2,3,4,5,6 ใช้ Control Filter
        // =========================
  
        const filteredInventoryRows = applyNotControlFilter(inventoryDateRows);
  
        const genRows = filteredInventoryRows.filter(row => isGen(row));
        const lamRows = filteredInventoryRows.filter(row => isLam(row));
  
        const qtyG = toTon(sum(genRows, 'qty'));
        const qtyL = toTon(sum(lamRows, 'qty'));
        const qtyT = qtyG + qtyL;
  
        const genTotalPrice = sum(genRows, 'totalPrice');
        const lamTotalPrice = sum(lamRows, 'totalPrice');

        const amtG = toMillionBaht(genTotalPrice);
        const amtL = toMillionBaht(lamTotalPrice);
        const amtT = toMillionBaht(genTotalPrice + lamTotalPrice);
  
        // Pallet Storage Total
        const nonChemicalRows = filteredInventoryRows.filter(row => {
          return !isStoreName(row, 'Chemical');
        });
  
        const rackTRows = nonChemicalRows.filter(row => {
          return !isStoreName(row, 'Pending');
        });
  
        const pendingTRows = nonChemicalRows.filter(row => {
          return isStoreName(row, 'Pending');
        });
  
        const rackT = countUniqueIncoming(rackTRows);
        const pendingT = countUniqueIncoming(pendingTRows);
        const totalT = rackT + pendingT;
  
        // Pallet Storage GEN
        const genNonChemicalRows = genRows.filter(row => {
          return !isStoreName(row, 'Chemical');
        });
  
        const rackGRows = genNonChemicalRows.filter(row => {
          return !isStoreName(row, 'Pending');
        });
  
        const pendingGRows = genNonChemicalRows.filter(row => {
          return isStoreName(row, 'Pending');
        });
  
        const rackG = countUniqueIncoming(rackGRows);
        const pendingG = countUniqueIncoming(pendingGRows);
        const totalG = rackG + pendingG;
  
        // Pallet Storage LAM
        const lamNonChemicalRows = lamRows.filter(row => {
          return !isStoreName(row, 'Chemical');
        });
  
        const rackLRows = lamNonChemicalRows.filter(row => {
          return !isStoreName(row, 'Pending');
        });
  
        const pendingLRows = lamNonChemicalRows.filter(row => {
          return isStoreName(row, 'Pending');
        });
  
        const rackL = countUniqueIncoming(rackLRows);
        const pendingL = countUniqueIncoming(pendingLRows);
        const totalL = rackL + pendingL;
  
        // =========================
        // Graph 7: Pallet Movement Stock In
        // =========================
  
        const stockInRows = transactionDateRows.filter(row => {
          return normalizeType(row.type) === 'StockIn';
        });
  
        const stockInGRows = stockInRows.filter(row => isGen(row));
        const stockInLRows = stockInRows.filter(row => isLam(row));
  
        const stockInG = countUniqueIncoming(stockInGRows);
        const stockInL = countUniqueIncoming(stockInLRows);
        const stockInT = stockInG + stockInL;
  
        // =========================
        // Graph 8: Issue - Return
        // =========================
  
        const issueRows = transactionDateRows.filter(row => {
          return normalizeType(row.type) === 'Issue';
        });
  
        const returnRows = transactionDateRows.filter(row => {
          return normalizeType(row.type) === 'ReturnStockIn';
        });
  
        const issueGRows = issueRows.filter(row => isGen(row));
        const issueLRows = issueRows.filter(row => isLam(row));
  
        const issueG = countUniqueIncoming(issueGRows);
        const issueL = countUniqueIncoming(issueLRows);
        const returnT = countUniqueIncoming(returnRows);
        const issueReturnT = issueG + issueL + returnT;
  
        // =========================
        // Graph 9: Move Area
        // =========================
  
        const moveRows = transactionDateRows.filter(row => {
          return normalizeType(row.type) === 'MoveArea';
        });
  
        const moveGRows = moveRows.filter(row => isGen(row));
        const moveLRows = moveRows.filter(row => isLam(row));
  
        const moveG = countUniqueIncoming(moveGRows);
        const moveL = countUniqueIncoming(moveLRows);
        const moveT = moveG + moveL;
  
        return {
          date: toDisplayDate(dateKey),
  
          amtC,
          amtNC,
          amtA,
  
          qtyG,
          qtyL,
          qtyT,
  
          amtG,
          amtL,
          amtT,
  
          rackT,
          pendingT,
          totalT,
  
          rackG,
          pendingG,
          totalG,
  
          rackL,
          pendingL,
          totalL,
  
          stockInG,
          stockInL,
          stockInT,
  
          issueG,
          issueL,
          returnT,
          issueReturnT,
  
          moveG,
          moveL,
          moveT
        };
      });
  
      // =============================
      // Excel
      // =============================
  
      const workbook = new ExcelJS.Workbook();
  
      workbook.creator = 'Graph Dashboard';
      workbook.created = new Date();
  
      const worksheet = workbook.addWorksheet('Graph Data', {
        views: [
          {
            state: 'frozen',
            xSplit: 1,
            ySplit: 1
          }
        ]
      });
  
      worksheet.columns = [
        { header: 'Date', key: 'date', width: 13 },
  
        { header: 'AMT-C', key: 'amtC', width: 11 },
        { header: 'AMT-NC', key: 'amtNC', width: 11 },
        { header: 'AMT-A', key: 'amtA', width: 11 },
  
        { header: 'Qty-G', key: 'qtyG', width: 11 },
        { header: 'Qty-L', key: 'qtyL', width: 11 },
        { header: 'Qty-T', key: 'qtyT', width: 11 },
  
        { header: 'AMT-G', key: 'amtG', width: 11 },
        { header: 'AMT-L', key: 'amtL', width: 11 },
        { header: 'AMT-T', key: 'amtT', width: 11 },
  
        { header: 'Rack-T', key: 'rackT', width: 11 },
        { header: 'Pending-T', key: 'pendingT', width: 12 },
        { header: 'Total-T', key: 'totalT', width: 11 },
  
        { header: 'Rack-G', key: 'rackG', width: 11 },
        { header: 'Pending-G', key: 'pendingG', width: 12 },
        { header: 'Total-G', key: 'totalG', width: 11 },
  
        { header: 'Rack-L', key: 'rackL', width: 11 },
        { header: 'Pending-L', key: 'pendingL', width: 12 },
        { header: 'Total-L', key: 'totalL', width: 11 },
  
        { header: 'StockIn-G', key: 'stockInG', width: 12 },
        { header: 'StockIn-L', key: 'stockInL', width: 12 },
        { header: 'StockIn-T', key: 'stockInT', width: 12 },
  
        { header: 'Issue-G', key: 'issueG', width: 11 },
        { header: 'Issue-L', key: 'issueL', width: 11 },
        { header: 'Return', key: 'returnT', width: 11 },
        { header: 'Iss-Ret-T', key: 'issueReturnT', width: 12 },
  
        { header: 'Move-G', key: 'moveG', width: 11 },
        { header: 'Move-L', key: 'moveL', width: 11 },
        { header: 'Move-T', key: 'moveT', width: 11 }
      ];
  
      const headerRow = worksheet.getRow(1);
      headerRow.height = 22;
  
      const setBorder = (cell, color = 'FFB8C9DC') => {
        cell.border = {
          top: { style: 'thin', color: { argb: color } },
          left: { style: 'thin', color: { argb: color } },
          bottom: { style: 'thin', color: { argb: color } },
          right: { style: 'thin', color: { argb: color } }
        };
      };
  
      const getHeaderColor = (colNumber) => {
        // Date
        if (colNumber === 1) return 'FFD9EAF7';
  
        // AMT / Qty
        if (colNumber >= 2 && colNumber <= 10) return 'FFEAF4FF';
  
        // Rack / Pending
        if (colNumber >= 11 && colNumber <= 19) return 'FFEFF6FF';
  
        // Movement
        if (colNumber >= 20 && colNumber <= 29) return 'FFF5EAFE';
  
        return 'FFEAF4FF';
      };
  
      const getFontColor = (colNumber) => {
        if (colNumber >= 11 && colNumber <= 19) return 'FF2F65D9';
        if (colNumber >= 20 && colNumber <= 29) return 'FF6B21A8';
        return 'FF000000';
      };
  
      headerRow.eachCell((cell, colNumber) => {
        cell.font = {
          bold: true,
          color: { argb: getFontColor(colNumber) },
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
          fgColor: { argb: getHeaderColor(colNumber) }
        };
  
        setBorder(cell, 'FF94A3B8');
      });
      
      let excelRowIndex = 2;

      for (const row of exportRows) {
        const excelRow = worksheet.addRow(row);
        
        const isBlueRow = excelRowIndex % 2 === 0;
        const bgColor = isBlueRow ? 'FFDBE7F3' : 'FFFFFFFF';

        excelRow.height = 22;
  
        excelRow.eachCell((cell, colNumber) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber === 1 ? 'left' : 'right',
            wrapText: false
          };
  
          cell.font = {
            size: 12,
            bold: [
              4, 7, 10,
              13, 16, 19,
              22, 26, 29
            ].includes(colNumber),
            color: {
              argb: getFontColor(colNumber)
            }
          };
  
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: bgColor
            }
          };
  
          setBorder(cell);
  
          // Amount columns
          if ([2, 3, 4, 8, 9, 10].includes(colNumber)) {
            cell.numFmt = '0.00';
          }
  
          // Count columns
          if (colNumber >= 5 && ![8, 9, 10].includes(colNumber)) {
            cell.numFmt = '#,##0';
          }
        });

        excelRowIndex++;
      }
  
      // =============================
      // Vertical separator like picture
      // =============================
  
      const separatorCols = [
        4, 7, 10,
        13, 16, 19,
        22, 26, 29
      ];
  
      for (const colNumber of separatorCols) {
        const col = worksheet.getColumn(colNumber);
  
        col.eachCell((cell) => {
          cell.border = {
            ...cell.border,
            right: {
              style: 'medium',
              color: {
                argb: 'FF000000'
              }
            }
          };
        });
      }
  
      worksheet.autoFilter = {
        from: 'A1',
        to: 'AC1'
      };
  
      // =============================
      // Send file
      // =============================

      const now = new Date();

      const fileTime = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('') + '_' + [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join('');

  
      const fileName = `graph_export_${startDateValue}_to_${endDateValue}_timeStmp_${fileTime}.xlsx`;
  
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
  
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${fileName}`
      );
  
      await workbook.xlsx.write(res);
  
      return res.end();
  
    } catch (e) {
      console.error('exportGraphExcel error:', e);
  
      return res.status(500).send({
        message: 'export_graph_excel_failed',
        error: e.message
      });
    }
  },




};