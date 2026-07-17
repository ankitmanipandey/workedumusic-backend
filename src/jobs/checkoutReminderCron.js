// services/checkoutReminderCron.js
const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const SchoolHoliday = require('../models/SchoolHoliday');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');
const {
    sendEmployeeCheckoutReminder,
    sendAdminCheckoutAlert
} = require('../utils/emailService');
const { getISTDateString } = require('../utils/timeHelper');

const getTimeAndDateContext = (minutesToSubtract = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - minutesToSubtract);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateString = dateFormatter.format(d);

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const currentDayName = dayFormatter.format(d);

    const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const targetTimeStr = timeFormatter.format(d);

    return { dateString, currentDayName, targetTimeStr, targetDateObj: d };
};

const sendInAppNotification = async (io, userId, title, message, type) => {
    const notif = await Notification.create({ recipient: userId, title, message, type });
    if (io) {
        io.to(userId.toString()).emit('new_notification', {
            _id: notif._id, title: notif.title, message: notif.message, type: notif.type, timestamp: new Date()
        });
    }
};

const startCheckoutReminderCron = (io) => {
    cron.schedule('* * * * *', async () => {
        try {
            // 1. Look for shifts that ended exactly 10 minutes ago
            const context = getTimeAndDateContext(10);
            console.log(`[Cron tick] Checking overdues... -> Searching for EndTime: Day: ${context.currentDayName}, Time: ${context.targetTimeStr}`);

            // --- SYNCED LEAVE & HOLIDAY CHECKER ---
            const currentISTDate = context.dateString;

            const todayStart = new Date(`${currentISTDate}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${currentISTDate}T23:59:59.999+05:30`);

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

            // 3. Find employees who have a shift ending at this exact time today
            const overdueEmployees = await User.find({
                role: 'Employee',
                isActive: true,
                assignments: { $elemMatch: { allowedDays: context.currentDayName, endTime: context.targetTimeStr } }
            }).populate('assignments.school');

            if (overdueEmployees.length === 0) return;

            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            for (const employee of overdueEmployees) {
                // <-- LEAVE CHECK -->
                if (usersOnLeaveSet.has(employee._id.toString())) {
                    console.log(` -> Skipping checkout reminder: ${employee.name} is on approved leave.`);
                    continue;
                }

                // Filter down to the specific assignments that ended 10 mins ago AND apply Date Isolation
                const endedAssignments = employee.assignments.filter(a => {
                    if (!a.allowedDays.includes(context.currentDayName) || a.endTime !== context.targetTimeStr) return false;

                    const assignmentStartDate = a.startDate ? new Date(a.startDate) : a._id.getTimestamp();
                    const assignStartStr = getISTDateString(assignmentStartDate);

                    const isAfterStartDate = currentISTDate >= assignStartStr;

                    let isBeforeEndDate = true;
                    if (a.endDate) {
                        const assignEndStr = getISTDateString(new Date(a.endDate));
                        isBeforeEndDate = currentISTDate <= assignEndStr;
                    }

                    // --- 4. EXCLUDE IF THIS SHIFT IS ON HOLIDAY ---
                    const isHoliday = activeHolidays.some(h => {
                        const isSchoolMatch = h.affectedSchools.some(id => id.toString() === a.school._id.toString());
                        const hCat = (h.category || "").trim().toLowerCase();
                        const aCat = (a.category || "").trim().toLowerCase();
                        const isCategoryMatch = hCat === aCat || hCat === "all" || hCat === "";
                        const isExcluded = h.excludedAssignments?.some(exId => exId.toString() === a._id.toString());

                        return isSchoolMatch && isCategoryMatch && !isExcluded;
                    });

                    // Return false if it's a holiday to avoid querying the Attendance collection
                    if (isHoliday) return false;

                    return isAfterStartDate && isBeforeEndDate;
                });

                for (const assignment of endedAssignments) {
                    const attendanceRecord = await Attendance.findOne({
                        teacher: employee._id,
                        school: assignment.school._id,
                        band: assignment.category,
                        date: context.dateString
                    });

                    // Only send a reminder if they checked in ('Present' or 'Late') but haven't checked out
                    if (attendanceRecord && !attendanceRecord.checkOutTime && ['Present', 'Late'].includes(attendanceRecord.status)) {
                        console.log(` -> Sending checkout reminder to ${employee.name}`);

                        // 1. Notify Employee
                        const empMsg = `Reminder: Your shift at ${assignment.school.schoolName} ended 10 mins ago. Please check out if you are finished.`;
                        await sendInAppNotification(io, employee._id, "Check-Out Reminder", empMsg, "Warning");

                        if (await canSendEmailToUser(employee)) {
                            await sendEmployeeCheckoutReminder(employee.email, employee.name, assignment.school.schoolName, assignment.category, context.targetTimeStr);
                        }

                        // 2. Notify Admins
                        const adminMsg = `${employee.name} hasn't checked out of ${assignment.school.schoolName} (Shift ended 10 mins ago).`;
                        for (const admin of admins) {
                            await sendInAppNotification(io, admin._id, "Overdue Check-Out", adminMsg, "System");

                            if (await canSendEmailToUser(admin)) {
                                await sendAdminCheckoutAlert(admin.email, admin.name, employee.name, assignment.school.schoolName, assignment.category, context.targetTimeStr);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Cron Job Error [Checkout Reminder]:", error);
        }
    });

    console.log("⏰ Checkout Reminder Cron Job initialized.");
};

module.exports = startCheckoutReminderCron;