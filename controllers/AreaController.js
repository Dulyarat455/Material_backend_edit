const {PrismaClient} = require('../generated/prisma');
const { list } = require('./StoreMaster');
const prisma = new PrismaClient();


module.exports = {
 
        add: async (req,res) =>{
            try{
                const { name } = req.body;

                if (!name) {
                return res.status(400).send({ message: 'missing_required_fields' });
                }

                const checkArea = await prisma.area.findFirst({
                    where: {
                    name: name,
                    status: 'use',
                    },
                });

                if (checkArea) {
                    return res.status(400).send({ message: 'Area_name_already' });
                }  


                const area = await prisma.area.create({
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
                    message: 'add_area_success',
                    data: area,
                });

            }catch(e){
                return res.status(500).send({ error: e.message });
            }
        },

        mapLineArea: async (req,res) =>{
            try{
                const {lineId, areaId} = req.body;

                if(lineId== null || areaId == null){
                    return res.status(400).send({ message: 'missing_required_fields' });
                }

                const  checkMapLineArea = await prisma.mapLineArea.findFirst({
                    where:{
                        areaId: parseInt(areaId),
                        lineId: parseInt(lineId),
                        status: 'use',
                    }
                })


                if (checkMapLineArea) {
                    return res.status(400).send({ message: 'Map_LineArea_already' });
                }  

                const mapLineArea = await prisma.mapLineArea.create({
                    data: {
                    areaId: parseInt(areaId),
                    lineId: parseInt(lineId) 
                    },                  
                });


                return res.send({
                    message: 'map_LineArea_success',
                    data: mapLineArea,
                });

            }catch(e){
                return res.status(500).send({ error: e.message });
            }
        },

        filterbyLineArea: async (req, res) => {
            try {
              const { lineName } = req.body;
          
              if (lineName == null) {
                return res.status(400).send({ message: 'missing_required_fields' });
              }

              const getLineId = await prisma.line.findFirst({
                    where: {
                        name: lineName,
                        status: 'use',
                    },
                });


             if (!getLineId) {
                return res.status(400).send({ message: 'line_name_not_Found' });
            }  

          
              const rows = await prisma.mapLineArea.findMany({
                where: {
                  status: 'use',
                  lineId: parseInt(getLineId.id),
                  Area: {
                    status: 'use'
                  }
                },
                select: {
                  id: true,
                  areaId: true,
                  lineId: true,
                  Area: {
                    select: {
                      id: true,
                      name: true,
                      status: true
                    }
                  }
                },
                orderBy: {
                  areaId: 'asc'
                }
              });
          
              return res.send({
                results: rows.map((r) => ({
                  id: r.id,
                  lineId: r.lineId,
                  areaId: r.areaId,
                  areaName: r.Area?.name || '',
                  areaStatus: r.Area?.status || ''
                }))
              });
            } catch (e) {
              return res.status(500).send({ error: e.message });
            }
          },
    


}
