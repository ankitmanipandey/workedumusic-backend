const getHolidayAlertTemplate = (recipientName, actionType, title, schoolName, category, fromDate, toDate, actionAdminName = null) => {
    // actionType: 'Scheduled', 'Updated', or 'Cancelled'
    let badgeColor, badgeBg, badgeBorder, cardBorder;

    if (actionType === 'Scheduled') {
        badgeColor = '#059669'; badgeBg = '#ecfdf5'; badgeBorder = '#a7f3d0'; cardBorder = '#10b981';
    } else if (actionType === 'Updated') {
        badgeColor = '#d97706'; badgeBg = '#fffbeb'; badgeBorder = '#fde68a'; cardBorder = '#f59e0b';
    } else {
        badgeColor = '#dc2626'; badgeBg = '#fef2f2'; badgeBorder = '#fecaca'; cardBorder = '#ef4444';
    }

    return `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid ${cardBorder}; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: ${cardBorder} !important; }
        .badge { background: transparent !important; color: ${badgeColor} !important; border-color: ${cardBorder} !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Holiday ${actionType}</div>
    <h2>School Holiday Notice</h2><p>Hello ${recipientName},</p><p>A school holiday record has been <strong>${actionType.toLowerCase()}</strong> in the system.</p>
    <div class="card">
        <div class="card-item"><span class="label">Holiday Title</span><div class="value">${title}</div></div>
        <div class="card-item"><span class="label">School(s) Affected</span><div class="value">${schoolName}</div></div>
        <div class="card-item"><span class="label">Target Category</span><div class="value">${category}</div></div>
        <div class="card-item"><span class="label">Date Range</span><div class="value" ${actionType === 'Cancelled' ? 'style="text-decoration: line-through; color: #71717a;"' : ''}>📅 ${fromDate} to ${toDate}</div></div>
        ${actionAdminName ? `<div class="card-item"><span class="label">Action By (Admin Audit)</span><div class="value" style="color: #6366f1;">${actionAdminName}</div></div>` : ''}
    </div>
    <p style="margin-top: 24px;">This is an automated system notification. No further action is required.</p>
    </div></body></html>
    `;
};

module.exports = { getHolidayAlertTemplate };