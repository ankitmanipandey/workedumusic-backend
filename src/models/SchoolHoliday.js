const mongoose = require('mongoose');

const schoolHolidaySchema = new mongoose.Schema({
    title: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    affectedSchools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'School' }],
    // NEW: Contextual Category
    category: {
        type: String,
        enum: ['Junior Band', 'Senior Band', 'All'],
        default: 'All'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('SchoolHoliday', schoolHolidaySchema);