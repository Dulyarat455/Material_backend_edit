const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");


const userController = require('./controllers/UserController');
const sectionController = require('./controllers/SectionController');
const groupController = require('./controllers/GroupController');
const storeMasterController = require('./controllers/StoreMaster');
const lineController = require('./controllers/LineController');
const areaController  = require('./controllers/AreaController');
const mcController = require('./controllers/McController');



app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//User
app.post('/api/user/create',(req, res) => userController.create(req,res))


//Section
app.post('/api/section/create',(req, res) => sectionController.add(req,res))


//Group
app.post('/api/group/create',(req, res) => groupController.add(req,res))


//StoreMaster
app.post('/api/storeMaster/create',(req, res) => storeMasterController.add(req,res))
app.get('/api/storeMaster/list',(req, res) => storeMasterController.list(req,res))



//Line
app.post('/api/line/create',(req, res) => lineController.add(req,res))


//Area
app.post('/api/area/create',(req, res) => areaController.add(req,res))


//McController
app.post('/api/mc/stockIn',(req, res) => mcController.stockIn(req,res))



// app.listen(3001, ()=>{
//     console.log("API Server Running...");
// })



//app.listen(3001);
app.listen(3001,'0.0.0.0', () => {
   console.log('API + WebSocket listening on port 3001');
});