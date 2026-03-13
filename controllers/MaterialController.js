const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {
    add: async (req,res) =>{
        try{
            const { name } = req.body;
         
            if (!name) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkStore = await prisma.store.findFirst({
                where: {
                  name: name,
                  status: 'use',
                },
              });

              if (checkStore) {
                return res.status(400).send({ message: 'store_name_already' });
              }

              const store = await prisma.store.create({
                data: {
                  name: name
                },
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              });

            return res.send({
                message: 'add_storeName_success',
                data: store,
            });
        }catch(e){
            return res.status(500).send({ error: e.message });
        }

    },


    importExcel : async (req,res) =>{
        

    }

}
