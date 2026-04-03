const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {
    add: async (req,res) =>{
        try{
            const { materialNo, materialName, materialSpec } = req.body;
         
            if (materialNo == null, materialName == null , materialSpec == null) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkMaterial = await prisma.material.findFirst({
                where: {
                  materialNo: materialNo ,
                  materialName: materialName,
                  materialSpec: materialSpec,
                  status: 'use',
                },
              });

              if (checkMaterial) {
                return res.status(400).send({ message: 'Material_already' });
              }

              const material = await prisma.material.create({
                data: {
                  materialNo: materialNo,
                  materialName: materialName,
                  materialSpec: materialSpec 
                },
                select: {
                  id: true,
                  materialNo: true,
                  materialName: true,
                  materialSpec: true,
                },
              });

            return res.send({
                message: 'add_material_success',
                data: material,
            });
        }catch(e){
            return res.status(500).send({ error: e.message });
        }

    },

    filterByMaterialNo : async (req,res) => {
      try{
         const { materialNo } = req.body ;

        if( materialNo == null){
          return res.status(400).send({ message: 'missing_required_fields' });
        }

        const getNameSpecMaterial = await prisma.material.findFirst({
          where: {
            materialNo: materialNo ,
            status: 'use',
          },
        });

        return res.send({ results: getNameSpecMaterial })

      }catch(e){
        return res.status(500).send({ error: e.message });
      }
    },



   
    list: async (req, res) => {
      try{
          const rows = await prisma.material.findMany({
              where: {
                status: 'use'
              }
          })
          return res.send({ results: rows })
  
      }catch(e){
          return res.status(500).send({ error: e.message });
      }
  
    },


    getMaterialByPbass: async (req, res) => {
      try {
        const apiUrl = process.env.PBASS_API_URL;
        const token = process.env.PBASS_TOKEN;
    
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
    
        const data = await response.json();
    
        if (!response.ok) {
          return res.status(response.status).send({
            error: data || 'External API error'
          });
        }
    
        const rows = Array.isArray(data?.Data) ? data.Data : [];
    
        const normalizedRows = rows
          .map(item => ({
            materialNo: item?.ITEM_NO?.toString().trim(),
            materialName: item?.ITEM_NAME?.toString().trim() || '',
            materialSpec: item?.SPEC?.toString().trim() || ''
          }))
          .filter(item => item.materialNo);
    
        const uniqueMap = new Map();
        const duplicateInPayload = [];
    
        for (const item of normalizedRows) {
          if (uniqueMap.has(item.materialNo)) {
            duplicateInPayload.push({
              materialNo: item.materialNo,
              materialName: item.materialName
            });
            continue;
          }
          uniqueMap.set(item.materialNo, item);
        }
    
        const uniqueRows = Array.from(uniqueMap.values());
        const materialNos = uniqueRows.map(item => item.materialNo);
    
        const existingMaterials = await prisma.material.findMany({
          where: {
            materialNo: { in: materialNos },
            status: 'use'
          },
          select: {
            materialNo: true
          }
        });
    
        const existingSet = new Set(existingMaterials.map(item => item.materialNo));
    
        const duplicateItems = [];
        const createItems = [];
    
        for (const item of uniqueRows) {
          if (existingSet.has(item.materialNo)) {
            duplicateItems.push({
              materialNo: item.materialNo,
              materialName: item.materialName
            });
          } else {
            createItems.push({
              materialNo: item.materialNo,
              materialName: item.materialName,
              materialSpec: item.materialSpec
            });
          }
        }
    
        function chunkArray(arr, size) {
          const chunks = [];
          for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
          }
          return chunks;
        }
    
        const chunkSize = 500;
        const createChunks = chunkArray(createItems, chunkSize);
    
        for (const chunk of createChunks) {
          await prisma.material.createMany({
            data: chunk
          });
        }
    
        return res.send({
          message: 'Import material success',
          totalFromApi: rows.length,
          validRows: normalizedRows.length,
          createdCount: createItems.length,
          duplicateCount: duplicateItems.length,
          duplicateInPayloadCount: duplicateInPayload.length,
          totalCreateChunks: createChunks.length,
          chunkSize,
          duplicateItems,
          duplicateInPayload
        });
      } catch (e) {
        console.error('getMaterialByPbass error:', e);
        return res.status(500).send({ error: e.message });
      }
    },

    
    importExcel : async (req,res) =>{
        

    }

}
