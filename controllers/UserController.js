const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken')

module.exports = {

  create: async (req, res) => {
      try {
        const { rfId, empNo, name, password, role, groupId, sectionId } = req.body;

        if (
          role == null ||
          rfId == null ||
          name == null ||
          empNo == null ||
          password == null ||
          groupId == null ||
          sectionId == null
        ) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }

        const existUser = await prisma.user.findFirst({
          where: {
            OR: [
              { empNo },
              { name },
              rfId ? { rfId } : undefined,
            ].filter(Boolean),
          },
        });

        if (existUser) {
          return res.status(400).send({
            message: 'user_already_exists',
            detail: {
              empNo: existUser.empNo === empNo,
              name: existUser.name === name,
              rfId: rfId ? existUser.rfId === rfId : false,
            },
          });
        }

        const checkGroup = await prisma.group.findFirst({
          where: {
            id: parseInt(groupId),
            status: 'use'
          }
        });

        if (!checkGroup) {
          return res.status(400).send({ message: 'group_not_found' });
        }

        const checkSection = await prisma.section.findFirst({
          where: {
            id: parseInt(sectionId),
            status: 'use'
          }
        });

        if (!checkSection) {
          return res.status(400).send({ message: 'section_not_found' });
        }

        const data = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              name,
              password,
              role,
              rfId,
              empNo
            }
          });

          const mapSectionGroupUser = await tx.mapSectionGroupUser.create({
            data: {
              userId: user.id,
              groupId: parseInt(groupId),
              sectionId: parseInt(sectionId)
            }
          });

          return {
            user,
            mapSectionGroupUser
          };
        });

        return res.send({
          message: 'Add user success',
          data
        });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },



    signin: async (req, res) => {
      try {
        const { empNo, password } = req.body;
    
        if (!empNo || !password) {
          return res.status(400).send({ message: 'missing_empNo_or_password' });
        }
    
        const u = await prisma.user.findFirst({
          where: {
            empNo: String(empNo).trim(),
            password: String(password),
            status: 'use',
          },
          include: {
            MapSectionGroupUser: {
              where: {
                status: 'use',
              },
              include: {
                Group: true,
                Section: true,
              },
              take: 1,
            },
          },
        });
    
        if (!u) {
          return res.status(401).send({ message: 'unauthorized' });
        }
    
        const map = u.MapSectionGroupUser?.[0] || null;
    
        const payload = {
          id: u.id,
          empNo: u.empNo,
          name: u.name,
          role: u.role,
          rfId: u.rfId,
          status: u.status,
    
          groupId: map?.groupId || null,
          groupName: map?.Group?.name || null,
          sectionId: map?.sectionId || null,
          sectionName: map?.Section?.name || null,
        };
    
        const key = process.env.SECRET_KEY;
        if (!key) {
          return res.status(500).send({ message: 'missing_SECRET_KEY' });
        }
    
        const token = jwt.sign(
          {
            id: payload.id,
            empNo: payload.empNo,
            role: payload.role,
            name: payload.name,
            groupId: payload.groupId,
            groupName: payload.groupName,
            sectionId: payload.sectionId,
            sectionName: payload.sectionName,
          },
          key,
          { expiresIn: '30d' }
        );
    
        return res.send({ token, ...payload });
      } catch (e) {
        console.error(e);
        return res.status(500).send({ error: e.message });
      }
    },


    mapSectionGroupUser: async (req,res) =>{
      try{
         const {userId, groupId, sectionId} = req.body;
         
         if (userId == null || groupId == null || sectionId == null) {
            return res.status(400).send({ message: 'missing_required_fields' });
        }      


        const checkMapSectionGroupUser  = await prisma.mapSectionGroupUser.findFirst({
          where: {
            status: 'use',
            userId: parseInt(userId) ,
            groupId: parseInt(groupId),
            sectionId: parseInt(sectionId)
          },
        });

        if (checkMapSectionGroupUser) {
          return res.status(400).send({ message: 'mapSectionGroupUser_name_already' });
        }  


        const mapSectionGroupUser = await prisma.mapSectionGroupUser.create({
          data: {
            userId: parseInt(userId),
            groupId: parseInt(groupId),
            sectionId: parseInt(sectionId)
          },
        });

      return res.send({
          message: 'map_sectionGroupUser_success',
          data: mapSectionGroupUser,
      });


      }catch(e){
        return res.status(500).send({ error: e.message });
      }
    },


    list: async (req, res) => {
      try {
        const chunkSize = 500;
  
        const idRows = await prisma.user.findMany({
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
  
        const allIds = idRows.map(x => x.id);
        const results = [];
  
        for (let i = 0; i < allIds.length; i += chunkSize) {
          const chunkIds = allIds.slice(i, i + chunkSize);
  
          const chunkRows = await prisma.user.findMany({
            where: {
              id: { in: chunkIds },
              status: 'use'
            },
            orderBy: {
              id: 'desc'
            },
            include: {
              MapSectionGroupUser: {
                where: {
                  status: 'use'
                },
                include: {
                  Group: {
                    select: {
                      id: true,
                      name: true
                    }
                  },
                  Section: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            }
          });
  
          const userIds = chunkRows.map(x => x.id);
  
          const waitJobs = await prisma.job.findMany({
            where: {
              requestByUserId: { in: userIds },
              status: 'use',
              state: 'wait',
              type: {
                in: ['issue', 'return']
              }
            },
            orderBy: {
              id: 'desc'
            },
            select: {
              id: true,
              jobNo: true,
              type: true,
              requestByUserId: true
            }
          });
  
          const waitJobMap = new Map();
  
          for (const job of waitJobs) {
            const userId = job.requestByUserId;
  
            if (!waitJobMap.has(userId)) {
              waitJobMap.set(userId, {
                issueWaitCount: 0,
                returnWaitCount: 0,
                issueWaitJobNos: [],
                returnWaitJobNos: []
              });
            }
  
            const bucket = waitJobMap.get(userId);
  
            if (job.type === 'issue') {
              bucket.issueWaitCount += 1;
              bucket.issueWaitJobNos.push(job.jobNo || '');
            }
  
            if (job.type === 'return') {
              bucket.returnWaitCount += 1;
              bucket.returnWaitJobNos.push(job.jobNo || '');
            }
          }
  
          const mapped = chunkRows.map((row) => {
            const mapRow = row.MapSectionGroupUser?.[0] || null;
            const waitInfo = waitJobMap.get(row.id) || {
              issueWaitCount: 0,
              returnWaitCount: 0,
              issueWaitJobNos: [],
              returnWaitJobNos: []
            };
  
            const totalWaitCount =
              waitInfo.issueWaitCount + waitInfo.returnWaitCount;
  
            return {
              id: row.id,
              rfId: row.rfId || '',
              empNo: row.empNo || '',
              name: row.name || '',
              password: row.password || '',
              role: row.role || '',
              status: row.status || '',
              groupId: mapRow?.groupId || null,
              groupName: mapRow?.Group?.name || '',
              sectionId: mapRow?.sectionId || null,
              sectionName: mapRow?.Section?.name || '',
  
              issueWaitCount: waitInfo.issueWaitCount,
              returnWaitCount: waitInfo.returnWaitCount,
              issueWaitJobNos: waitInfo.issueWaitJobNos,
              returnWaitJobNos: waitInfo.returnWaitJobNos,
              totalWaitCount,
              hasPending: totalWaitCount > 0
            };
          });
  
          results.push(...mapped);
        }
  
        return res.send({ results });
      } catch (e) {
        return res.status(500).send({ error: e.message });
      }
    },


    edit: async (req, res) => {
      try{
        const { userId, rfId, empNo, name, password, role, groupId, sectionId } = req.body;


        if (
          userId == null,
          rfId == null,
          !empNo,
          !name,
          !password,
          !role,
          groupId == null,
          sectionId == null 
        ) {
          return res.status(400).send({ message: 'missing_required_fields' });
        }



      }catch(e){
        return res.status(500).send({ error: e.message });
      }
    },








    delete: async (req, res)=> {
      try{

      }catch(e){
        return res.status(500).send({ error: e.message });
      } 
    }

    


}

