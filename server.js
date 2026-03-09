const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");


const userController = require('./controllers/UserController');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


app.post('/api/user/create',(req, res) => userController.create(req,res))



app.listen(3001, ()=>{
    console.log("API Server Running...");
})