const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {

    createIssue: async (req, res) => {
        try {
          const {
            groupId,
            areaId,
            requestByUserId,
            materialId,
            remark,
            priority
          } = req.body;
      
          if (
            groupId == null ||
            areaId == null ||
            requestByUserId == null ||
            materialId == null ||
            priority == null
          ) {
            return res.status(400).send({ message: 'missing_required_fields' });
          }
      
          const genJobNo = async () => {
            const d = new Date();
            const pad2 = (n) => String(n).padStart(2, '0');
      
            const yy = String(d.getFullYear()).slice(-2);
            const mm = pad2(d.getMonth() + 1);
            const dd = pad2(d.getDate());
      
            const prefix = `${yy}${mm}${dd}`;
      
            const last = await prisma.job.findFirst({
              where: {
                jobNo: { startsWith: prefix },
                status: 'use',
              },
              orderBy: { jobNo: 'desc' },
              select: { jobNo: true },
            });
      
            let nextSeq = 1;
      
            if (last?.jobNo) {
              const lastSeqStr = last.jobNo.slice(-3);
              const lastSeq = parseInt(lastSeqStr, 10);
              if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
            }
      
            const seqStr = String(nextSeq).padStart(3, '0');
            return `${prefix}${seqStr}`;
          };



          const getMaterial = await prisma.material.findFirst({
            where: {
              id: materialId,
              status: 'use',
            },
          });

          if (!getMaterial) {
            return res.status(400).send({ message: 'material_not_found' });
          }
      
      
          const requestIssueJob = await prisma.job.create({
            data: {
              jobNo: await genJobNo(),
              areaId: parseInt(areaId),
              groupId: parseInt(groupId),
              requestByUserId: parseInt(requestByUserId),
              type: 'issue',
              materialId: parseInt(materialId),
              state: 'wait',
              remark: remark ?? null,
              accountCode: getMaterial.accountCode,
              priority: priority,
            },
            select: {
              id: true,
              jobNo: true,
              state: true,
              priority: true,
              status: true,
            },
          });
      
          return res.send({
            message: 'create_IssueJob_success',
            data: requestIssueJob,
          });
        } catch (e) {
          return res.status(500).send({ error: e.message });
        }
      },



      fetchIssueByUserId: async (req, res) => {
        try {
          const { userId } = req.body;
      
          if (userId == null) {
            return res.status(400).send({ message: 'missing_required_fields' });
          }
      
          const checkUser = await prisma.user.findFirst({
            where: {
              id: parseInt(userId),
              status: 'use',
            },
            select: {
              id: true,
              empNo: true,
              name: true,
            }
          });
      
          if (!checkUser) {
            return res.status(400).send({ message: 'user_not_found' });
          }
      
          const rows = await prisma.job.findMany({
            where: {
              status: 'use',
              requestByUserId: parseInt(userId),
              type: "issue"
            },
            orderBy: {
              requestTime: 'asc'
            },
            include: {
              Area: {
                select: {
                  id: true,
                  name: true,
                }
              },
              RequestUser: {
                select: {
                  id: true,
                  empNo: true,
                  name: true,
                }
              },
              Material: {
                select: {
                  id: true,
                  materialNo: true,
                  materialName: true,
                  materialSpec: true,
                }
              }
            }
          });
      
          const results = rows.map((r) => ({
            id: r.id,
            jobNo: r.jobNo,
            incomingId: r.IncomingId ?? null,
            areaId: r.areaId,
            areaName: r.Area?.name || '',
            requestByUserId: r.requestByUserId,
            requestUserEmpNo: r.RequestUser?.empNo || '',
            requestUserName: r.RequestUser?.name || '',
            requestTime: r.requestTime,
            inchargeByUserId: r.inchargeByUserId ?? null,
            inchargeTime: r.inchargeTime ?? null,
            type: r.type,
            materialId: r.materialId,
            materialNo: r.Material?.materialNo || '',
            materialName: r.Material?.materialName || '',
            materialSpec: r.Material?.materialSpec || '',
            state: r.state,
            remark: r.remark || '',
            priority: r.priority,
            status: r.status
          }));
      
          return res.send({ results });
      
        } catch (e) {
          return res.status(500).send({ error: e.message });
        }
      },




      fetchIssueFollowStateJob: async (req, res) => {
        try {
          const { stateJob } = req.body;
      
          if (!stateJob) {
            return res.status(400).send({ message: 'missing_stateJob' });
          }
      
          const baseInclude = {
            Area: {
              select: {
                id: true,
                name: true,
              }
            },
            RequestUser: {
              select: {
                id: true,
                empNo: true,
                name: true,
              }
            },
            Material: {
              select: {
                id: true,
                materialNo: true,
                materialName: true,
                materialSpec: true,
              }
            }
          };
      
          let rows = [];
          let sortedRows = [];
      
          if (stateJob === 'wait') {
            rows = await prisma.job.findMany({
              where: {
                status: 'use',
                state: stateJob,
                type: 'issue'
              },
              orderBy: {
                requestTime: 'asc'
              },
              include: baseInclude
            });
      
            sortedRows = [...rows].sort((a, b) => {
              const aUrgent = String(a.priority || '').trim().toLowerCase() === 'urgent' ? 1 : 0;
              const bUrgent = String(b.priority || '').trim().toLowerCase() === 'urgent' ? 1 : 0;
      
              // 1) Urgent มาก่อน
              if (aUrgent !== bUrgent) {
                return bUrgent - aUrgent;
              }
      
              // 2) ในกลุ่มเดียวกัน เรียง requestTime เก่าสุดก่อน
              const aTime = new Date(a.requestTime).getTime();
              const bTime = new Date(b.requestTime).getTime();
      
              return aTime - bTime;
            });
          } else {
            rows = await prisma.job.findMany({
              where: {
                status: 'use',
                state: stateJob,
                type: 'issue'
              },
              orderBy: {
                inchargeTime: 'desc'
              },
              take: 100,
              include: baseInclude
            });
      
            sortedRows = rows;
          }
      
          const results = sortedRows.map((r) => ({
            id: r.id,
            jobNo: r.jobNo,
            incomingId: r.IncomingId ?? null,
            areaId: r.areaId,
            groupId: r.groupId,
            areaName: r.Area?.name || '',
            requestByUserId: r.requestByUserId,
            requestUserEmpNo: r.RequestUser?.empNo || '',
            requestUserName: r.RequestUser?.name || '',
            requestTime: r.requestTime,
            inchargeByUserId: r.inchargeByUserId ?? null,
            inchargeTime: r.inchargeTime ?? null,
            type: r.type,
            materialId: r.materialId,
            materialNo: r.Material?.materialNo || '',
            materialName: r.Material?.materialName || '',
            materialSpec: r.Material?.materialSpec || '',
            state: r.state,
            remark: r.remark || '',
            remarkMC: r.remarkMC || '',
            accountCode: r.accountCode || '',
            priority: r.priority,
            status: r.status
          }));
      
          return res.send({ results });
      
        } catch (e) {
          return res.status(500).send({ error: e.message });
        }
      },



      fetchIssueAll: async (req, res) => {
        try {
          const rows = await prisma.job.findMany({
            where: {
              status: 'use',
              type: 'issue',
              state: 'wait'
            },
            include: {
              Area: {
                select: {
                  id: true,
                  name: true,
                }
              },
              RequestUser: {
                select: {
                  id: true,
                  empNo: true,
                  name: true,
                }
              },
              Material: {
                select: {
                  id: true,
                  materialNo: true,
                  materialName: true,
                  materialSpec: true,
                }
              }
            }
          });
      
          const sortedRows = [...rows].sort((a, b) => {
            const aUrgent = String(a.priority || '').trim().toLowerCase() === 'urgent' ? 1 : 0;
            const bUrgent = String(b.priority || '').trim().toLowerCase() === 'urgent' ? 1 : 0;
      
            // 1) Urgent มาก่อน
            if (aUrgent !== bUrgent) {
              return bUrgent - aUrgent;
            }
      
            // 2) ในกลุ่มเดียวกัน เรียง requestTime เก่าสุดก่อน
            const aTime = new Date(a.requestTime).getTime();
            const bTime = new Date(b.requestTime).getTime();
      
            return aTime - bTime;
          });
      
          const results = sortedRows.map((r) => ({
            id: r.id,
            jobNo: r.jobNo,
            incomingId: r.IncomingId ?? null,
            areaId: r.areaId,
            areaName: r.Area?.name || '',
            requestByUserId: r.requestByUserId,
            requestUserEmpNo: r.RequestUser?.empNo || '',
            requestUserName: r.RequestUser?.name || '',
            requestTime: r.requestTime,
            inchargeByUserId: r.inchargeByUserId ?? null,
            inchargeTime: r.inchargeTime ?? null,
            type: r.type,
            materialId: r.materialId,
            materialNo: r.Material?.materialNo || '',
            materialName: r.Material?.materialName || '',
            materialSpec: r.Material?.materialSpec || '',
            state: r.state,
            remark: r.remark || '',
            accountCode: r.accountCode || '',
            priority: r.priority,
            status: r.status
          }));
      
          return res.send({ results });
      
        } catch (e) {
          return res.status(500).send({ error: e.message });
        }
      }



}