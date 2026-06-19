const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();

const ExcelJS = require('exceljs');

module.exports = {
    add: async (req,res) =>{
        try{
            const { materialNo, materialName, materialSpec, accountCode } = req.body;
         
            if  (!materialNo || !materialName || !materialSpec || !accountCode) {
              return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkMaterial = await prisma.material.findFirst({
                where: {
                  materialNo: materialNo ,
                  materialName: materialName,
                  materialSpec: materialSpec,
                  accountCode: accountCode,
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
                  materialSpec: materialSpec,
                  accountCode: accountCode, 
                },
                select: {
                  id: true,
                  materialNo: true,
                  materialName: true,
                  materialSpec: true,
                  accountCode: true,
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
      try {
        const chunkSize = 500;
        const results = [];
    
        // 1) ดึงเฉพาะ id ทั้งหมดก่อน
        const idRows = await prisma.material.findMany({
          where: {
            status: 'use'
          },
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true
          }
        });
    
        const allIds = idRows.map(row => row.id);
    
        // 2) ดึงข้อมูลจริงทีละ 500 records
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunkIds = allIds.slice(i, i + chunkSize);
    
          const chunkRows = await prisma.material.findMany({
            where: {
              id: {
                in: chunkIds
              },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              materialNo: true,
              materialName: true,
              materialSpec: true,
              accountCode: true,
              lineNo: true,
              timeStamp: true,
              status: true
            }
          });
    
          results.push(...chunkRows);
        }
    
        return res.send({
          results,
          total: results.length,
          chunkSize,
          totalChunks: Math.ceil(allIds.length / chunkSize)
        });
      } catch (e) {
        console.error('Material list error:', e);
    
        return res.status(500).send({
          message: 'load_material_list_failed',
          error: e.message
        });
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


    getMaterialByPbassFourYearsBack: async (req, res) => {
      try {
        const token = process.env.PBASS_TOKEN;
        const baseUrl = process.env.PBASS_API_PBASS_MATERIAL_MASTER;
    
        if (!token) {
          return res.status(500).send({
            message: 'missing_pbass_token'
          });
        }
    
        if (!baseUrl) {
          return res.status(500).send({
            message: 'missing_pbass_material_master_url'
          });
        }
    
        // ใช้ข้อมูลของปีก่อน
        const currentYear = new Date().getFullYear();
        const targetYear = currentYear - 1;
    
        // ป้องกันกรณี URL ลงท้ายด้วย /
        const normalizedBaseUrl = baseUrl.endsWith('/')
          ? baseUrl
          : `${baseUrl}/`;
    
        const requestUrl = `${normalizedBaseUrl}${targetYear}`;
    
        console.log(
          'PBASS Material Master requestUrl =',
          requestUrl
        );
    
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
            message: 'pbass_material_master_fetch_failed',
            error: rawText,
            requestUrl
          });
        }
    
        let data;
    
        try {
          data = JSON.parse(rawText);
        } catch (parseError) {
          return res.status(500).send({
            message: 'pbass_material_master_parse_failed',
            error: parseError.message,
            raw: rawText.slice(0, 2000),
            requestUrl
          });
        }
    
        const rows = Array.isArray(data?.Data)
          ? data.Data
          : [];
    
        // =========================
        // Helper functions
        // =========================
    
        const toText = (value) => {
          return value == null
            ? ''
            : String(value).trim();
        };
    
        const chunkArray = (arr, size) => {
          const chunks = [];
    
          for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
          }
    
          return chunks;
        };
    
        const toPbassUpdateTime = (item) => {
          const dateText = toText(
            item.latestUpdateDate ||
            item.LATEST_UPDATE_DATE
          );
    
          const timeText =
            toText(
              item.latestUpdateTime ||
              item.LATEST_UPDATE_TIME
            ) || '00:00:00';
    
          if (!dateText) {
            return 0;
          }
    
          const normalizedDate = dateText.replace(
            /\//g,
            '-'
          );
    
          const date = new Date(
            `${normalizedDate}T${timeText}`
          );
    
          const time = date.getTime();
    
          return Number.isNaN(time)
            ? 0
            : time;
        };
    
        // =========================
        // Allowed filters
        // =========================
    
        const allowedAccountCodes = new Set([
          '4520',
          '4605-A',
          '4605CZ',
          '4605-C'
        ]);
    
        const allowedLineNos = new Set([
          'LAM',
          'GEN'
        ]);
    
        // =========================
        // Normalize and filter rows
        // =========================
    
        const normalizedRows = [];
    
        let invalidMaterialNoCount = 0;
        let filteredOutAccountCount = 0;
        let filteredOutLineNoCount = 0;
    
        const accountSummary = new Map();
        const lineNoSummary = new Map();
    
        for (const item of rows) {
          const materialNo = toText(item.ITEM_NO);
          const accountCode = toText(item.ACCOUNT);
          const lineNo = toText(item.LINE_NO).toUpperCase();
    
          // Summary ของข้อมูลทั้งหมดจาก API
          accountSummary.set(
            accountCode || '-',
            (accountSummary.get(accountCode || '-') || 0) + 1
          );
    
          lineNoSummary.set(
            lineNo || '-',
            (lineNoSummary.get(lineNo || '-') || 0) + 1
          );
    
          if (!materialNo) {
            invalidMaterialNoCount++;
            continue;
          }
    
          // ACCOUNT ต้องอยู่ในรายการที่กำหนด
          if (!allowedAccountCodes.has(accountCode)) {
            filteredOutAccountCount++;
            continue;
          }
    
          // LINE_NO ต้องเป็น LAM หรือ GEN
          if (!allowedLineNos.has(lineNo)) {
            filteredOutLineNoCount++;
            continue;
          }
    
          normalizedRows.push({
            materialNo,
            materialName: toText(item.ITEM_NAME),
            materialSpec: toText(item.SPEC),
            accountCode,
            lineNo,
            latestUpdateDate: toText(
              item.LATEST_UPDATE_DATE
            ),
            latestUpdateTime: toText(
              item.LATEST_UPDATE_TIME
            )
          });
        }
    
        // =========================
        // Remove duplicate ITEM_NO
        // เลือกรายการที่ update ล่าสุดจาก PBASS
        // =========================
    
        const uniqueMap = new Map();
    
        let duplicateInPayloadCount = 0;
        let replacedByLatestCount = 0;
    
        const duplicateInPayloadSample = [];
    
        for (const item of normalizedRows) {
          const mapKey = item.materialNo;
    
          if (!uniqueMap.has(mapKey)) {
            uniqueMap.set(mapKey, item);
            continue;
          }
    
          duplicateInPayloadCount++;
    
          if (duplicateInPayloadSample.length < 30) {
            duplicateInPayloadSample.push({
              materialNo: item.materialNo,
              materialName: item.materialName,
              materialSpec: item.materialSpec,
              accountCode: item.accountCode,
              lineNo: item.lineNo,
              latestUpdateDate: item.latestUpdateDate,
              latestUpdateTime: item.latestUpdateTime
            });
          }
    
          const existingItem = uniqueMap.get(mapKey);
    
          const currentItemTime =
            toPbassUpdateTime(item);
    
          const existingItemTime =
            toPbassUpdateTime(existingItem);
    
          if (currentItemTime > existingItemTime) {
            uniqueMap.set(mapKey, item);
            replacedByLatestCount++;
          }
        }
    
        const uniqueRows = Array.from(
          uniqueMap.values()
        );
    
        const materialNos = uniqueRows.map(
          item => item.materialNo
        );
    
        // =========================
        // Find existing materials
        // =========================
    
        const materialNoChunks = chunkArray(
          materialNos,
          500
        );
    
        const existingMap = new Map();
    
        for (const chunk of materialNoChunks) {
          if (!chunk.length) {
            continue;
          }
    
          const existingMaterials =
            await prisma.material.findMany({
              where: {
                materialNo: {
                  in: chunk
                },
                status: 'use'
              },
              select: {
                id: true,
                materialNo: true,
                materialName: true,
                materialSpec: true,
                accountCode: true,
                lineNo: true
              }
            });
    
          for (const item of existingMaterials) {
            existingMap.set(
              toText(item.materialNo),
              item
            );
          }
        }
    
        // =========================
        // Separate Create / Update / Duplicate
        // =========================
    
        const createItems = [];
        const updateItems = [];
    
        let duplicateCount = 0;
    
        const createSample = [];
        const updateSample = [];
        const duplicateSample = [];
    
        for (const item of uniqueRows) {
          const existing = existingMap.get(
            item.materialNo
          );
    
          // ยังไม่มีใน Material Master
          if (!existing) {
            const createItem = {
              materialNo: item.materialNo,
              materialName: item.materialName,
              materialSpec: item.materialSpec,
              accountCode: item.accountCode,
              lineNo: item.lineNo
            };
    
            createItems.push(createItem);
    
            if (createSample.length < 30) {
              createSample.push(createItem);
            }
    
            continue;
          }
    
          const sameName =
            toText(existing.materialName) ===
            item.materialName;
    
          const sameSpec =
            toText(existing.materialSpec) ===
            item.materialSpec;
    
          const sameAccountCode =
            toText(existing.accountCode) ===
            item.accountCode;
    
          const sameLineNo =
            toText(existing.lineNo).toUpperCase() ===
            item.lineNo;
    
          // ซ้ำครบทุก field ให้ข้าม
          if (
            sameName &&
            sameSpec &&
            sameAccountCode &&
            sameLineNo
          ) {
            duplicateCount++;
    
            if (duplicateSample.length < 30) {
              duplicateSample.push({
                materialNo: item.materialNo,
                materialName: item.materialName,
                materialSpec: item.materialSpec,
                accountCode: item.accountCode,
                lineNo: item.lineNo
              });
            }
    
            continue;
          }
    
          // มี Material No เดิม แต่ข้อมูลเปลี่ยน
          const updateItem = {
            id: existing.id,
            materialNo: item.materialNo,
    
            oldMaterialName:
              toText(existing.materialName),
    
            oldMaterialSpec:
              toText(existing.materialSpec),
    
            oldAccountCode:
              toText(existing.accountCode),
    
            oldLineNo:
              toText(existing.lineNo),
    
            newMaterialName:
              item.materialName,
    
            newMaterialSpec:
              item.materialSpec,
    
            newAccountCode:
              item.accountCode,
    
            newLineNo:
              item.lineNo
          };
    
          updateItems.push(updateItem);
    
          if (updateSample.length < 30) {
            updateSample.push(updateItem);
          }
        }
    
        // =========================
        // Create materials
        // =========================
    
        const createChunks = chunkArray(
          createItems,
          500
        );
    
        let createdCount = 0;
    
        for (const chunk of createChunks) {
          if (!chunk.length) {
            continue;
          }
    
          const created =
            await prisma.material.createMany({
              data: chunk
            });
    
          createdCount +=
            created.count || chunk.length;
        }
    
        // =========================
        // Update materials
        // =========================
    
        const updateChunks = chunkArray(
          updateItems,
          100
        );
    
        let updatedCount = 0;
    
        for (const chunk of updateChunks) {
          if (!chunk.length) {
            continue;
          }
    
          await Promise.all(
            chunk.map(item =>
              prisma.material.update({
                where: {
                  id: item.id
                },
                data: {
                  materialName:
                    item.newMaterialName,
    
                  materialSpec:
                    item.newMaterialSpec,
    
                  accountCode:
                    item.newAccountCode,
    
                  lineNo:
                    item.newLineNo
                }
              })
            )
          );
    
          updatedCount += chunk.length;
        }
    
        // =========================
        // Response
        // =========================
    
        return res.send({
          message:
            'Import material master from PBASS success',
    
          requestUrl,
          currentYear,
          targetYear,
    
          totalFromApi: rows.length,
    
          validRows: normalizedRows.length,
          invalidMaterialNoCount,
    
          allowedAccountCodes:
            Array.from(allowedAccountCodes),
    
          allowedLineNos:
            Array.from(allowedLineNos),
    
          filteredOutAccountCount,
          filteredOutLineNoCount,
    
          accountSummary:
            Array.from(
              accountSummary.entries()
            ).map(([accountCode, count]) => ({
              accountCode,
              count
            })),
    
          lineNoSummary:
            Array.from(
              lineNoSummary.entries()
            ).map(([lineNo, count]) => ({
              lineNo,
              count
            })),
    
          uniqueRows: uniqueRows.length,
    
          createdCount,
          updatedCount,
          duplicateCount,
    
          duplicateInPayloadCount,
          replacedByLatestCount,
    
          totalMaterialNoChunks:
            materialNoChunks.length,
    
          totalCreateChunks:
            createChunks.length,
    
          totalUpdateChunks:
            updateChunks.length,
    
          chunkSize: {
            findMany: 500,
            createMany: 500,
            updateBatch: 100
          },
    
          createSample,
          updateSample,
          duplicateSample,
          duplicateInPayloadSample
        });
      } catch (e) {
        console.error(
          'getMaterialByPbassFourYearsBack error:',
          e
        );
    
        return res.status(500).send({
          message:
            'get_material_by_pbass_four_years_back_failed',
    
          error: e.message
        });
      }
    },


    delete: async (req,res) =>{
      try{
          const {materialId} = req.body ;

          if  (materialId == null) {
            return res.status(400).send({ message: 'missing_required_fields' });
          }

          
          const checkMaterial = await prisma.material.findFirst({
            where: {
              id: parseInt(materialId)  ,
              status: 'use',
            },
          });

          if (!checkMaterial) {
            return res.status(400).send({ message: 'Material_not_found' });
          }


          await prisma.material.update({
            where: { id: parseInt(materialId), status: 'use' },
            data: { status: 'delete' }
          });

          return res.send({
            message: 'delete_materialMaster_success'
          });

      } catch(e){
        return res.status(500).send({ error: e.message });
      }     

    },

    
    exportExcel: async (req, res) => {
      try {
        const chunkSize = 500;
    
        const {
          searchText,
          fromDate,
          toDate
        } = req.body || {};
    
        const keyword = String(searchText || '').trim();
    
        // =============================
        // Filter
        // =============================
        const where = {
          status: 'use',
    
          ...(fromDate || toDate
            ? {
                timeStamp: {
                  ...(fromDate
                    ? {
                        gte: new Date(`${fromDate}T00:00:00`)
                      }
                    : {}),
    
                  ...(toDate
                    ? {
                        lte: new Date(`${toDate}T23:59:59.999`)
                      }
                    : {})
                }
              }
            : {}),
    
          ...(keyword
            ? {
                OR: [
                  {
                    materialNo: {
                      contains: keyword
                    }
                  },
                  {
                    materialName: {
                      contains: keyword
                    }
                  },
                  {
                    materialSpec: {
                      contains: keyword
                    }
                  },
                  {
                    accountCode: {
                      contains: keyword
                    }
                  },
                  {
                    lineNo: {
                      contains: keyword
                    }
                  }
                ]
              }
            : {})
        };
    
        // =============================
        // Sort helpers
        // =============================
        const getAccountPriority = (accountCode) => {
          return String(accountCode || '').trim() === '4520'
            ? 0
            : 1;
        };
    
        const getLinePriority = (lineNo) => {
          const line = String(lineNo || '')
            .trim()
            .toUpperCase();
    
          if (line === 'LAM') return 0;
          if (line === 'GEN') return 1;
    
          return 2;
        };
    
        const sortMaterialRows = (rows) => {
          return [...rows].sort((a, b) => {
            // 1) Account Code 4520 มาก่อน
            const accountPriorityA =
              getAccountPriority(a.accountCode);
    
            const accountPriorityB =
              getAccountPriority(b.accountCode);
    
            if (accountPriorityA !== accountPriorityB) {
              return accountPriorityA - accountPriorityB;
            }
    
            // 2) Line No: LAM -> GEN -> ค่าอื่น
            const linePriorityA =
              getLinePriority(a.lineNo);
    
            const linePriorityB =
              getLinePriority(b.lineNo);
    
            if (linePriorityA !== linePriorityB) {
              return linePriorityA - linePriorityB;
            }
    
            // 3) Account Code A-Z
            const accountCompare =
              String(a.accountCode || '').localeCompare(
                String(b.accountCode || ''),
                undefined,
                {
                  numeric: true,
                  sensitivity: 'base'
                }
              );
    
            if (accountCompare !== 0) {
              return accountCompare;
            }
    
            // 4) Material No A-Z
            const materialNoCompare =
              String(a.materialNo || '').localeCompare(
                String(b.materialNo || ''),
                undefined,
                {
                  numeric: true,
                  sensitivity: 'base'
                }
              );
    
            if (materialNoCompare !== 0) {
              return materialNoCompare;
            }
    
            // 5) Material Name A-Z
            const materialNameCompare =
              String(a.materialName || '').localeCompare(
                String(b.materialName || ''),
                undefined,
                {
                  numeric: true,
                  sensitivity: 'base'
                }
              );
    
            if (materialNameCompare !== 0) {
              return materialNameCompare;
            }
    
            // 6) Spec A-Z
            return String(a.materialSpec || '').localeCompare(
              String(b.materialSpec || ''),
              undefined,
              {
                numeric: true,
                sensitivity: 'base'
              }
            );
          });
        };
    
        // =============================
        // 1) ดึง ID ตาม filter ก่อน
        // =============================
        const idRows = await prisma.material.findMany({
          where,
          orderBy: {
            id: 'desc'
          },
          select: {
            id: true
          }
        });
    
        const allIds = idRows.map(row => row.id);
    
        // =============================
        // 2) ดึงข้อมูลทีละ 500
        // =============================
        const exportRows = [];
    
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunkIds = allIds.slice(
            i,
            i + chunkSize
          );
    
          const chunkRows =
            await prisma.material.findMany({
              where: {
                id: {
                  in: chunkIds
                },
                ...where
              },
              select: {
                id: true,
                materialNo: true,
                materialName: true,
                materialSpec: true,
                accountCode: true,
                lineNo: true,
                timeStamp: true,
                status: true
              }
            });
    
          exportRows.push(...chunkRows);
        }
    
        // =============================
        // 3) Sort ให้ตรงกับหน้าบ้าน
        // =============================
        const sortedRows =
          sortMaterialRows(exportRows);
    
        // =============================
        // 4) เตรียม Excel
        // =============================
        const workbook = new ExcelJS.Workbook();
    
        workbook.creator =
          'Material Control System';
    
        workbook.created = new Date();
    
        const worksheet = workbook.addWorksheet(
          'Material Master',
          {
            views: [
              {
                state: 'frozen',
                ySplit: 1
              }
            ]
          }
        );
    
        worksheet.columns = [
          {
            header: 'Index',
            key: 'index',
            width: 10
          },
          {
            header: 'Material No',
            key: 'materialNo',
            width: 26
          },
          {
            header: 'Material Name',
            key: 'materialName',
            width: 34
          },
          {
            header: 'Spec',
            key: 'materialSpec',
            width: 26
          },
          {
            header: 'Account Code',
            key: 'accountCode',
            width: 18
          },
          {
            header: 'Line No',
            key: 'lineNo',
            width: 14
          },
          {
            header: 'Type',
            key: 'type',
            width: 16
          },
          {
            header: 'Created At',
            key: 'createdAt',
            width: 24
          }
        ];
    
        // =============================
        // Header style
        // =============================
        const headerRow = worksheet.getRow(1);
    
        headerRow.height = 24;
    
        headerRow.eachCell((cell) => {
          cell.font = {
            bold: true,
            color: {
              argb: 'FFFFFFFF'
            },
            size: 11
          };
    
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true
          };
    
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: 'FF5B8FC9'
            }
          };
    
          cell.border = {
            top: {
              style: 'thin',
              color: {
                argb: 'FF4A7DB7'
              }
            },
            left: {
              style: 'thin',
              color: {
                argb: 'FFE5EEF7'
              }
            },
            bottom: {
              style: 'thin',
              color: {
                argb: 'FF4A7DB7'
              }
            },
            right: {
              style: 'thin',
              color: {
                argb: 'FFE5EEF7'
              }
            }
          };
        });
    
        // =============================
        // 5) Add rows
        // =============================
        let excelRowIndex = 2;
        let runningIndex = 1;
    
        for (const row of sortedRows) {
          const accountCode =
            String(row.accountCode || '').trim();
    
          const lineNo =
            String(row.lineNo || '')
              .trim()
              .toUpperCase();
    
          const type =
            accountCode === '4520'
              ? 'Material'
              : 'Chemical';
    
          const excelRow = worksheet.addRow({
            index: runningIndex,
            materialNo: row.materialNo || '',
            materialName: row.materialName || '',
            materialSpec: row.materialSpec || '',
            accountCode,
            lineNo,
            type,
    
            createdAt: row.timeStamp
              ? new Date(
                  row.timeStamp
                ).toLocaleString('th-TH', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : ''
          });
    
          const isBlueRow =
            excelRowIndex % 2 === 0;
    
          const bgColor = isBlueRow
            ? 'FFDBE7F3'
            : 'FFFFFFFF';
    
          excelRow.height = 24;
    
          excelRow.eachCell(
            (cell, colNumber) => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {
                  argb: bgColor
                }
              };
    
              cell.border = {
                top: {
                  style: 'thin',
                  color: {
                    argb: 'FFB8C9DC'
                  }
                },
                left: {
                  style: 'thin',
                  color: {
                    argb: 'FFB8C9DC'
                  }
                },
                bottom: {
                  style: 'thin',
                  color: {
                    argb: 'FFB8C9DC'
                  }
                },
                right: {
                  style: 'thin',
                  color: {
                    argb: 'FFB8C9DC'
                  }
                }
              };
    
              cell.alignment = {
                vertical: 'middle',
    
                horizontal:
                  colNumber === 1 ||
                  colNumber === 6 ||
                  colNumber === 7
                    ? 'center'
                    : 'left',
    
                wrapText: true
              };
    
              cell.font = {
                size: 12,
    
                bold:
                  colNumber === 2 ||
                  colNumber === 5 ||
                  colNumber === 6 ||
                  colNumber === 7,
    
                color: {
                  argb:
                    colNumber === 2 ||
                    colNumber === 5 ||
                    colNumber === 6 ||
                    colNumber === 7
                      ? 'FF0F172A'
                      : 'FF334155'
                }
              };
    
              // =============================
              // Line No column color
              // Column 6
              // =============================
              if (colNumber === 6) {
                if (lineNo === 'LAM') {
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: {
                      argb: 'FFECFEFF'
                    }
                  };
    
                  cell.font = {
                    size: 12,
                    bold: true,
                    color: {
                      argb: 'FF0E7490'
                    }
                  };
                } else if (lineNo === 'GEN') {
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: {
                      argb: 'FFF0FDF4'
                    }
                  };
    
                  cell.font = {
                    size: 12,
                    bold: true,
                    color: {
                      argb: 'FF15803D'
                    }
                  };
                }
              }
    
              // =============================
              // Type column color
              // Column 7
              // =============================
              if (colNumber === 7) {
                if (type === 'Material') {
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: {
                      argb: 'FFFFF7ED'
                    }
                  };
    
                  cell.font = {
                    size: 12,
                    bold: true,
                    color: {
                      argb: 'FFB45309'
                    }
                  };
                } else {
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: {
                      argb: 'FFEFF6FF'
                    }
                  };
    
                  cell.font = {
                    size: 12,
                    bold: true,
                    color: {
                      argb: 'FF1D4ED8'
                    }
                  };
                }
              }
            }
          );
    
          excelRowIndex++;
          runningIndex++;
        }
    
        // =============================
        // Auto filter
        // A ถึง H = 8 columns
        // =============================
        worksheet.autoFilter = {
          from: 'A1',
          to: 'H1'
        };
    
        // =============================
        // Response
        // =============================
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
    
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=material_master_${Date.now()}.xlsx`
        );
    
        await workbook.xlsx.write(res);
    
        return res.end();
      } catch (e) {
        console.error(
          'Material exportExcel error:',
          e
        );
    
        return res.status(500).send({
          message: 'export_material_excel_failed',
          error: e.message
        });
      }
    },

}
