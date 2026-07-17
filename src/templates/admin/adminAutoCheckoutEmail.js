const getAdminAutoCheckoutEmail = (adminName, employeeName, schoolName, category, scheduledEndTime, actualCheckoutTime) => {
    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #f59e0b; }
        .card-item { margin-bottom: 16px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; }
        .value { font-weight: 600; color: #18181b; font-size: 15px; display: block; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #f59e0b !important; }
            .badge { background: #374151 !important; color: #d1d5db !important; border-color: #4b5563 !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">System Audit</div>
        <h2>Force Check-Out Executed</h2>
        <p>Hello ${adminName},</p>
        <p>The automated protocol has force-closed an open shift. <strong>${employeeName}</strong> remained checked-in past their scheduled end time and missed the 10-minute warning.</p>
        <div class="card">
            <div class="card-item"><span class="label">Employee</span><div class="value">${employeeName}</div></div>
            <div class="card-item"><span class="label">Location</span><div class="value">${schoolName} (${category})</div></div>
            <div class="card-item"><span class="label">Scheduled End</span><div class="value">${scheduledEndTime}</div></div>
            <div class="card-item"><span class="label">System Check-Out</span><div class="value">${actualCheckoutTime}</div></div>
        </div>
        </div></body></html>
    `;
};
module.exports = getAdminAutoCheckoutEmail