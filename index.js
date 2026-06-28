const express = require('express');
const app = express();
const port = process.env.PORT || 3000; 
const path = require('path');
const data = require('./models/schema');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const User = require('./models/user');
const cors = require('cors');

app.use(cors()); // Enable CORS for all routes
app.use(express.json());

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config(); 
}

// Configuration for Vercel
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Environment variable connection safety fallback
const dbUrl = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expenseTracker';

// Global placeholder kept as requested
let TempUserId = null; 



// Serverless Connection Cache to prevent Atlas connection storms
let cachedConnection = null;
async function connectDB() {
    if (cachedConnection && mongoose.connection.readyState === 1) return;
    try{
        cachedConnection = await mongoose.connect(dbUrl, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
        });
        console.log("MongoDB connected successfully");
    }catch(err){
        console.error("MongoDB connection error:", err);
    }
}

// Automatic connection middleware layer
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("Database connection failed:", err);
        res.status(500).send("Database connection lost. Please refresh the page.");
    }
});

// --- ROUTES ---

app.get('/', (req, res) => {
    res.json({ message: "Welcome to the Expense Tracker API. Use /find-tracker to locate your tracker or /user to create a new profile." });
});

// Render the Find Tracker Search Page
app.get("/find-tracker", (req, res) => {
    res.render("findTracker.ejs", { error: null });
});

// Handle the Email Search Form Submission
app.post("/find-tracker", async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email: email.trim().toLowerCase() }).exec();

        if (!user) {
            return res.render("findTracker.ejs", { 
                error: "No tracker found with that email address. Try again or create a new profile." 
            });
        }
        
        TempUserId = user._id; // Store the user ID globally
        
        // Fail-safe: also attach to URL so Vercel doesn't lose it if a container sleeps
        res.json({ message: "Tracker found successfully", userId: user._id,name: user.name, email: user.email });
    } catch (err) {
        console.error("Search Error:", err);
        res.status(500).send("An error occurred while searching for your tracker.");
    }
});

// Render User Form
app.get("/user", (req, res) => {
    res.render("user.ejs");
});

// Handle User Submission
app.post("/user", async (req, res) => {
    const { name, email } = req.body;
    try {
        let getUser= await User.findOne({ email: email.trim().toLowerCase() }).exec();
        if (getUser) {
            res.json({ message: "User already exists", userId: getUser._id });
        }
        const newUser = new User({ name: name.trim(), email: email.trim().toLowerCase() });
        await newUser.save();
        TempUserId = newUser._id; // Store the user ID globally
       
        res.json({ message: "User saved successfully" , userId: newUser._id });
    } catch (err) {
        console.error("Error saving user details:", err);
        res.status(500).send(`Failed to save user: ${err.message}`);
    }
});

// Expense Log Route
app.post("/expenselog", async (req, res) => {
    let { userId } = req.body;
    try {
        // VERCEL FAIL-SAFE: If serverless wiped out TempUserId, rebuild it using the URL parameter
        

        

        let allData = await data.find({ userId: userId }).exec();
        let user = await User.findById(userId).exec();



        const grandTotal = allData.reduce((sum, log) => sum + (Number(log.totalDaily) || 0), 0);
        
        res.json({ logs: allData, userName: user.name, grandTotal: grandTotal });
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).send(`Failed to retrieve data: ${err.message}`);
    }
});

app.get("/addexpense", (req, res) => {
    // Rebuild global variable state if lost during transition tabs
    if (!TempUserId && req.query.userId) {
        TempUserId = req.query.userId;
    }
    res.render("index.ejs", { userId: TempUserId });
});

app.post("/addexpense", async (req, res) => {
    

    let { petrol_amount, food_amount, others_amount, petrol_desc, food_desc, others_desc, userId } = req.body;

    // Use the userId from the request body if available, otherwise use the global TempUserId
    let fetchedUserId = userId;
    

    let petrolNum = Number(petrol_amount) || 0;
    let foodNum = Number(food_amount) || 0;
    let othersNum = Number(others_amount) || 0;
    let calculatedTotal = petrolNum + foodNum + othersNum;

    let newdata = new data({ 
        userId: fetchedUserId, // Still tracking cleanly off your global property
        petrol: petrolNum, 
        food: foodNum, 
        others: othersNum, 
        petrol_des: petrol_desc, 
        food_des: food_desc, 
        others_des: others_desc,
        totalDaily: calculatedTotal 
    });

    try {
        await newdata.save();
        res.json({ message: "Expense saved successfully", userId: fetchedUserId });
    } catch (err) {
        console.error("Error saving data to DB:", err);
        res.status(500).send(`Failed to save data: ${err.message}`);
    }
});

app.get("/editexpense/:id", async (req, res) => {
    let { id } = req.params;
    try {
        let foundData = await data.findById(id).exec();
        res.render("edit.ejs", { log: foundData });
    } catch (err) {
        res.status(500).send("Failed to retrieve data for edit");
    }
});

app.put("/editexpense", async (req, res) => {
    let { logId, petrol_amount, food_amount, others_amount, petrol_desc, food_desc, others_desc } = req.body;
    
    const petrolNum = Number(petrol_amount) || 0;
    const foodNum = Number(food_amount) || 0;
    const othersNum = Number(others_amount) || 0;
    const updatedTotal = petrolNum + foodNum + othersNum;
    
    try {
        const updatedLog = await data.findByIdAndUpdate(logId, { 
            petrol: petrolNum, 
            food: foodNum, 
            others: othersNum,
            petrol_des: petrol_desc, 
            food_des: food_desc,
            others_des: others_desc,
            totalDaily: updatedTotal 
        }, { runValidators: true, new: true }).exec();

        TempUserId = updatedLog.userId; // Sync memory state
        res.json({ message: "Expense updated successfully", userId: TempUserId });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).send(`Failed to update data: ${err.message}`);
    }
});

app.post("/deleteexpenses", async (req, res) => {
    let { logId , userId }= req.body;
    try {
        const deletedLog = await data.findByIdAndDelete(logId).exec();
        TempUserId = deletedLog.userId; // Sync memory state
        res.json({ message: "Expense deleted successfully", userId: TempUserId });
    } catch (err) {
        res.status(500).send("Failed to delete data");
    }
});

// Local Server Start
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

module.exports = app;