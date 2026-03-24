const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken')

module.exports = {

    create: async(req,res)=>{
        try{
            const { rfId, empNo, name, password, role } = req.body ;

            if (
                role == null ||
                rfId == null ||
                name == null ||
                empNo == null ||
                password == null   
              ) {
                return res.status(400).send({ message: 'missing_required_fields' });
              }

              // check account 

              const existUser = await prisma.user.findFirst({
                where: {
                  OR: [
                    { empNo },
                    {name},
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

                const user =  await prisma.user.create({
                    data:{
                        name: name,
                        password: password,
                        role: role,
                        rfId: rfId,
                        empNo: empNo,
                    }
                })


            return res.send({ message: "Add user success",...user });
        }catch(e){
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
    }
    


}

