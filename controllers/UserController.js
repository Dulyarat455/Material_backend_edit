const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();


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

}

