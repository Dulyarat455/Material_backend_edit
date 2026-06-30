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


};