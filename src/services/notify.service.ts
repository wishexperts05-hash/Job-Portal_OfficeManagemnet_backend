import { Notification, User } from '../models/index.js';
import { ACCOUNT_TYPES, USER_STATUS } from '../constants/index.js';
import { sendEmail } from './email.service.js';
import { sendPushNotification } from './push.service.js';
import { getPlatformSettingsMap, getSettingBool } from '../utils/platformSettings.js';
import { publishUserEvent } from './realtime.service.js';

function asStringRecord(data?: Record<string, unknown>): Record<string, string> | undefined {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

type Channel = 'in_app' | 'push' | 'email' | 'sms';
type Channels = Channel[];

async function resolveChannels(requested?: Channels): Promise<Channels> {
  const settings = await getPlatformSettingsMap();
  const base = requested ?? (['in_app', 'push'] as Channels);
  return base.filter((channel) => {
    if (channel === 'in_app') return settings.notify_channel_in_app !== false;
    if (channel === 'push') return settings.notify_channel_push !== false;
    if (channel === 'email') return settings.notify_channel_email !== false;
    return true;
  });
}

export async function dispatchNotification(input: {
  userId: string;
  titleEn: string;
  titleHi: string;
  bodyEn: string;
  bodyHi: string;
  type: string;
  data?: Record<string, unknown>;
  channel?: Channels;
  emailTo?: string;
}) {
  const channels = await resolveChannels(input.channel);
  if (!channels.length) return null;

  const notification = await Notification.create({
    userId: input.userId,
    titleEn: input.titleEn,
    titleHi: input.titleHi,
    bodyEn: input.bodyEn,
    bodyHi: input.bodyHi,
    type: input.type,
    data: input.data,
    channel: channels,
    sentAt: new Date(),
  });

  const user = await User.findById(input.userId).lean();
  const locale = user?.preferredLocale === 'hi' ? 'hi' : 'en';
  const title = locale === 'hi' ? input.titleHi : input.titleEn;
  const body = locale === 'hi' ? input.bodyHi : input.bodyEn;

  if (channels.includes('push')) {
    const tokens = (user?.metadata?.fcmTokens as string[] | undefined) ?? [];
    if (tokens.length) {
      await sendPushNotification({
        tokens,
        title,
        body,
        data: asStringRecord(input.data),
      });
    }
  }

  if (channels.includes('email')) {
    const to = input.emailTo || user?.email;
    if (to) {
      await sendEmail({
        to,
        subject: title,
        text: body,
        html: `<p>${body}</p>`,
      });
    }
  }

  const unreadCount = await Notification.countDocuments({
    userId: input.userId,
    isRead: false,
  });

  publishUserEvent(String(input.userId), {
    type: 'notification',
    notification: notification.toObject(),
    unreadCount,
  });

  return notification;
}

async function safeNotify(
  enabledKey: string,
  input: Parameters<typeof dispatchNotification>[0],
): Promise<void> {
  try {
    const enabled = await getSettingBool(enabledKey, true);
    if (!enabled) return;
    await dispatchNotification(input);
  } catch (err) {
    console.error('[notify] failed', err);
  }
}

async function notifyAllAdmins(
  enabledKey: string,
  payload: Omit<Parameters<typeof dispatchNotification>[0], 'userId'>,
) {
  try {
    const enabled = await getSettingBool(enabledKey, true);
    if (!enabled) return;

    const admins = await User.find({
      accountType: ACCOUNT_TYPES.ADMIN,
      status: { $in: [USER_STATUS.ACTIVE, USER_STATUS.PENDING] },
    })
      .select('_id email')
      .lean();

    await Promise.all(
      admins.map((admin) =>
        dispatchNotification({
          ...payload,
          userId: String(admin._id),
          channel: payload.channel ?? ['in_app', 'push', 'email'],
        }),
      ),
    );
  } catch (err) {
    console.error('[notify:admins] failed', err);
  }
}

export async function notifyJobApproved(input: {
  employerUserId: string;
  jobTitle: string;
}) {
  await safeNotify('notify_employer_job_approved', {
    userId: input.employerUserId,
    type: 'job_approved',
    titleEn: 'Job published',
    titleHi: 'जॉब प्रकाशित',
    bodyEn: `Your job "${input.jobTitle}" has been approved and published.`,
    bodyHi: `आपकी जॉब "${input.jobTitle}" स्वीकृत और प्रकाशित हो गई है।`,
    data: { event: 'job_approved' },
    channel: ['in_app', 'push', 'email'],
  });
}

export async function notifyJobRejected(input: {
  employerUserId: string;
  jobTitle: string;
  reason: string;
}) {
  await safeNotify('notify_employer_job_rejected', {
    userId: input.employerUserId,
    type: 'job_rejected',
    titleEn: 'Job rejected',
    titleHi: 'जॉब अस्वीकृत',
    bodyEn: `Your job "${input.jobTitle}" was rejected. Reason: ${input.reason}`,
    bodyHi: `आपकी जॉब "${input.jobTitle}" अस्वीकृत हुई। कारण: ${input.reason}`,
    data: { event: 'job_rejected' },
    channel: ['in_app', 'push', 'email'],
  });
}

export async function notifyJobApplication(input: {
  employerUserId: string;
  jobTitle: string;
  seekerName: string;
}) {
  await safeNotify('notify_employer_new_application', {
    userId: input.employerUserId,
    type: 'job_application',
    titleEn: 'New job application',
    titleHi: 'नया जॉब आवेदन',
    bodyEn: `${input.seekerName} applied for "${input.jobTitle}".`,
    bodyHi: `${input.seekerName} ने "${input.jobTitle}" के लिए आवेदन किया।`,
    data: { event: 'job_application' },
  });
}

export async function notifyTaskAssigned(input: {
  employeeUserIds: string[];
  taskTitle: string;
}) {
  await Promise.all(
    input.employeeUserIds.map((userId) =>
      safeNotify('notify_employee_task_assigned', {
        userId,
        type: 'task_assigned',
        titleEn: 'New task assigned',
        titleHi: 'नया कार्य सौंपा गया',
        bodyEn: `You have a new task: "${input.taskTitle}".`,
        bodyHi: `आपको नया कार्य मिला: "${input.taskTitle}".`,
        data: { event: 'task_assigned' },
      }),
    ),
  );
}

export async function notifyEmployeeAdded(input: {
  employeeUserId: string;
  companyName: string;
}) {
  await safeNotify('notify_employee_added', {
    userId: input.employeeUserId,
    type: 'employee_added',
    titleEn: 'Added to office',
    titleHi: 'ऑफिस में जोड़ा गया',
    bodyEn: `You were added to ${input.companyName}. Login to Office Management with your mobile + MPIN.`,
    bodyHi: `आपको ${input.companyName} में जोड़ा गया है। मोबाइल + MPIN से ऑफिस में लॉगिन करें।`,
    data: { event: 'employee_added' },
  });
}

export async function notifySalaryUpdate(input: {
  employeeUserId: string;
  month: number;
  year: number;
  status: string;
  netAmount: number;
}) {
  await safeNotify('notify_employee_salary_update', {
    userId: input.employeeUserId,
    type: 'salary_update',
    titleEn: 'Salary update',
    titleHi: 'वेतन अपडेट',
    bodyEn: `Salary for ${input.month}/${input.year} is ${input.status}. Net: ₹${input.netAmount}.`,
    bodyHi: `${input.month}/${input.year} का वेतन ${input.status} है। नेट: ₹${input.netAmount}.`,
    data: { event: 'salary_update', status: input.status },
  });
}

export async function notifyAdminsJobPendingApproval(input: {
  jobId: string;
  jobTitle: string;
  companyName?: string;
}) {
  const company = input.companyName || 'an employer';
  await notifyAllAdmins('notify_admin_job_pending', {
    type: 'admin_job_pending',
    titleEn: 'Job awaiting approval',
    titleHi: 'जॉब अप्रूवल लंबित',
    bodyEn: `"${input.jobTitle}" from ${company} was submitted for approval.`,
    bodyHi: `${company} की जॉब "${input.jobTitle}" अप्रूवल के लिए भेजी गई है।`,
    data: {
      event: 'admin_job_pending',
      jobId: input.jobId,
      link: `/app/jobs/${input.jobId}`,
    },
    channel: ['in_app', 'push', 'email'],
  });
}

export async function notifyAdminsIncompleteLead(input: {
  leadId: string;
  mobile: string;
  accountType: string;
  progressPercent?: number;
  lastStep?: string;
}) {
  const role = input.accountType === 'employer' ? 'employer' : 'job seeker';
  const roleHi = input.accountType === 'employer' ? 'नियोक्ता' : 'जॉब सीकर';
  const progress = input.progressPercent ?? 0;
  await notifyAllAdmins('notify_admin_incomplete_lead', {
    type: 'admin_incomplete_lead',
    titleEn: 'Incomplete registration lead',
    titleHi: 'अधूरा रजिस्ट्रेशन लीड',
    bodyEn: `New incomplete ${role} signup (${input.mobile}) — ${progress}%${
      input.lastStep ? `, step: ${input.lastStep}` : ''
    }.`,
    bodyHi: `नया अधूरा ${roleHi} साइनअप (${input.mobile}) — ${progress}%${
      input.lastStep ? `, चरण: ${input.lastStep}` : ''
    }.`,
    data: {
      event: 'admin_incomplete_lead',
      leadId: input.leadId,
      link: '/app/leads',
    },
    channel: ['in_app', 'push', 'email'],
  });
}

export async function notifyAdminsLeadAbandoned(input: {
  mobile: string;
  accountType: string;
}) {
  const role = input.accountType === 'employer' ? 'employer' : 'job seeker';
  const roleHi = input.accountType === 'employer' ? 'नियोक्ता' : 'जॉब सीकर';
  await notifyAllAdmins('notify_admin_lead_abandoned', {
    type: 'admin_lead_abandoned',
    titleEn: 'Registration abandoned',
    titleHi: 'रजिस्ट्रेशन छोड़ दिया',
    bodyEn: `An incomplete ${role} registration was abandoned (${input.mobile}).`,
    bodyHi: `एक अधूरा ${roleHi} रजिस्ट्रेशन छोड़ दिया गया (${input.mobile}).`,
    data: {
      event: 'admin_lead_abandoned',
      link: '/app/leads',
      mobile: input.mobile,
    },
    channel: ['in_app', 'push', 'email'],
  });
}
