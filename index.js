const express = require('express');
const app = express();
const port = process.env.PORT || 3000; 
const path = require('path');
const data = require('./models/Schema');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const User = require('./models/user');
const cors = require('cors');

// Always attempt to load dotenv safely for local environments
// On Vercel, it won't break if .env isn't pushed because variables are read directly from the dashboard panel
require('dotenv').config(); 
// Add this right below your app.use(cors(...)) setup:

// ❌ Replace app.use(cors()); with this:
app.use(cors({
    origin: '*', // Allows your mobile app and local previews to communicate
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.options('*', cors()); // Responds cleanly to all browser preflight checks!
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Robust path configurations for dynamic Serverless containers
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Environment variable connection safety fallback
const dbUrl = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expenseTracker';

// Global placeholder kept as requested
let TempUserId = null; 

// Serverless Connection Cache to prevent Atlas connection storms
let cachedConnection = null;
async function connectDB() {
    if (cachedConnection && mongoose.connection.readyState === 1) return;
    try {
        cachedConnection = await mongoose.connect(dbUrl, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000
        });
        console.log("MongoDB connected successfully");
    } catch (err) {
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
        if (!email) {
            return res.render("findTracker.ejs", { error: "Please enter a valid email address." });
        }
        const user = await User.findOne({ email: email.trim().toLowerCase() }).exec();

        if (!user) {
            return res.render("findTracker.ejs", { 
                error: "No tracker found with that email address. Try again or create a new profile." 
            });
        }
        
        TempUserId = user._id; // Store the user ID globally
        res.json({ message: "Tracker found successfully", userId: user._id, name: user.name, email: user.email });
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
        if (!email || !name) {
            return res.status(400).send("Name and Email are completely required fields.");
        }
        let getUser = await User.findOne({ email: email.trim().toLowerCase() }).exec();
        if (getUser) {
            return res.json({ message: "User already exists", userId: getUser._id });
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
        let targetId = userId || TempUserId;
        if (!targetId) {
            return res.status(400).json({ error: "User ID is required to fetch expense logs." });
        }

        let allData = await data.find({ userId: targetId }).exec();
        let user = await User.findById(targetId).exec();

        if (!user) {
            return res.status(404).json({ error: "User records profile not found." });
        }

        const grandTotal = allData.reduce((sum, log) => sum + (Number(log.totalDaily) || 0), 0);
        res.json({ logs: allData, userName: user.name, grandTotal: grandTotal });
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).send(`Failed to retrieve data: ${err.message}`);
    }
});

app.get("/addexpense", (req, res) => {
    if (!TempUserId && req.query.userId) {
        TempUserId = req.query.userId;
    }
    res.render("index.ejs", { userId: TempUserId });
});

app.post("/addexpense", async (req, res) => {
    let { petrol_amount, food_amount, others_amount, petrol_desc, food_desc, others_desc, userId } = req.body;

    let fetchedUserId = userId || TempUserId;
    if (!fetchedUserId) {
        return res.status(400).send("User tracking identifier missing from request context.");
    }

    let petrolNum = Number(petrol_amount) || 0;
    let foodNum = Number(food_amount) || 0;
    let othersNum = Number(others_amount) || 0;
    let calculatedTotal = petrolNum + foodNum + othersNum;

    let newdata = new data({ 
        userId: fetchedUserId, 
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

        TempUserId = updatedLog.userId; 
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
        TempUserId = deletedLog.userId; 
        res.json({ message: "Expense deleted successfully", userId: TempUserId });
    } catch (err) {
        res.status(500).send("Failed to delete data");
    }
});

// Local Server Start - Avoids crashing serverless processes on Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

module.exports = app;