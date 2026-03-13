const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {
    
    add: async (req,res) =>{
        try{
            const { name } = req.body;

            if (!name) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkGroup = await prisma.group.findFirst({
                where: {
                  name: name,
                  status: 'use',
                },
              });

              if (checkGroup) {
                return res.status(400).send({ message: 'Group_name_already' });
              }  


              const group = await prisma.group.create({
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
                message: 'add_group_success',
                data: group,
            });

        }catch(e){
            return res.status(500).send({ error: e.message });
        }
    },





}



