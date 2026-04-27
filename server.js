const express = require("express");
const app = express();



const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv  = require("dotenv");

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });


dotenv.config();


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
const inventoryReportController = require('./controllers/InventoryReport');
const stockOutReportController = require('./controllers/StockOutReport');
const transactionJobController = require('./controllers/TransactionJobReport');
const transactionStoreController = require('./controllers/TransactionStoreReport');
const transactionAllController = require('./controllers/TransactionAllReport');


app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));




//User
app.post('/api/user/create',(req, res) => userController.create(req,res))
app.post('/api/user/signin',(req, res) => userController.signin(req,res))
app.post('/api/user/mapSectionGroupUser',(req, res) => userController.mapSectionGroupUser(req,res))
app.get('/api/user/list',(req, res) => userController.list(req,res))
app.post('/api/user/edit',(req, res) => userController.edit(req,res))
app.post('/api/user/delete',(req, res) => userController.delete(req,res))
app.post('/api/user/exportExcel',(req, res) =>  userController.exportExcel(req,res))
app.post('/api/user/importExcel',upload.single('file'),(req, res) => userController.importExcel(req,res))
app.post('/api/user/signInRfId',(req, res) => userController.signInRfId(req,res))


//Section
app.post('/api/section/create',(req, res) => sectionController.add(req,res))
app.get('/api/section/list',(req, res) => sectionController.list(req,res))

//Group
app.post('/api/group/create',(req, res) => groupController.add(req,res))
app.get('/api/group/list',(req, res) => groupController.list(req,res))

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
app.post('/api/mc/fetchOneIncoming',(req,res) => mcController.fetchOneIncoming(req,res))

//issue
app.post('/api/issue/create',(req, res) => issueController.createIssue(req,res))
app.post('/api/issue/fetchIssueByUserId',(req, res) => issueController.fetchIssueByUserId(req,res))
app.get('/api/issue/fetIssueAll',(req, res)=> issueController.fetchIssueAll(req,res))
app.post('/api/issue/fetchIssueFollowStateJob',(req ,res) => issueController.fetchIssueFollowStateJob(req,res))
app.post('/api/issue/delete',(req,res) => issueController.delete(req,res))



//return
app.post('/api/return/create',(req, res) => returnController.createReturn(req,res))
app.post('/api/return/fetchReturnByUserId',(req, res) => returnController.fetchReturnByUserId(req,res))
app.get('/api/return/fetchReturnAll',(req, res)=> returnController.fetchReturnAll(req,res))
app.post('/api/reurn/fetchReturnFollowStateJob',(req ,res) => returnController.fetchReturnFollowStateJob(req,res))
app.post('/api/return/delete',(req, res) => returnController.delete(req,res))



//inventoryReport

app.get('/api/inventory/list',(req, res) => inventoryReportController.list(req,res))
app.post('/api/inventory/exportExcel',(req, res) => inventoryReportController.exportExcel(req,res))
app.post('/api/inventory/editStockNote',(req, res) => inventoryReportController.editStockNote(req,res))



//StockOutReport

app.get('/api/stockOut/list',(req, res) => stockOutReportController.list(req,res))
app.post('/api/stockOut/exportExcel',(req, res) => stockOutReportController.exportExcel(req,res))



//TransactionJobReport

app.get('/api/reportJob/list',(req, res) => transactionJobController.list(req,res))
app.post('/api/reportJob/exportExcel',(req, res) => transactionJobController.exportExcel(req,res))



//TransactionStoreReport     

app.get('/api/transactionStore/list',(req, res) => transactionStoreController.list(req,res))


//TransactionAllReport

app.get('/api/transactionAll/list',(req, res) => transactionAllController.list(req,res))
app.post('/api/transactionAll/exportExcel',(req, res) => transactionAllController.exportExcel(req,res))





// app.listen(3001, ()=>{
//     console.log("API Server Running...");
// })



//app.listen(3001);
app.listen(3001,'0.0.0.0', () => {
   console.log('API + WebSocket listening on port 3001');
});