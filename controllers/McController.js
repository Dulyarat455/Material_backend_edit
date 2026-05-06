const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();
const https = require('https');
const { execFile } = require('child_process');
const tls = require('tls');

module.exports = {
    stockIn : async (req,res) =>{
        try{
            const { jobNo, yearMonth, recivedDate, inspector,
                    unloadBy, invoiceOne, taxLnvNo, materialNo,
                    unitPrice, qtyOfPalletPack, coil, qtyKgsPcs,
                    unit, kgsCoil, odCoil, remark, millSheet, itemName,
                    itemSpec, lotNo, packing, rosh, result, supplier, 
                    amount,
                    //store
                    storageArea, 
                    // user
                    userId,
                    //transaction Store
                    stockNote

             } = req.body;
         
            if (!jobNo   ||
              !materialNo  || !unit   || !itemName 
              || !itemSpec  || !storageArea || userId == null 

            ) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }


              const checkIncoming = await prisma.incoming.findFirst({
                where: {
                  jobNo: jobNo,
                  status: 'use',
                  StockOut: {
                    none: {
                      status: 'use'
                    }
                  }
                },
                orderBy: {
                  id: 'desc'
                }
              });

              if (checkIncoming) {
                return res.status(400).send({ message: 'incoming_already' });
              }


            const checkInMaterialMaster = await prisma.material.findFirst({
              where:{
                materialNo: materialNo,
                status: 'use'
              }
            })

            if(!checkInMaterialMaster){
              return res.status(400).send({ message: 'not_found_this_Material_in_Master' });
            }



              const data = await prisma.$transaction(async (tx) => {
                const incoming = await tx.incoming.create({
                    data: {
                      jobNo: jobNo,
                      yearMonth: yearMonth,
                      recivedDate: recivedDate,
                      inspector: inspector,
                      unloadBy: unloadBy,
                      invoiceOne: invoiceOne,
                      taxLnvNo: taxLnvNo,
                      materialNo: materialNo,
                      unitPrice: unitPrice,
                      qtyOfPalletPack: qtyOfPalletPack,
                      coil: parseInt(coil),
                      qtyKgsPcs: parseInt(qtyKgsPcs),
                      unit: unit,
                      kgsCoil: kgsCoil,
                      odCoil: odCoil,
                      remark: remark,
                      millSheet: millSheet,
                      itemName: itemName,
                      itemSpec: itemSpec,
                      lotNo: lotNo,
                      packing: packing,
                      rosh: rosh,
                      result: result,
                      supplier: supplier,
                      amount: amount
                    },
                    select: {
                      id: true,
                      jobNo: true,
                      status: true,
                    },
                });
    
                const store = await tx.store.findFirst({
                    where: {
                      name: storageArea,
                      status: 'use',
                    },
                });
    
                if (!store) {
                  throw new Error('store_not_found');
                }
    
                const transactionStroe = await tx.transactionStore.create({
                    data:{
                      storeId: parseInt(store.id),
                      incomingId: parseInt(incoming.id),
                      userId: parseInt(userId),
                      stockNote: stockNote
                    }
                });
    
                const transactionStroeHistory = await tx.transactionStoreHistory.create({
                    data:{
                      storeId: parseInt(store.id),
                      incomingId: parseInt(incoming.id),
                      userId: parseInt(userId),
                      stockNote: stockNote,
                      type: "StockIn",
                      coil: parseInt(coil),
                      qty: parseInt(qtyKgsPcs)
                    }
                });
    
                return {
                  store,
                  incoming,
                  transactionStroe,
                  transactionStroeHistory
                };
            });

            // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
            if (global.io) {
              global.io.emit('materialStore:changed', { type: 'materialStoreMove', ...data });
            }
    
            return res.send({
                message: 'add_storeIn_success',
                data: data,
            });


        }catch(e){

          if (e.message === 'store_not_found') {
            return res.status(400).send({ message: 'store_not_found' });
          }
          return res.status(500).send({ error: e.message });

        }

    },

    fetchIncomingAll: async (req, res) => {
      try {
        const layouts = await prisma.mapStoreLayOut.findMany({
          where: {
            status: 'use',
            Store: {
              status: 'use'
            }
          },
          orderBy: [
            { zone: 'asc' },
            { row: 'asc' },
            { storeId: 'asc' }
          ],
          include: {
            Store: {
              select: {
                id: true,
                name: true,
                status: true,
                TransactionStore: {
                  where: {
                    status: 'use',
                    Incoming: {
                      status: 'use'
                    }
                  },
                  orderBy: {
                    timeStmp: 'asc'
                  },
                  include: {
                    Incoming: true,
                    User: {
                      select: {
                        id: true,
                        empNo: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        });
    
        const results = layouts.map((layout) => {
          const storeCode = layout.Store?.name || '';
    
          const materials = (layout.Store?.TransactionStore || []).map((tx, index) => ({
            transactionId: tx.id,
            incomingId: tx.incomingId,
    
            jobNo: tx.Incoming?.jobNo || '',
            yearMonth: tx.Incoming?.yearMonth || '',
            recivedDate: tx.Incoming?.recivedDate || '',
            inspector: tx.Incoming?.inspector || '',
            unloadBy: tx.Incoming?.unloadBy || '',
            invoiceOne: tx.Incoming?.invoiceOne || '',
            taxLnvNo: tx.Incoming?.taxLnvNo || '',
    
            materialNo: tx.Incoming?.materialNo || '',
            itemName: tx.Incoming?.itemName || '',
            itemSpec: tx.Incoming?.itemSpec || '',
            unitPrice: tx.Incoming?.unitPrice || '',
            qtyOfPalletPack: tx.Incoming?.qtyOfPalletPack || '',
            coil: tx.Incoming?.coil ?? 0,
            qtyKgsPcs: tx.Incoming?.qtyKgsPcs ?? 0,
            unit: tx.Incoming?.unit || '',
            kgsCoil: tx.Incoming?.kgsCoil || '',
            odCoil: tx.Incoming?.odCoil || '',
            remark: tx.Incoming?.remark || '',
            millSheet: tx.Incoming?.millSheet || '',
            lotNo: tx.Incoming?.lotNo || '',
            packing: tx.Incoming?.packing || '',
            rosh: tx.Incoming?.rosh || '',
            result: tx.Incoming?.result || '',
            supplier: tx.Incoming?.supplier || '',
            amount: tx.Incoming?.amount || '',
    
            stockNote: tx.stockNote || '',
            timeStmp: tx.timeStmp,
    
            userId: tx.User?.id || null,
            userEmpNo: tx.User?.empNo || '',
            userName: tx.User?.name || '',
    
            fifoRank: index + 1
          }));
    
          let slotStatus = 'EMPTY';
    
          if (storeCode === '2201') {
            slotStatus = 'REJECTED';
          } else if (materials.length > 0) {
            slotStatus = 'OCCUPIED';
          }
    
          return {
            mapId: layout.id,
            storeId: layout.storeId,
            storeCode,
            zone: layout.zone,
            row: layout.row,
            status: slotStatus,
            usedQty: materials.reduce((sum, m) => sum + (Number(m.qtyKgsPcs) || 0), 0),
            materials
          };
        });
    
        return res.send({ results });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },




    moveArea: async (req, res) => {
      try {
        const { incomingId, storeId, userId, storeCodeDestination, stockNote } = req.body;
    
        if (
          incomingId == null ||
          storeId == null ||
          userId == null ||
          storeCodeDestination == null
        ) {
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
    
        const store = await prisma.store.findFirst({
          where: {
            name: storeCodeDestination,
            status: 'use',
          },
        });
    
        if (!store) {
          throw new Error('store_not_found');
        }
    
        const data = await prisma.$transaction(async (tx) => {
          // หา location เดิมก่อน
          const oldTransaction = await tx.transactionStore.findFirst({
            where: {
              incomingId: parseInt(incomingId),
              storeId: parseInt(storeId),
              status: 'use',
            },
          });
    
          if (!oldTransaction) {
            throw new Error('old_transaction_not_found');
          }
    
          // delete old location ด้วย id
          const transactionStoreDelete = await tx.transactionStore.delete({
            where: {
              id: oldTransaction.id,
            },
          });
    
          const transactionStroe = await tx.transactionStore.create({
            data: {
              storeId: parseInt(store.id),
              incomingId: parseInt(incomingId),
              userId: parseInt(userId),
              stockNote: stockNote || '',
            },
          });
    
          const transactionStroeHistory = await tx.transactionStoreHistory.create({
            data: {
              storeId: parseInt(store.id),
              incomingId: parseInt(incomingId),
              userId: parseInt(userId),
              stockNote: stockNote || '',
              type: "MoveArea",
              coil: parseInt(checkIncoming.coil),
              qty: parseInt(checkIncoming.qtyKgsPcs)
            },
          });
    
          return {
            transactionStoreDelete,
            transactionStroe,
            transactionStroeHistory,
          };
        });

         // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
            if (global.io) {
              global.io.emit('materialStore:changed', { type: 'materialStoreMove', ...data });
            }
    
        return res.send({
          message: 'move_storeArea_success',
          data: data,
        });
      } catch (e) {
        if (e.message === 'store_not_found') {
          return res.status(400).send({ message: 'store_not_found' });
        }
    
        if (e.message === 'old_transaction_not_found') {
          return res.status(400).send({ message: 'old_transaction_not_found' });
        }
    
        return res.status(500).send({ error: e.message });
      }
    },




    stockOutByProduction: async (req, res) => {
      try {
        const { jobId, incomingId, userId, inchargeTime, mcRemark, denial } = req.body;
    

        if(denial === false){     
            if (
              jobId == null ||
              incomingId == null ||
              userId == null ||
              !inchargeTime 
              
            ) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }
        
            const jobIdInt = parseInt(jobId);
            const incomingIdInt = parseInt(incomingId);
            const userIdInt = parseInt(userId);
            const stockOutDate = new Date(inchargeTime);
        
            if (
              Number.isNaN(jobIdInt) ||
              Number.isNaN(incomingIdInt) ||
              Number.isNaN(userIdInt)
            ) {
              return res.status(400).send({ message: 'invalid_numeric_fields' });
            }
        
            if (isNaN(stockOutDate.getTime())) {
              return res.status(400).send({ message: 'invalid_inchargeTime' });
            }
        
            const results = await prisma.$transaction(async (tx) => {
              const checkJob = await tx.job.findFirst({
                where: {
                  id: jobIdInt,
                  status: 'use',
                },
              });
        
              if (!checkJob) {
                throw new Error('this_job_notFound');
              }

        
              const checkTransactionStore = await tx.transactionStore.findFirst({
                where: {
                  incomingId: incomingIdInt,
                  status: 'use',
                },
              });
        
              if (!checkTransactionStore) {
                throw new Error('transaction_store_notFound');
              }

              const checkIncoming =  await tx.incoming.findFirst({
                  where:{
                      id: incomingIdInt,
                      status: 'use'
                  }
              })       

              if(!checkIncoming){
                throw new Error('incoming_notFound');
              }
        
              const inventoryUpdate = await tx.job.update({
                where: {
                  id: jobIdInt,
                },
                data: {
                  IncomingId: incomingIdInt,
                  inchargeByUserId: userIdInt,
                  inchargeTime: stockOutDate,
                  remarkMC: mcRemark,
                  state: 'complete',
                },
              });
        
              const deletedTransactionStore = await tx.transactionStore.update({
                where: {
                  id: checkTransactionStore.id,
                },
                data: {
                  status: 'delete'
                }
              });

              const addIncomingLoc = await tx.incomingLoc.create({
                data: {
                  incomingId: incomingIdInt,
                  coil: parseInt(checkIncoming.coil),
                  qty: parseInt(checkIncoming.qtyKgsPcs),
                  jobId: jobIdInt
                }
              })
        
              return {
                inventoryUpdate,
                deletedTransactionStore,
                addIncomingLoc
              };
            });

             // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
            if (global.io) {
              global.io.emit('materialStore:changed', { type: 'materialStoreMove', ...results });
              global.io.emit('materialJob:changed', { type: 'materialIssue', ...results });
            }
        
            return res.send({
              message: 'success',
              results,
            });
      }
      else if(denial === true){
        if (
          jobId == null ||
          userId == null ||
          !inchargeTime 
          
        ) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }

        const jobIdInt = parseInt(jobId);
        const userIdInt = parseInt(userId);
        const stockOutDate = new Date(inchargeTime);


        const results = await prisma.$transaction(async (tx) => {
          const checkJob = await tx.job.findFirst({
            where: {
              id: jobIdInt,
              status: 'use',
            },
          });
    
          if (!checkJob) {
            throw new Error('this_job_notFound');
          }

          const inventoryUpdate = await tx.job.update({
            where: {
              id: jobIdInt,
            },
            data: {
              inchargeByUserId: userIdInt,
              inchargeTime: stockOutDate,
              remarkMC: mcRemark,
              state: 'denial',
            },
          });
    
          return {
            inventoryUpdate
          };
        })

        // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
       if (global.io) {
        global.io.emit('materialJob:changed', { type: 'materialIssue', ...results });
      }

        return res.send({
          message: 'success',
          results,
        });

      }

      } catch (e) {
        if (
          e.message === 'this_job_notFound' ||
          e.message === 'transaction_store_notFound' ||
          e.message ===  'incoming_notFound'
        ) {
          return res.status(400).send({ message: e.message });
        }
    
        return res.status(500).send({ error: e.message });
      }
    },



    stockInByProduction: async (req, res) => {
      try{
          const {jobNoIncoming, jobId,  storeId,  userId, inchargeTime, stockNote, coil, qty, denial, mcRemark } = req.body;


          if(denial === false){ 
            
            if(jobNoIncoming == null || jobId == null || storeId == null || userId == null || inchargeTime == null ){
              return res.status(400).send({ message: 'missing_required_fields' });
            }
  
  
            const jobIdInt = parseInt(jobId);
            const userIdInt = parseInt(userId);
            const storeIdInt = parseInt(storeId);
            const stockInDate = new Date(inchargeTime);
  
            
            const results = await prisma.$transaction(async (tx) => {
  
              const getIncoming = await tx.incoming.findFirst({
                where: {
                  jobNo: jobNoIncoming,
                  status: 'use',
                  StockOut: {
                    none: {
                      status: 'use'
                    }
                  }
                },
                orderBy: {
                  id: 'desc'
                }
              });

              if(!getIncoming){
                throw new Error('incoming_notFound_inSystem');
              }
  
              const incomingIdInt = parseInt(getIncoming.id);
  
                const checkJob = await tx.job.findFirst({
                  where: {
                    id: jobIdInt,
                    status: 'use',
                  },
                });
          
                if (!checkJob) {
                  throw new Error('this_job_notFound');
                }
  
  
                const checkTransactionStore = await tx.transactionStore.findFirst({
                  where: {
                    incomingId: incomingIdInt,
                    status: 'use',
                  },
                });
          
                if (checkTransactionStore) {
                  throw new Error('canNot_returnStockIn_have_material_inStock');
                }


  
                const updateIncoming = await tx.incoming.update({
                  where:{
                    id: incomingIdInt,
                    status: "use"
                  },
                  data:{
                    coil: parseInt(coil)  ,
                    qtyKgsPcs: parseInt(qty)
                  }
                })
  
  
  
                const addIncomingLoc = await tx.incomingLoc.create({
                  data: {
                    incomingId: incomingIdInt,
                    coil: parseInt(updateIncoming.coil),
                    qty: parseInt(updateIncoming.qtyKgsPcs),
                    jobId: jobIdInt
                  }
                })
  
  
                const inventoryUpdate = await tx.job.update({
                  where: {
                    id: jobIdInt,
                  },
                  data: {
                    IncomingId: incomingIdInt,
                    inchargeByUserId: userIdInt,
                    inchargeTime: stockInDate,
                    remarkMC: mcRemark,
                    state: 'complete',
                  },
                });
  
  
                const addTransactionStore =  await tx.transactionStore.create({
                  data:{
                    storeId: storeIdInt,
                    incomingId: incomingIdInt,
                    userId: userIdInt,
                    stockNote: stockNote 
                  }
                })
  
                const addTransactionStoreHistory = await tx.transactionStoreHistory.create({
                   data:{
                    storeId: storeIdInt,
                    incomingId: incomingIdInt,
                    userId: userIdInt,
                    stockNote: stockNote, 
                    type: "ReturnStockIn",
                    coil: parseInt(coil)  ,
                    qty:  parseInt(qty)
                   }
                })
  
                return {
                  updateIncoming,
                  addIncomingLoc,
                  inventoryUpdate,
                  addTransactionStore,
                  addTransactionStoreHistory
                };
            })


             // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
             if (global.io) {
              global.io.emit('materialStore:changed', { type: 'materialStoreMove', ...results });
              global.io.emit('materialJob:changed', { type: 'materialReturn', ...results });
            }
  
            return res.send({
              message: 'success',
              results,
            });


          }
          else if(denial === true){
            if(jobId == null || userId == null || !inchargeTime){
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            
            const jobIdInt = parseInt(jobId);
            const userIdInt = parseInt(userId);
            const stockInDate = new Date(inchargeTime);


            const results = await prisma.$transaction(async (tx) => {

                const checkJob = await tx.job.findFirst({
                  where: {
                    id: jobIdInt,
                    status: 'use',
                  },
                });
          
                if (!checkJob) {
                  throw new Error('this_job_notFound');
                }



                const inventoryUpdate = await tx.job.update({
                  where: {
                    id: jobIdInt,
                  },
                  data: {
                    inchargeByUserId: userIdInt,
                    inchargeTime: stockInDate,
                    remarkMC: mcRemark,
                    state: 'denial',
                  },
                });

                return {
                  inventoryUpdate
                };

            })

             // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
            if (global.io) {
              global.io.emit('materialJob:changed', { type: 'materialReturn', ...results });
            }

            return res.send({
              message: 'success',
              results,
            });

          }

      }catch(e){
        if (
          e.message === 'this_job_notFound' ||
          e.message === 'canNot_returnStockIn_have_material_inStock' ||
          e.message ===  'incoming_notFound_inSystem'
        ) {
          return res.status(400).send({ message: e.message });
        }
        return res.status(500).send({ error: e.message });
      }
    },
    
    

    outStock: async (req, res) => {
      try {
        const { incomingId, inchargeByUserId, remark } = req.body;
    
        if (incomingId == null || inchargeByUserId == null) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }
    
        const data = await prisma.$transaction(async (tx) => {
          const incoming = await tx.incoming.findFirst({
            where: {
              id: parseInt(incomingId),
              status: 'use'
            }
          });
    
          if (!incoming) {
            throw new Error('incoming_notFound');
          }
    
          const incomingInStockOut = await tx.stockOut.findFirst({
            where: {
              incomingId: parseInt(incomingId),
              status: 'use'
            }
          });
    
          if (incomingInStockOut) {
            throw new Error('incoming_in_stockOut_already');
          }
    
          const checkTransactionStore = await tx.transactionStore.findFirst({
            where: {
              incomingId: parseInt(incomingId),
              status: 'use'
            }
          });
    
          if (!checkTransactionStore) {
            throw new Error('do_not_have_this_incoming_inStore');
          }
    
          const deletedTransactionStore = await tx.transactionStore.update({
            where: {
              id: parseInt(checkTransactionStore.id)
            },
            data: {
              status: 'delete'
            }
          });
    
          const stockOut = await tx.stockOut.create({
            data: {
              incomingId: parseInt(incomingId),
              inchargeByUserId: parseInt(inchargeByUserId),
              remark: remark || '',
              coil: parseInt(incoming.coil),
              qty: parseInt(incoming.qtyKgsPcs) 
            },
            select: {
              id: true,
              incomingId: true,
              inchargeByUserId: true,
              remark: true
            }
          });
    
          return {
            deletedTransactionStore,
            stockOut
          };
        });

         // ✅ ส่งสัญญาณไปให้ทุก client รู้ว่ามีการเปลี่ยนแปลง
         if (global.io) {
          global.io.emit('materialStore:changed', { type: 'materialStoreMove', ...data });
        }
    
        return res.send({
          message: 'out_stock_success',
          data
        });
      } catch (e) {
        if (e.message === 'incoming_notFound') {
          return res.status(400).send({ message: 'incoming_notFound' });
        }
    
        if (e.message === 'incoming_in_stockOut_already') {
          return res.status(400).send({ message: 'incoming_in_stockOut_already' });
        }
    
        if (e.message === 'do_not_have_this_incoming_inStore') {
          return res.status(400).send({ message: 'do_not_have_this_incoming_inStore' });
        }
    
        return res.status(500).send({ error: e.message });
      }
    },



    fetchOneIncoming: async (req, res) => {
      try {
        const { jobNo } = req.body;
    
        if (!jobNo) {
          return res.status(400).send({ error: 'jobNo is required' });
        }
    
        const incoming = await prisma.incoming.findFirst({
          where: {
            jobNo,
            status: 'use',
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true
          }
        });
    
        if (!incoming?.id) {
          return res.send({ results: '' });
        }
    
        const transactionStore = await prisma.transactionStoreHistory.findFirst({
          where: {
            incomingId: incoming.id,
            status: 'use',
          },
          orderBy: {
            timeStmp: 'desc'
          },
          select: {
            stockNote: true
          }
        });
    
        return res.send({
          results: transactionStore?.stockNote || ''
        });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },



    stockInPbassPreview: async (req, res) => {
      try {
        const { startDate, toDate } = req.body;
    
        if (!startDate || !toDate) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }
    
        if (startDate > toDate) {
          return res.status(400).send({ message: 'invalid_date_range' });
        }
    
        const token = process.env.PBASS_TOKEN_INCOMING;
        const incomingUrl = process.env.PBASS_API_INCOMING_URL;
    
        if (!token || !incomingUrl) {
          return res.status(500).send({ message: 'missing_pbass_config' });
        }
    
        // const requestUrl = "https://wbp5.bp.minebea.local/api_prod/sv/a32/INCOMING_MAT/*/RECEIVED_YEAR||RECEIVED_MONTH||RECEIVED_DAY BETWEEN '20260401' AND '20260408'";
        const requestUrl = `${incomingUrl}/*/RECEIVED_YEAR||RECEIVED_MONTH||RECEIVED_DAY BETWEEN '${startDate}' AND '${toDate}'`;

        console.log('PBASS requestUrl =', requestUrl);
    
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: '*/*'
          }
        });
    
        const rawText = await response.text();
    
        if (!response.ok) {
          return res.status(response.status).send({
            message: 'pbass_preview_fetch_failed',
            error: rawText,
            requestUrl
          });
        }
    
        let rows = [];
        try {
          rows = JSON.parse(rawText);
        } catch (parseError) {
          return res.status(500).send({
            message: 'pbass_preview_parse_failed',
            error: parseError.message,
            raw: rawText.slice(0, 2000),
            requestUrl
          });
        }
    
        const results = Array.isArray(rows)
          ? rows.map((row, index) => {
              const yyyy = String(row.RECEIVED_YEAR || '').trim();
              const mm = String(row.RECEIVED_MONTH || '').trim().padStart(2, '0');
              const dd = String(row.RECEIVED_DAY || '').trim().padStart(2, '0');
    
              return {
                index: index + 1,
                jobNo: row.JOB_NO || '',
                recivedDate: yyyy && mm && dd ? `${dd}/${mm}/${yyyy}` : '',
                itemNo: row.ITEM_NO || '',
                itemName: row.ITEM_NAME || '',
                itemSpec: row.SPEC || '',
                lotNo: row.LOT_NO || '',
                coil: Number(row.COIL || 0),
                qtyKgsPcs: Number(row.QTY_KGSPCS || 0),
                supplier: row.VENDOR_CODE || '',
                unit: row.UNIT || '',
                invoiceNo: row.INVOICE_NO || '',
                taxInvoiceNo: row.TAX_INVOICE_NO || '',
                amount: Number(row.AMOUNT || 0),
                seq: row.SEQ || '',
                unloadBy: row.UNLOAD_BY || '',
                remark: row.REMARK || ''
              };
            })
          : [];
    
        return res.send({
          results,
          total: results.length,
          startDate,
          toDate,
          requestUrl
        });
      } catch (e) {
        console.error('stockInPbassPreview error:', e);
        return res.status(500).send({
          message: 'pbass_preview_fetch_failed',
          error: e.message,
          cause: e.cause?.message || null,
          code: e.cause?.code || null
        });
      }
    },



    stockInPbassSubmit: async (req, res) => {
      try {
        const { startDate, toDate, userId } = req.body;
    
        if (!startDate || !toDate || userId == null) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }
    
        if (startDate > toDate) {
          return res.status(400).send({ message: 'invalid_date_range' });
        }
    
        const token = process.env.PBASS_TOKEN_INCOMING;
        const incomingUrl = process.env.PBASS_API_INCOMING_URL;
    
        if (!token || !incomingUrl) {
          return res.status(500).send({ message: 'missing_pbass_config' });
        }
    
        const requestUrl = `${incomingUrl}/*/RECEIVED_YEAR||RECEIVED_MONTH||RECEIVED_DAY BETWEEN '${startDate}' AND '${toDate}'`;
    
        console.log('PBASS requestUrl =', requestUrl);
    
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: '*/*'
          }
        });
    
        const rawText = await response.text();
    
        if (!response.ok) {
          return res.status(response.status).send({
            message: 'pbass_submit_fetch_failed',
            error: rawText,
            requestUrl
          });
        }
    
        let pbassRows = [];
        try {
          pbassRows = JSON.parse(rawText);
        } catch (parseError) {
          return res.status(500).send({
            message: 'pbass_submit_parse_failed',
            error: parseError.message,
            raw: rawText.slice(0, 2000),
            requestUrl
          });
        }
    
        if (!Array.isArray(pbassRows)) {
          return res.status(400).send({
            message: 'pbass_invalid_response',
            totalFromPbass: 0,
            successCount: 0,
            skippedCount: 0,
            createdRows: [],
            skippedRows: [],
            results: []
          });
        }
    
        const userIdInt = Number(userId);
    
        if (!Number.isInteger(userIdInt) || userIdInt <= 0) {
          return res.status(400).send({ message: 'invalid_userId' });
        }
    
        const toText = (v) => {
          return v == null ? '' : String(v).trim();
        };
    
        const toInt = (v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return 0;
          return parseInt(n);
        };
    
        const toNumberText = (v) => {
          if (v == null || v === '') return '';
          return String(v);
        };
    
        const formatYearMonth = (row) => {
          const yyyy = toText(row.RECEIVED_YEAR);
          const mm = toText(row.RECEIVED_MONTH).padStart(2, '0');
          return yyyy && mm ? `${yyyy}-${mm}` : '';
        };
    
        const formatReceivedDate = (row) => {
          const yyyy = toText(row.RECEIVED_YEAR);
          const mm = toText(row.RECEIVED_MONTH).padStart(2, '0');
          const dd = toText(row.RECEIVED_DAY).padStart(2, '0');
    
          return yyyy && mm && dd ? `${dd}/${mm}/${yyyy}` : '';
        };
    
        const toPreviewRow = (row, index, reason = '') => {
          return {
            index: index + 1,
            jobNo: toText(row.JOB_NO),
            recivedDate: formatReceivedDate(row),
            itemNo: toText(row.ITEM_NO),
            itemName: toText(row.ITEM_NAME),
            itemSpec: toText(row.SPEC),
            lotNo: toText(row.LOT_NO),
            coil: Number(row.COIL || 0),
            qtyKgsPcs: Number(row.QTY_KGSPCS || 0),
            supplier: toText(row.VENDOR_CODE),
            unit: toText(row.UNIT),
            invoiceNo: toText(row.INVOICE_NO),
            taxInvoiceNo: toText(row.TAX_INVOICE_NO),
            amount: Number(row.AMOUNT || 0),
            seq: toText(row.SEQ),
            unloadBy: toText(row.UNLOAD_BY),
            remark: toText(row.REMARK),
            reason
          };
        };
    
        const skippedRows = [];
        const validRows = [];
    
        const seenJobNoInBatch = new Set();
        const materialCache = new Map();
    
        // =============================
        // 1) Validate / classify rows
        // =============================
        for (let i = 0; i < pbassRows.length; i++) {
          const row = pbassRows[i];
    
          const jobNo = toText(row.JOB_NO);
          const materialNo = toText(row.ITEM_NO);
    
          if (!jobNo) {
            skippedRows.push(toPreviewRow(row, i, 'missing_jobNo'));
            continue;
          }
    
          if (!materialNo) {
            skippedRows.push(toPreviewRow(row, i, 'missing_materialNo'));
            continue;
          }
    
          if (seenJobNoInBatch.has(jobNo)) {
            skippedRows.push(toPreviewRow(row, i, 'duplicate_jobNo_in_pbass_batch'));
            continue;
          }
    
          seenJobNoInBatch.add(jobNo);
    
          const checkIncoming = await prisma.incoming.findFirst({
            where: {
              jobNo: jobNo,
              status: 'use',
              StockOut: {
                none: {
                  status: 'use'
                }
              }
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              jobNo: true
            }
          });
    
          if (checkIncoming) {
            skippedRows.push(toPreviewRow(row, i, 'incoming_already'));
            continue;
          }
    
          let material = materialCache.get(materialNo);
    
          if (material === undefined) {
            material = await prisma.material.findFirst({
              where: {
                materialNo: materialNo,
                status: 'use'
              },
              select: {
                id: true,
                materialNo: true,
                materialName: true,
                materialSpec: true,
                accountCode: true
              }
            });
    
            materialCache.set(materialNo, material || null);
          }
    
          if (!material) {
            skippedRows.push(toPreviewRow(row, i, 'not_found_this_Material_in_Master'));
            continue;
          }
    
          validRows.push({
            index: i,
            row,
            material,
            targetStoreId: material.accountCode === '4520' ? 47 : 48
          });
        }
    
        const createdRows = [];
        const results = [];
    
        // =============================
        // 2) Create data
        //    ใช้ 1 transaction ต่อ 1 incoming
        // =============================
        for (const item of validRows) {
          const row = item.row;
          const material = item.material;
          const targetStoreId = Number(item.targetStoreId);
    
          const coilInt = toInt(row.COIL);
          const qtyInt = toInt(row.QTY_KGSPCS);
    
          try {
            const createdResult = await prisma.$transaction(async (tx) => {
              // กัน race condition อีกรอบ เผื่อมีคน sync พร้อมกัน
              const duplicatedIncoming = await tx.incoming.findFirst({
                where: {
                  jobNo: toText(row.JOB_NO),
                  status: 'use',
                  StockOut: {
                    none: {
                      status: 'use'
                    }
                  }
                },
                orderBy: {
                  id: 'desc'
                },
                select: {
                  id: true,
                  jobNo: true
                }
              });
    
              if (duplicatedIncoming) {
                throw new Error('incoming_already');
              }
    
              const incoming = await tx.incoming.create({
                data: {
                  jobNo: toText(row.JOB_NO),
                  yearMonth: formatYearMonth(row),
                  recivedDate: formatReceivedDate(row),
                  inspector: toText(row.INPUT_OPERATOR),
                  unloadBy: toText(row.UNLOAD_BY),
                  invoiceOne: toText(row.INVOICE_NO),
                  taxLnvNo: toText(row.TAX_INVOICE_NO),
                  materialNo: toText(row.ITEM_NO),
                  unitPrice: toNumberText(row.UNIT_PRICE),
                  qtyOfPalletPack: toNumberText(row.QTY_OF_PALLET),
                  coil: coilInt,
                  qtyKgsPcs: qtyInt,
                  unit: toText(row.UNIT),
                  kgsCoil: toNumberText(row.KGSCOIL),
                  odCoil: toText(row.OD_COIL_MM),
                  remark: toText(row.REMARK),
                  millSheet: toText(row.MILL_SHEET),
                  itemName: toText(row.ITEM_NAME),
                  itemSpec: toText(row.SPEC),
                  lotNo: toText(row.LOT_NO),
                  packing: toText(row.PACKING),
                  rosh: toText(row.ROHS),
                  result: toText(row.RESULT),
                  supplier: toText(row.VENDOR_CODE),
                  amount: toNumberText(row.AMOUNT)
                },
                select: {
                  id: true,
                  jobNo: true,
                  materialNo: true,
                  itemName: true,
                  itemSpec: true,
                  coil: true,
                  qtyKgsPcs: true,
                  unit: true
                }
              });
    
              const transactionStroe = await tx.transactionStore.create({
                data: {
                  storeId: targetStoreId,
                  incomingId: Number(incoming.id),
                  userId: userIdInt,
                  stockNote: ''
                },
                select: {
                  id: true,
                  storeId: true,
                  incomingId: true,
                  userId: true,
                  stockNote: true,
                  status: true
                }
              });
    
              const transactionStroeHistory = await tx.transactionStoreHistory.create({
                data: {
                  storeId: targetStoreId,
                  incomingId: Number(incoming.id),
                  userId: userIdInt,
                  stockNote: '',
                  type: 'StockIn',
                  coil: coilInt,
                  qty: qtyInt
                },
                select: {
                  id: true,
                  storeId: true,
                  incomingId: true,
                  userId: true,
                  type: true,
                  coil: true,
                  qty: true,
                  status: true
                }
              });
    
              return {
                incoming,
                transactionStroe,
                transactionStroeHistory
              };
            }, {
              maxWait: 10000,
              timeout: 20000
            });
    
            const preview = toPreviewRow(row, item.index, '');
    
            const createdItem = {
              ...preview,
              incomingId: createdResult.incoming.id,
              storeId: targetStoreId,
              accountCode: material.accountCode || '',
              reason: 'success'
            };
    
            createdRows.push(createdItem);
    
            results.push({
              ...createdResult,
              preview: createdItem
            });
    
          } catch (rowError) {
            console.error('PBASS create row failed:', {
              jobNo: toText(row.JOB_NO),
              itemNo: toText(row.ITEM_NO),
              error: rowError.message
            });
    
            const reason =
              rowError.message === 'incoming_already'
                ? 'incoming_already'
                : `create_failed: ${rowError.message}`;
    
            skippedRows.push(toPreviewRow(row, item.index, reason));
          }
        }
    
        // =============================
        // 3) Add sync timestamp
        // =============================
        let syncStockIn = null;
    
        if (createdRows.length > 0) {
          syncStockIn = await prisma.syncTimeStmp.create({
            data: {
              remark: 'SyncStockIn'
            },
            select: {
              id: true,
              status: true
            }
          });
        }
    
        // =============================
        // 4) Socket emit
        // =============================
        if (global.io && createdRows.length > 0) {
          global.io.emit('materialStore:changed', {
            type: 'materialStoreMove',
            source: 'PBASS_SYNC',
            successCount: createdRows.length
          });
        }
    
        return res.send({
          message: 'pbass_stockIn_submit_success',
          totalFromPbass: pbassRows.length,
          validCount: validRows.length,
          successCount: createdRows.length,
          skippedCount: skippedRows.length,
          createdRows,
          skippedRows,
          results,
          syncStockIn
        });
    
      } catch (e) {
        console.error('stockInPbassSubmit error:', e);
    
        return res.status(500).send({
          message: 'pbass_submit_failed',
          error: e.message
        });
      }
    },




    // =============
    // delete admin only
    // =============
    deleteStock :  async (req,res) => {
      try{
        const {incomingId} = req.body;
        

      }catch(e){
        return res.status(500).send({ error: e.message });

      }
    },


    importExcel : async (req,res) =>{

    }






}
