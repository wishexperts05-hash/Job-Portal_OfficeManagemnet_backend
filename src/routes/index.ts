import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.ts';
import leadsRoutes from '../modules/leads/leads.routes.ts';
import categoriesRoutes from '../modules/categories/categories.routes.ts';
import jobsRoutes from '../modules/jobs/jobs.routes.ts';
import sitesRoutes from '../modules/office/sites.routes.ts';
import employeesRoutes from '../modules/office/employees.routes.ts';
import tasksRoutes from '../modules/office/tasks.routes.ts';
import expenditureRoutes from '../modules/office/expenditure.routes.ts';
import attendanceRoutes from '../modules/office/attendance.routes.ts';
import salaryRoutes from '../modules/office/salary.routes.ts';
import trackingRoutes from '../modules/office/tracking.routes.ts';
import dashboardRoutes from '../modules/office/dashboard.routes.ts';
import adminRoutes from '../modules/admin/admin.routes.ts';
import cmsRoutes from '../modules/cms/cms.routes.ts';
import subscriptionsRoutes from '../modules/subscriptions/subscriptions.routes.ts';
import notificationsRoutes from '../modules/notifications/notifications.routes.ts';
import uploadsRoutes from '../modules/uploads/uploads.routes.ts';
import profileRoutes from '../modules/profile/profile.routes.ts';
import talentRoutes from '../modules/talent/talent.routes.ts';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'OK',
    data: { service: 'textile-job-portal-api', ts: new Date().toISOString() },
  });
});

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/leads', leadsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/jobs', jobsRoutes);
router.use('/talent', talentRoutes);
router.use('/office/dashboard', dashboardRoutes);
router.use('/office/sites', sitesRoutes);
router.use('/office/employees', employeesRoutes);
router.use('/office/tasks', tasksRoutes);
router.use('/office/expenditure', expenditureRoutes);
router.use('/office/attendance', attendanceRoutes);
router.use('/office/salary', salaryRoutes);
router.use('/office/tracking', trackingRoutes);
router.use('/admin', adminRoutes);
router.use('/cms', cmsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/uploads', uploadsRoutes);

export default router;
