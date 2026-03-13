const {PrismaClient} = require('../generated/prisma');
const { add } = require('./SectionController');
const prisma = new PrismaClient();


module.exports = {

    add: async (req,res) =>{
        try{

            const {lineId, areaId} = req.body
             
            if (lineId == null ||
                areaId == null
            ) {
                return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkMapLineArea = await prisma.mapLineArea.findFirst({
                where: {
                  lineId: parseInt(lineId),
                  areaId: parseInt(areaId),
                  status: 'use',
                },

              });

              if (checkMapLineArea) {
                return res.status(400).send({ message: 'map_lineArea_already' });
              }  



              const mapLineArea = await prisma.mapLineArea.create({
                data: {
                    areaId: parseInt(areaId),
                    lineId: parseInt(lineId)
                },

                select: {
                id: true,
                name: true,
                status: true,
                },
            });

            return res.send({
                message: 'map_lineArea_success',
                data: mapLineArea,
            });

        }catch(e){
            return res.status(500).send({ error: e.message });
        }
    }

}