const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const SchoolHoliday = require('../models/SchoolHoliday');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');
const {
    sendEmployeeAutoCheckoutAlert,
    sendAdminAutoCheckoutAlert
} = require('../utils/emailService');
const { getISTDateString } = require('../utils/timeHelper');

const getTimeAndDateContext = (minutesToSubtract = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - minutesToSubtract);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const dateString = dateFormatter.format(d);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata', weekday: 'short'
    });
    const currentDayName = dayFormatter.format(d);

    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(d);

    const hour = parts.find(p => p.type === 'hour')?.value?.padStart(2, '0') || '00';
    const minute = parts.find(p => p.type === 'minute')?.value?.padStart(2, '0') || '00';
    const targetTimeStr = `${hour}:${minute}`;

    const dPrev = new Date(d);
    dPrev.setDate(dPrev.getDate() - 1);
    const prevDateString = dateFormatter.format(dPrev);
    const prevDayName = dayFormatter.format(dPrev);

    return { dateString, currentDayName, targetTimeStr, targetDateObj: d, prevDateString, prevDayName };
};

const sendInAppNotification = async (io, userId, title, message, type) => {
    const notif = await Notification.create({ recipient: userId, title, message, type });
    if (io) {
        io.to(userId.toString()).emit('new_notification', {
            _id: notif._id, title: notif.title, message: notif.message,
            type: notif.type, timestamp: new Date()
        });
    }
};

const startAutoCheckoutCron = (io) => {
    cron.schedule('* * * * *', async () => {
        try {
            const context = getTimeAndDateContext(30);

            const currentISTDate = context.dateString;
            const todayStart = new Date(`${currentISTDate}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${currentISTDate}T23:59:59.999+05:30`);

            const activeLeaves = await LeaveRequest.find({
                status: 'approved',
                fromDate: { $lte: todayEnd },
                toDate: { $gte: todayStart }
            });
            const usersOnLeaveSet = new Set(activeLeaves.map(l => l.employee.toString()));

            const activeHolidays = await SchoolHoliday.find({
                startDate: { $lte: todayEnd },
                endDate: { $gte: todayEnd }
            });

            const overdueEmployees = await User.find({
                role: 'Employee',
                isActive: true,
                assignments: {
                    $elemMatch: {
                        allowedDays: { $in: [context.currentDayName, context.prevDayName] },
                        endTime: context.targetTimeStr
                    }
                }
            }).populate('assignments.school');

            if (overdueEmployees.length === 0) return;

            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });
            const currentCheckoutTimeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });

            for (const employee of overdueEmployees) {
                if (usersOnLeaveSet.has(employee._id.toString())) continue;

                const endedAssignments = employee.assignments.filter(a => {
                    if (a.endTime !== context.targetTimeStr) return false;

                    const isOvernightShift = a.startTime > a.endTime;
                    const relevantDayName = isOvernightShift ? context.prevDayName : context.currentDayName;
                    const relevantDateStr = isOvernightShift ? context.prevDateString : context.dateString;

                    if (!a.allowedDays.includes(relevantDayName)) return false;

                    const assignmentStartDate = a.startDate ? new Date(a.startDate) : a._id.getTimestamp();
                    const assignStartStr = getISTDateString(assignmentStartDate);

                    const startCheckDate = isOvernightShift ? currentISTDate : relevantDateStr;
                    const isAfterStartDate = startCheckDate >= assignStartStr;

                    let isBeforeEndDate = true;
                    if (a.endDate) {
                        const assignEndStr = getISTDateString(new Date(a.endDate));
                        isBeforeEndDate = relevantDateStr <= assignEndStr;
                    }

                    const isHoliday = activeHolidays.some(h => {
                        const isSchoolMatch = h.affectedSchools.some(id => id.toString() === a.school._id.toString());
                        const hCat = (h.category || "").trim().toLowerCase();
                        const aCat = (a.category || "").trim().toLowerCase();
                        const isCategoryMatch = hCat === aCat || hCat === "all" || hCat === "";
                        const isExcluded = h.excludedAssignments?.some(exId => exId.toString() === a._id.toString());
                        return isSchoolMatch && isCategoryMatch && !isExcluded;
                    });

                    if (isHoliday) return false;
                    return isAfterStartDate && isBeforeEndDate;
                });

                for (const assignment of endedAssignments) {
                    const isOvernightShift = assignment.startTime > assignment.endTime;
                    const attendanceDateStr = isOvernightShift ? context.prevDateString : context.dateString;

                    const attendanceRecord = await Attendance.findOne({
                        teacher: employee._id,
                        school: assignment.school._id,
                        band: assignment.category,
                        date: attendanceDateStr
                    });

                    if (!attendanceRecord) continue;
                    if (attendanceRecord.checkOutTime) continue;
                    if (!['Present', 'Late'].includes(attendanceRecord.status)) continue;

                    attendanceRecord.checkOutTime = new Date();
                    attendanceRecord.overtimeReason = "System Auto-Checkout";
                    await attendanceRecord.save();

                    const empMsg = `System Auto-Checkout: Your shift at ${assignment.school.schoolName} was closed automatically.`;
                    await sendInAppNotification(io, employee._id, "Auto Check-Out", empMsg, "System");

                    if (await canSendEmailToUser(employee)) {
                        await sendEmployeeAutoCheckoutAlert(
                            employee.email, employee.name,
                            assignment.school.schoolName, assignment.category,
                            context.targetTimeStr, currentCheckoutTimeStr
                        );
                    }

                    const adminMsg = `Auto-Checkout: ${employee.name} was force-closed from ${assignment.school.schoolName}.`;
                    for (const admin of admins) {
                        await sendInAppNotification(io, admin._id, "System Check-Out Audit", adminMsg, "System");
                        if (await canSendEmailToUser(admin)) {
                            await sendAdminAutoCheckoutAlert(
                                admin.email, admin.name, employee.name,
                                assignment.school.schoolName, assignment.category,
                                context.targetTimeStr, currentCheckoutTimeStr
                            );
                        }
                    }

                    if (io) io.emit("operations_update", { type: "refresh_feed" });
                }
            }

        } catch (error) {
            console.error("[CRON ERROR]:", error);
        }
    });

    console.log("⏰ Auto-Checkout Cron initialized (30 min delay).");
};

module.exports = startAutoCheckoutCron;