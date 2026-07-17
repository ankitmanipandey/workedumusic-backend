// services/shiftWarningCron.js
const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const SchoolHoliday = require('../models/SchoolHoliday'); // <-- 1. ADD IMPORT
const { sendPreShiftWarningEmail } = require('../utils/emailService');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');
const { getISTDateString } = require('../utils/timeHelper');

const getTimeAndDateContext = (minutesToAdd = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutesToAdd);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateString = dateFormatter.format(d);

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const currentDayName = dayFormatter.format(d);

    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const targetTimeStr = timeFormatter.format(d);

    return { dateString, currentDayName, targetTimeStr };
};

const startShiftWarningCron = (io) => {
    cron.schedule('* * * * *', async () => {
        try {
            const { dateString, currentDayName, targetTimeStr } = getTimeAndDateContext(15);

            const todayStart = new Date(`${dateString}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${dateString}T23:59:59.999+05:30`);

            const activeLeaves = await LeaveRequest.find({
                status: 'approved',
                fromDate: { $lte: todayEnd },
                toDate: { $gte: todayStart }
            });
            const usersOnLeaveSet = new Set(activeLeaves.map(leave => leave.employee.toString()));

            // --- 2. FETCH ACTIVE HOLIDAYS FOR TODAY ---
            const activeHolidays = await SchoolHoliday.find({
                startDate: { $lte: todayEnd },
                endDate: { $gte: todayStart }
            });

            const employeesStartingSoon = await User.find({
                role: 'Employee',
                isActive: true,
                assignments: {
                    $elemMatch: {
                        allowedDays: currentDayName,
                        startTime: targetTimeStr
                    }
                }
            }).populate('assignments.school');

            if (employeesStartingSoon.length === 0) return;

            for (const employee of employeesStartingSoon) {
                if (usersOnLeaveSet.has(employee._id.toString())) continue;

                const upcomingAssignments = employee.assignments.filter(a => {
                    if (!a.allowedDays.includes(currentDayName) || a.startTime !== targetTimeStr) return false;

                    const assignmentStartDate = a.startDate ? new Date(a.startDate) : a._id.getTimestamp();
                    const assignStartStr = getISTDateString(assignmentStartDate);

                    const isAfterStartDate = dateString >= assignStartStr;

                    let isBeforeEndDate = true;
                    if (a.endDate) {
                        const assignEndStr = getISTDateString(new Date(a.endDate));
                        isBeforeEndDate = dateString <= assignEndStr;
                    }

                    // --- 3. EXCLUDE IF THIS SHIFT IS ON HOLIDAY ---
                    const isHoliday = activeHolidays.some(h => {
                        const isSchoolMatch = h.affectedSchools.some(id => id.toString() === a.school._id.toString());
                        const hCat = (h.category || "").trim().toLowerCase();
                        const aCat = (a.category || "").trim().toLowerCase();
                        const isCategoryMatch = hCat === aCat || hCat === "all" || hCat === "";
                        const isExcluded = h.excludedAssignments?.some(exId => exId.toString() === a._id.toString());

                        return isSchoolMatch && isCategoryMatch && !isExcluded;
                    });

                    // Return false if it's a holiday so we don't warn them
                    if (isHoliday) return false;

                    return isAfterStartDate && isBeforeEndDate;
                });

                for (const assignment of upcomingAssignments) {
                    const schoolId = assignment.school._id.toString();
                    const category = assignment.category;

                    const hasCheckedIn = await Attendance.findOne({
                        teacher: employee._id,
                        school: schoolId,
                        band: category,
                        date: dateString
                    });

                    if (!hasCheckedIn) {
                        const schoolName = assignment.school.schoolName;
                        const msg = `Reminder: Your ${category} shift at ${schoolName} starts in 15 minutes (${targetTimeStr}). Please check in soon.`;

                        const notif = await Notification.create({
                            recipient: employee._id,
                            title: "Upcoming Shift Reminder",
                            message: msg,
                            type: "Warning"
                        });

                        if (io) {
                            io.to(employee._id.toString()).emit('new_notification', {
                                _id: notif._id, title: notif.title, message: notif.message, type: notif.type, timestamp: new Date()
                            });
                        }

                        if (await canSendEmailToUser(employee)) {
                            await sendPreShiftWarningEmail(employee.email, employee.name, schoolName, category, targetTimeStr);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Cron Job Error [Shift Warnings]:", error);
        }
    });

    console.log("⏰ Pre-Shift Warning Cron Job initialized.");
};

module.exports = startShiftWarningCron;