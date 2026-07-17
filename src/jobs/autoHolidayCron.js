const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { getISTDateString, getISTDayOfWeek } = require('../utils/timeHelper');
const SchoolHoliday = require('../models/SchoolHoliday');

const startAutoHolidayCron = () => {
    cron.schedule('5 0 * * *', async () => {
        console.log("📅 [CRON] Checking for Categorized School Holidays...");
        try {
            const todayStr = getISTDateString();
            const todayDayName = getISTDayOfWeek();
            const todayStart = new Date(`${todayStr}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${todayStr}T23:59:59.999+05:30`);

            const activeHolidays = await SchoolHoliday.find({
                startDate: { $lte: todayEnd },
                endDate: { $gte: todayStart }
            });

            if (activeHolidays.length === 0) return;

            const employees = await User.find({ role: 'Employee', isActive: true });
            const attendancePromises = []; // Store queries to execute concurrently

            for (const emp of employees) {
                // FIX 1: Ensure the assignment is active today AND falls on the right day of the week
                const todaysShifts = emp.assignments.filter(a => {
                    const isCorrectDay = a.allowedDays.includes(todayDayName);

                    const assignStart = a.startDate ? new Date(a.startDate) : new Date(0);
                    const assignEnd = a.endDate ? new Date(a.endDate) : new Date('2099-12-31');

                    const isActiveDate = todayEnd >= assignStart && todayStart <= assignEnd;

                    return isCorrectDay && isActiveDate;
                });

                for (const shift of todaysShifts) {
                    const schoolIdStr = shift.school.toString();

                    const applicableHoliday = activeHolidays.find(h => {
                        const isGlobal = !h.affectedSchools || h.affectedSchools.length === 0;
                        const isSchoolMatch = h.affectedSchools.map(id => id.toString()).includes(schoolIdStr);
                        const isCategoryMatch = h.category === 'All' || h.category === shift.category;

                        return (isGlobal || isSchoolMatch) && isCategoryMatch;
                    });

                    if (applicableHoliday) {
                        // FIX 2: Push the async operation into an array instead of waiting for it immediately
                        const checkAndCreate = async () => {
                            const exists = await Attendance.findOne({
                                teacher: emp._id,
                                school: shift.school,
                                band: shift.category,
                                date: todayStr
                            });

                            if (!exists) {
                                await Attendance.create({
                                    teacher: emp._id,
                                    school: shift.school,
                                    band: shift.category,
                                    date: todayStr,
                                    status: 'Holiday',
                                    teacherNote: `System Auto-Marked: ${applicableHoliday.title}`
                                });
                                console.log(`✅ Holiday: ${emp.name} | ${shift.category} | ${applicableHoliday.title}`);
                            }
                        };

                        attendancePromises.push(checkAndCreate());
                    }
                }
            }

            // Execute all DB queries in parallel for massive performance boost
            if (attendancePromises.length > 0) {
                await Promise.all(attendancePromises);
            }

        } catch (error) {
            console.error("❌ [CRON] Auto-Holiday Error:", error);
        }
    }, { timezone: "Asia/Kolkata" });
};

module.exports = startAutoHolidayCron;