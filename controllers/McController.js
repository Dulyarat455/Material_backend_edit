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
         
            if (jobNo == null || yearMonth == null || recivedDate == null ||
              inspector == null || unloadBy == null || invoiceOne == null ||
              taxLnvNo == null || materialNo == null || unitPrice == null ||
              qtyOfPalletPack == null  || coil == null || qtyKgsPcs == null ||
              unit == null || kgsCoil == null || odCoil == null || remark == null || 
              millSheet == null || itemName == null || itemSpec == null || lotNo == null ||
              packing == null  || rosh == null || result == null || supplier == null ||
              amount == null || storageArea == null || userId == null 

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
                      stockNote: stockNote
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
                message: 'add_storeName_success',
                data: data,
            });


        }catch(e){

          if (e.message === 'store_not_found') {
            return res.status(400).send({ message: 'store_not_found' });
          }
          return res.status(500).send({ error: e.message });

        }

    },

    fetchIncomingAll: async ( req,res ) =>{
      try{

        const rows = await prisma.transactionStore.findMany({
          where: {
            status: 'use'
          }
        

      })
      return res.send({ results: rows })


      }catch(e){
        return res.status(500).send({ error: e.message });
      }
    },

    
    importExcel : async (req,res) =>{
        

    }






}
