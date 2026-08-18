import { z } from 'zod';
import { Router } from 'express';
import { Task, OfficeEmployee, EmployerProfile } from '../../models/index.ts';
import { ACCOUNT_TYPES, TASK_STATUS, USER_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';
import { notifyTaskAssigned } from '../../services/notify.service.ts';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = {};

    if (req.user!.accountType === ACCOUNT_TYPES.EMPLOYER) {
      filter.employerId = req.user!.id;
    } else {
      const memberships = await OfficeEmployee.find({
        userId: req.user!.id,
        status: USER_STATUS.ACTIVE,
      }).select('_id employerId');

      const employerFilter = req.query.employerId
        ? String(req.query.employerId)
        : undefined;

      const allowed = memberships.filter(
        (m) => !employerFilter || String(m.employerId) === employerFilter,
      );
      filter.assignedToEmployeeIds = { $in: allowed.map((m) => m._id) };
      if (employerFilter) filter.employerId = employerFilter;
    }

    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      Task.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Task.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Tasks', 200, paginationMeta(total, page, limit));
  }),
);

router.post(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      title: z.string().min(2),
      titleHi: z.string().optional(),
      description: z.string().optional(),
      descriptionHi: z.string().optional(),
      assignedToEmployeeIds: z.array(z.string()).min(1),
      siteId: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      dueDate: z.coerce.date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const profile = await EmployerProfile.findOne({ userId: req.user!.id });
    if (!profile) throw Errors.forbidden('Employer profile required');

    const employees = await OfficeEmployee.find({
      _id: { $in: req.body.assignedToEmployeeIds },
      employerId: req.user!.id,
      status: USER_STATUS.ACTIVE,
    });
    if (employees.length !== req.body.assignedToEmployeeIds.length) {
      throw Errors.badRequest('One or more employees invalid');
    }

    const task = await Task.create({
      employerId: req.user!.id,
      employerProfileId: profile._id,
      title: req.body.title,
      titleHi: req.body.titleHi,
      description: req.body.description,
      descriptionHi: req.body.descriptionHi,
      assignedToEmployeeIds: req.body.assignedToEmployeeIds,
      assignedBy: req.user!.id,
      siteId: req.body.siteId,
      priority: req.body.priority ?? 'medium',
      dueDate: req.body.dueDate,
      status: TASK_STATUS.TODO,
    });

    void notifyTaskAssigned({
      employeeUserIds: employees.map((e) => String(e.userId)),
      taskTitle: task.title,
    });

    sendCreated(res, task, 'Task created');
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  validate(
    z.object({
      title: z.string().optional(),
      titleHi: z.string().optional(),
      description: z.string().optional(),
      descriptionHi: z.string().optional(),
      assignedToEmployeeIds: z.array(z.string()).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(Object.values(TASK_STATUS) as [string, ...string[]]).optional(),
      dueDate: z.coerce.date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw Errors.notFound('Task not found');

    if (req.user!.accountType === ACCOUNT_TYPES.EMPLOYER) {
      if (String(task.employerId) !== req.user!.id) throw Errors.forbidden();
      Object.assign(task, req.body);
    } else {
      const membership = await OfficeEmployee.findOne({
        userId: req.user!.id,
        employerId: task.employerId,
        status: USER_STATUS.ACTIVE,
      });
      if (!membership || !task.assignedToEmployeeIds.some((id) => String(id) === String(membership._id))) {
        throw Errors.forbidden();
      }
      // Employees can only update status
      if (req.body.status) task.status = req.body.status;
    }

    if (task.status === TASK_STATUS.DONE && !task.completedAt) {
      task.completedAt = new Date();
    }
    await task.save();
    sendSuccess(res, task, 'Task updated');
  }),
);

export default router;
