import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import leadsRoutes from '../modules/leads/leads.routes.js';
import categoriesRoutes from '../modules/categories/categories.routes.js';
import jobsRoutes from '../modules/jobs/jobs.routes.js';
import sitesRoutes from '../modules/office/sites.routes.js';
import employeesRoutes from '../modules/office/employees.routes.js';
import tasksRoutes from '../modules/office/tasks.routes.js';
import expenditureRoutes from '../modules/office/expenditure.routes.js';
import attendanceRoutes from '../modules/office/attendance.routes.js';
import salaryRoutes from '../modules/office/salary.routes.js';
import trackingRoutes from '../modules/office/tracking.routes.js';
import dashboardRoutes from '../modules/office/dashboard.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import cmsRoutes from '../modules/cms/cms.routes.js';
import subscriptionsRoutes from '../modules/subscriptions/subscriptions.routes.js';
import notificationsRoutes from '../modules/notifications/notifications.routes.js';
import uploadsRoutes from '../modules/uploads/uploads.routes.js';
import profileRoutes from '../modules/profile/profile.routes.js';

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
