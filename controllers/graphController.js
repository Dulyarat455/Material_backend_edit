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
  }
};