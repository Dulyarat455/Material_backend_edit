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
  
        // ✅ หา user + map + group/section (ใช้ schema ปัจจุบัน: status เท่านั้น)
        const u = await prisma.user.findFirst({
          where: {
            empNo: String(empNo).trim(),
            password: String(password),
            status: 'use',
          },
         
        });
  
        if (!u) {
          return res.status(401).send({ message: 'unauthorized' });
        }
  
      
  
        // ✅ payload (ไม่มี accountState เพราะ schema ไม่มี)
        const payload = {
          id: u.id,
          empNo: u.empNo,
          name: u.name,
          role: u.role,
          rfId: u.rfId,
          status: u.status,
  
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
    






}

