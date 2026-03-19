const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


module.exports = {

    createIssue: async (req, res) => {
        try {
          const {
            incomingId,
            areaId,
            requestByUserId,
            type,
            materialId,
            remark,
            priority
          } = req.body;
      
          if (
            incomingId == null ||
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
      
          const requestIssueJob = await prisma.job.create({
            data: {
              jobNo: await genJobNo(),
              incomingId: parseInt(incomingId),
              areaId: parseInt(areaId),
              requestByUserId: parseInt(requestByUserId),
              type: type || 'issue',
              materialId: parseInt(materialId),
              state: 'wait',
              remark: remark ?? null,
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


      
}