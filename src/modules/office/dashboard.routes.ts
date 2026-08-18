import { Router } from 'express';
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import {
  Attendance,
  CompanySite,
  Expenditure,
  OfficeEmployee,
  Task,
} from '../../models/index.js';
import { ACCOUNT_TYPES, ATTENDANCE_STATUS, TASK_STATUS, TXN_TYPE, USER_STATUS } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const isEmployer = req.user!.accountType === ACCOUNT_TYPES.EMPLOYER;
    const employerId = isEmployer
      ? req.user!.id
      : String(req.query.employerId || '');

    if (!employerId || !mongoose.isValidObjectId(employerId)) {
      sendSuccess(
        res,
        {
          role: isEmployer ? 'employer' : 'employee',
          employees: 0,
          activeEmployees: 0,
          sites: 0,
          tasksOpen: 0,
          presentToday: 0,
          tasksByStatus: [],
          attendanceTrend: [],
          expenditure: { credit: 0, debit: 0, balance: 0 },
          myTasks: [],
        },
        'Dashboard',
      );
      return;
    }

    const today = dayjs().format('YYYY-MM-DD');
    const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

    if (!isEmployer) {
      const membership = await OfficeEmployee.findOne({
        userId: req.user!.id,
        employerId,
        status: USER_STATUS.ACTIVE,
      }).lean();

      if (!membership) {
        sendSuccess(
          res,
          {
            role: 'employee',
            tasksOpen: 0,
            myTasks: [],
            tasksByStatus: [],
            presentToday: 0,
            attendanceTrend: [],
            expenditure: { credit: 0, debit: 0, balance: 0 },
          },
          'Dashboard',
        );
        return;
      }

      const [myTasks, attendanceToday, attendanceWeek, expTotals] = await Promise.all([
        Task.find({
          employerId,
          assignedToEmployeeIds: membership._id,
        })
          .sort({ updatedAt: -1 })
          .limit(8)
          .lean(),
        Attendance.countDocuments({
          employeeId: membership._id,
          date: today,
          $or: [
            { loginAt: { $exists: true, $ne: null } },
            { status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.HALF_DAY] } },
          ],
        }),
        Attendance.aggregate([
          {
            $match: {
              employeeId: membership._id,
              date: { $gte: weekStart, $lte: today },
            },
          },
          {
            $group: {
              _id: '$date',
              present: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $ifNull: ['$loginAt', false] },
                        { $in: ['$status', [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.HALF_DAY]] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Expenditure.aggregate([
          { $match: { employeeId: membership._id, employerId: new mongoose.Types.ObjectId(employerId) } },
          { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ]),
      ]);

      const tasksByStatusMap = new Map<string, number>();
      for (const task of myTasks) {
        tasksByStatusMap.set(task.status, (tasksByStatusMap.get(task.status) || 0) + 1);
      }

      // full status counts for employee
      const statusCounts = await Task.aggregate([
        {
          $match: {
            employerId: new mongoose.Types.ObjectId(employerId),
            assignedToEmployeeIds: membership._id,
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const credit = expTotals.find((r) => r._id === TXN_TYPE.CREDIT)?.total ?? 0;
      const debit = expTotals.find((r) => r._id === TXN_TYPE.DEBIT)?.total ?? 0;

      const attendanceTrend = Array.from({ length: 7 }).map((_, i) => {
        const day = dayjs(weekStart).add(i, 'day');
        const key = day.format('YYYY-MM-DD');
        const hit = attendanceWeek.find((row) => row._id === key);
        return {
          date: key,
          label: day.format('ddd'),
          present: hit?.present ?? 0,
        };
      });

      sendSuccess(
        res,
        {
          role: 'employee',
          tasksOpen: statusCounts
            .filter((r) => r._id !== TASK_STATUS.DONE && r._id !== TASK_STATUS.CANCELLED)
            .reduce((s, r) => s + r.count, 0),
          presentToday: attendanceToday,
          tasksByStatus: statusCounts.map((r) => ({
            status: String(r._id || 'unknown'),
            count: r.count as number,
          })),
          attendanceTrend,
          expenditure: { credit, debit, balance: credit - debit },
          myTasks: myTasks.map((task) => ({
            _id: task._id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
          })),
        },
        'Dashboard',
      );
      return;
    }

    const employerObjectId = new mongoose.Types.ObjectId(employerId);

    const [
      employees,
      activeEmployees,
      sites,
      tasksByStatus,
      presentToday,
      attendanceWeek,
      expTotals,
      recentTasks,
    ] = await Promise.all([
      OfficeEmployee.countDocuments({ employerId }),
      OfficeEmployee.countDocuments({ employerId, status: USER_STATUS.ACTIVE }),
      CompanySite.countDocuments({ employerId, isActive: true }),
      Task.aggregate([
        { $match: { employerId: employerObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Attendance.countDocuments({
        employerId: employerObjectId,
        date: today,
        $or: [
          { loginAt: { $exists: true, $ne: null } },
          { status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.HALF_DAY] } },
        ],
      }),
      Attendance.aggregate([
        {
          $match: {
            employerId: employerObjectId,
            date: { $gte: weekStart, $lte: today },
          },
        },
        {
          $group: {
            _id: '$date',
            present: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $ifNull: ['$loginAt', false] },
                      { $in: ['$status', [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.HALF_DAY]] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            total: { $sum: 1 },
          },
        },
      ]),
      Expenditure.aggregate([
        {
          $match: {
            employerId: employerObjectId,
            $or: [{ employeeId: { $exists: false } }, { employeeId: null }],
          },
        },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      Task.find({ employerId })
        .sort({ updatedAt: -1 })
        .limit(6)
        .select('title status priority dueDate')
        .lean(),
    ]);

    const tasksOpen = tasksByStatus
      .filter((r) => r._id !== TASK_STATUS.DONE && r._id !== TASK_STATUS.CANCELLED)
      .reduce((s, r) => s + (r.count as number), 0);

    const credit = expTotals.find((r) => r._id === TXN_TYPE.CREDIT)?.total ?? 0;
    const debit = expTotals.find((r) => r._id === TXN_TYPE.DEBIT)?.total ?? 0;

    const attendanceTrend = Array.from({ length: 7 }).map((_, i) => {
      const day = dayjs(weekStart).add(i, 'day');
      const key = day.format('YYYY-MM-DD');
      const hit = attendanceWeek.find((row) => row._id === key);
      return {
        date: key,
        label: day.format('ddd'),
        present: hit?.present ?? 0,
        total: hit?.total ?? 0,
      };
    });

    sendSuccess(
      res,
      {
        role: 'employer',
        employees,
        activeEmployees,
        sites,
        tasksOpen,
        presentToday,
        absentHint: Math.max(0, activeEmployees - presentToday),
        tasksByStatus: tasksByStatus.map((r) => ({
          status: String(r._id || 'unknown'),
          count: r.count as number,
        })),
        attendanceTrend,
        expenditure: { credit, debit, balance: credit - debit },
        recentTasks,
        attendanceStatuses: Object.values(ATTENDANCE_STATUS),
      },
      'Dashboard',
    );
  }),
);

export default router;
