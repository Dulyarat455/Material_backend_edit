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
const materialController = require('./controllers/MaterialController');
const issueController = require('./controllers/IssueController');
const returnController = require('./controllers/ReturnController');
const stockOutRepport = require('./controllers/StockOutReport');
const stockLocReport = require('./controllers/StockLocReport');
const historyReport = require('./controllers/HistoryReport');
const inventoryReport = require('./controllers/InventoryReport');



app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//User
app.post('/api/user/create',(req, res) => userController.create(req,res))
app.post('/api/user/signin',(req, res) => userController.signin(req,res))
app.post('/api/user/mapSectionGroupUser',(req, res) => userController.mapSectionGroupUser(req,res))


//Section
app.post('/api/section/create',(req, res) => sectionController.add(req,res))


//Group
app.post('/api/group/create',(req, res) => groupController.add(req,res))


//StoreMaster
app.post('/api/storeMaster/create',(req, res) => storeMasterController.add(req,res))
app.get('/api/storeMaster/list',(req, res) => storeMasterController.list(req,res))
app.post('/api/storeMaster/mapLayOut',(req, res) => storeMasterController.mapLayOut(req,res))


//Line
app.post('/api/line/create',(req, res) => lineController.add(req,res))


//Area
app.post('/api/area/create',(req, res) => areaController.add(req,res))
app.post('/api/area/mapLineArea',(req, res) => areaController.mapLineArea(req,res))
app.post('/api/area/filterByLineArea',(req, res)=> areaController.filterbyLineArea(req,res))


//Material
app.post('/api/material/create',(req, res) => materialController.add(req,res))
app.get('/api/material/filterByMaterialNo',(req, res) => materialController.filterByMaterialNo(req,res))
app.get('/api/material/list',(req, res) => materialController.list(req,res))
app.get('/api/material/getMaterialByPbass',(req, res) => materialController.getMaterialByPbass(req,res))


//McController
app.post('/api/mc/stockIn',(req, res) => mcController.stockIn(req,res))
app.get('/api/mc/fetchIncomingAll',(req, res) => mcController.fetchIncomingAll(req,res))
app.post('/api/mc/moveArea',(req, res) => mcController.moveArea(req,res))
app.post('/api/mc/stockOutByProduction',(req, res) => mcController.stockOutByProduction(req,res))
app.post('/api/mc/stockInByProduction',(req, res) => mcController.stockInByProduction(req,res))
app.post ('/api/mc/stockOutMaterial',(req,res) => mcController.outStock(req,res))


//issue
app.post('/api/issue/create',(req, res) => issueController.createIssue(req,res))
app.post('/api/issue/fetchIssueByUserId',(req, res) => issueController.fetchIssueByUserId(req,res))
app.get('/api/issue/fetIssueAll',(req, res)=> issueController.fetchIssueAll(req,res))
app.post('/api/issue/fetchIssueFollowStateJob',(req ,res) => issueController.fetchIssueFollowStateJob(req,res))


//return
app.post('/api/return/create',(req, res) => returnController.createReturn(req,res))
app.post('/api/return/fetchReturnByUserId',(req, res) => returnController.fetchReturnByUserId(req,res))
app.get('/api/return/fetchReturnAll',(req, res)=> returnController.fetchReturnAll(req,res))
app.post('/api/reurn/fetchReturnFollowStateJob',(req ,res) => returnController.fetchReturnFollowStateJob(req,res))




//StockOutReport






//StockLocReport








//HistoryReport








//InventoryReport     










// app.listen(3001, ()=>{
//     console.log("API Server Running...");
// })



//app.listen(3001);
app.listen(3001,'0.0.0.0', () => {
   console.log('API + WebSocket listening on port 3001');
});