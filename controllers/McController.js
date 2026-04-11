const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


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
                },
              });

              if (checkIncoming) {
                return res.status(400).send({ message: 'incoming_already' });
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
                      type: "StockIn"
                    }
                });
    
                return {
                  store,
                  incoming,
                  transactionStroe,
                  transactionStroeHistory
                };
            });
    
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
              type: "MoveArea"
            },
          });
    
          return {
            transactionStoreDelete,
            transactionStroe,
            transactionStroeHistory,
          };
        });
    
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
  
              const getIncoming =  await tx.incoming.findFirst({
                where:{
                    jobNo: jobNoIncoming,
                    status: 'use'
                  }
              })       
  
              if(!getIncoming){
                throw new Error('incoming_notFound');
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
                    type: "ReturnStockIn"
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

            return res.send({
              message: 'success',
              results,
            });

          }

      }catch(e){
        if (
          e.message === 'this_job_notFound' ||
          e.message === 'canNot_returnStockIn_have_material_inStock' ||
          e.message ===  'incoming_notFound'
        ) {
          return res.status(400).send({ message: e.message });
        }
        return res.status(500).send({ error: e.message });
      }
    },
    
    

    outStock : async(req,res)=>{
      try{
        const {incomingId, type, inchargeByUserId, remark } = req.body;
        
        if(incomingId == null || !type || inchargeByUserId == null  ){
            return res.status(400).send({ message: 'missing_required_fields' });
          }




          const stockOut = await prisma.stockOut.create({
            data: {
              incomingId: parseInt(incomingId),
              type:"QC",
              inchargeByUserId: parseInt(inchargeByUserId),
              remark: remark || ""
            },
            select: {
              id: true,
              incomingId: true,
              type: true,
              inchargeByUserId: true,
              remark: true
            },
          });

        return res.send({
            message: 'out_stock_success',
            data: stockOut,
        });





      }catch(e){
        return res.status(500).send({ error: e.message });
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
