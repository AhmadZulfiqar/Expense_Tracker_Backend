const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
    userId: { // Connects the Log schema structure straight to the User model
        type: String,
    },
    date: { type: Date, default: Date.now },
    petrol: { type: Number, default: 0 },
    food: { type: Number, default: 0 },
    others: { type: Number, default: 0 },
    petrol_des: { type: String, default: "" },
    food_des: { type: String, default: "" },
    others_des: { type: String, default: "" },
    totalDaily: { type: Number, default: 0 }
});

// Middleware Fix: Calculate total and fire next() safely
dailyLogSchema.pre('save', function (next) {
    this.totalDaily = (this.petrol || 0) + (this.food || 0) + (this.others || 0);
    
});

module.exports = mongoose.model('DailyLog', dailyLogSchema);