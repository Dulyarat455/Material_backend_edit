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
        const token = process.env.PBASS_TOKEN;
    
        const apiConfigs = [
          {
            url: process.env.PBASS_API_URL,
            accountCode: '4520'
          },
          {
            url: process.env.PBASS_API_URL_4605A,
            accountCode: '4605-A'
          },
          {
            url: process.env.PBASS_API_URL_4605CZ,
            accountCode: '4605CZ'
          },
          {
            url: process.env.PBASS_API_URL_4605C,
            accountCode: '4605-C'
          }
        ].filter(x => x.url);
    
        if (!apiConfigs.length) {
          return res.status(400).send({
            error: 'PBASS API URL is not configured'
          });
        }
    
        const allRows = [];
        const apiSummaries = [];
    
        for (const cfg of apiConfigs) {
          const response = await fetch(cfg.url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
    
          const data = await response.json();
    
          if (!response.ok) {
            return res.status(response.status).send({
              error: data || `External API error (${cfg.accountCode})`
            });
          }
    
          const rows = Array.isArray(data?.Data) ? data.Data : [];
    
          apiSummaries.push({
            accountCode: cfg.accountCode,
            totalFromApi: rows.length
          });
    
          for (const item of rows) {
            allRows.push({
              materialNo: item?.ITEM_NO?.toString().trim(),
              materialName: item?.ITEM_NAME?.toString().trim() || '',
              materialSpec: item?.SPEC?.toString().trim() || '',
              accountCode: cfg.accountCode
            });
          }
        }
    
        const normalizedRows = allRows.filter(item => item.materialNo);
    
        const uniqueMap = new Map();
        const duplicateInPayload = [];
    
        for (const item of normalizedRows) {
          const mapKey = `${item.materialNo}__${item.accountCode || ''}`;
    
          if (uniqueMap.has(mapKey)) {
            duplicateInPayload.push({
              materialNo: item.materialNo,
              materialName: item.materialName,
              materialSpec: item.materialSpec,
              accountCode: item.accountCode
            });
            continue;
          }
    
          uniqueMap.set(mapKey, item);
        }
    
        const uniqueRows = Array.from(uniqueMap.values());
        const materialNos = [...new Set(uniqueRows.map(item => item.materialNo))];
    
        const existingMaterials = await prisma.material.findMany({
          where: {
            materialNo: { in: materialNos },
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
    
        const existingMap = new Map(
          existingMaterials.map(item => [item.materialNo, item])
        );
    
        const duplicateItems = [];
        const createItems = [];
        const updateItems = [];
    
        for (const item of uniqueRows) {
          const existing = existingMap.get(item.materialNo);
    
          if (!existing) {
            createItems.push({
              materialNo: item.materialNo,
              materialName: item.materialName,
              materialSpec: item.materialSpec,
              accountCode: item.accountCode
            });
            continue;
          }
    
          const sameName = (existing.materialName || '') === (item.materialName || '');
          const sameSpec = (existing.materialSpec || '') === (item.materialSpec || '');
          const sameAccountCode = (existing.accountCode || '') === (item.accountCode || '');
    
          if (sameName && sameSpec && sameAccountCode) {
            duplicateItems.push({
              materialNo: item.materialNo,
              materialName: item.materialName,
              materialSpec: item.materialSpec,
              accountCode: item.accountCode
            });
            continue;
          }
    
          updateItems.push({
            id: existing.id,
            materialNo: item.materialNo,
            oldMaterialName: existing.materialName,
            oldMaterialSpec: existing.materialSpec,
            oldAccountCode: existing.accountCode || '',
            newMaterialName: item.materialName,
            newMaterialSpec: item.materialSpec,
            newAccountCode: item.accountCode || ''
          });
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
    
        for (const item of updateItems) {
          await prisma.material.update({
            where: {
              id: item.id
            },
            data: {
              materialName: item.newMaterialName,
              materialSpec: item.newMaterialSpec,
              accountCode: item.newAccountCode
            }
          });
        }
    
        return res.send({
          message: 'Import material success',
          totalFromApi: normalizedRows.length,
          validRows: normalizedRows.length,
          createdCount: createItems.length,
          updatedCount: updateItems.length,
          duplicateCount: duplicateItems.length,
          duplicateInPayloadCount: duplicateInPayload.length,
          totalCreateChunks: createChunks.length,
          chunkSize,
          apiSummaries,
          duplicateItems,
          duplicateInPayload,
          updateItems
        });
      } catch (e) {
        console.error('getMaterialByPbass error:', e);
        return res.status(500).send({ error: e.message });
      }
    },

    
    importExcel : async (req,res) =>{
        

    }

}
