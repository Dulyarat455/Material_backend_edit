const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {

    add: async (req,res) =>{
        try{
            const { name } = req.body;
         
            if (!name) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkSection = await prisma.section.findFirst({
                where: {
                  name: name,
                  status: 'use',
                },
              });

              if (checkSection) {
                return res.status(400).send({ message: 'section_name_already' });
              }

              const section = await prisma.section.create({
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
                message: 'add_section_success',
                data: section,
            });
        }catch(e){
            return res.status(500).send({ error: e.message });
        }

    },


    list: async (req, res) => {
      try{
          const rows = await prisma.section.findMany({
              where: {
                status: 'use'
              }
          })
          return res.send({ results: rows })
  
      }catch(e){
          return res.status(500).send({ error: e.message });
      }
  
    },



}