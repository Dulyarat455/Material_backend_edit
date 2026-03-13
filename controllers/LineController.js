const {PrismaClient} = require('../generated/prisma');
const prisma = new PrismaClient();



module.exports = {
    add: async (req,res) =>{
        try{
            const { name } = req.body;

            if (!name) {
            return res.status(400).send({ message: 'missing_required_fields' });
            }

            const checkLine = await prisma.line.findFirst({
                where: {
                name: name,
                status: 'use',
                },
            });

            if (checkLine) {
                return res.status(400).send({ message: 'Line_name_already' });
            }  


            const line = await prisma.line.create({
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
                message: 'add_line_success',
                data: line,
            });

        }catch(e){
            return res.status(500).send({ error: e.message });
        }
    },

}