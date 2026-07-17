const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
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

            for (const emp of employees) {
                const todaysShifts = emp.assignments.filter(a => a.allowedDays.includes(todayDayName));

                for (const shift of todaysShifts) {
                    const schoolIdStr = shift.school.toString();

                    // Check if any active holiday applies to THIS specific school AND THIS specific category
                    const applicableHoliday = activeHolidays.find(h => {
                        const isGlobal = !h.affectedSchools || h.affectedSchools.length === 0;
                        const isSchoolMatch = h.affectedSchools.map(id => id.toString()).includes(schoolIdStr);
                        const isCategoryMatch = h.category === 'All' || h.category === shift.category;

                        return (isGlobal || isSchoolMatch) && isCategoryMatch;
                    });

                    if (applicableHoliday) {
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
                    }
                }
            }
        } catch (error) {
            console.error("❌ [CRON] Auto-Holiday Error:", error);
        }
    }, { timezone: "Asia/Kolkata" });
};

module.exports = startAutoHolidayCron