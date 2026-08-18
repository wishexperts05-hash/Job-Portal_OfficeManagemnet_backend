import { z } from 'zod';
import { Router } from 'express';
import {
  OfficeEmployee,
  EmployerProfile,
  User,
} from '../../models/index.js';
import { ACCOUNT_TYPES, USER_STATUS } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.js';
import { Errors } from '../../utils/ApiError.js';
import { normalizeMobile, isValidIndianMobile } from '../../utils/mobile.js';
import { getPagination, paginationMeta } from '../../utils/pagination.js';
import { notifyEmployeeAdded } from '../../services/notify.service.js';

const router = Router();
const aadhaarRegex = /^\d{12}$/;

router.get(
  '/my-companies',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const memberships = await OfficeEmployee.find({
      userId: req.user!.id,
      status: USER_STATUS.ACTIVE,
    })
      .populate('employerProfileId', 'companyName companyNameHi logoUrl city')
      .lean();
    sendSuccess(res, memberships, 'Companies');
  }),
);

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = { employerId: req.user!.id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      filter.fullName = new RegExp(String(req.query.q), 'i');
    }

    const [items, total] = await Promise.all([
      OfficeEmployee.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      OfficeEmployee.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Employees', 200, paginationMeta(total, page, limit));
  }),
);

router.post(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      mobile: z.string().min(10),
      fullName: z.string().min(2),
      fullNameHi: z.string().optional(),
      employeeCode: z.string().optional(),
      email: z.string().email().optional(),
      alternateMobile: z.string().optional(),
      aadhaarNumber: z.string().optional(),
      dob: z.coerce.date().optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      maritalStatus: z.enum(['single', 'married', 'other']).optional(),
      designation: z.string().optional(),
      department: z.string().optional(),
      qualification: z.string().optional(),
      joiningDate: z.coerce.date().optional(),
      addressLine1: z.string().optional(),
      addressLine2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
      emergencyContactName: z.string().optional(),
      emergencyContactMobile: z.string().optional(),
      baseSalary: z.number().min(0).optional(),
      salaryCycle: z.enum(['monthly', 'daily', 'weekly']).optional(),
      primarySiteId: z.string().optional(),
      locationTrackingEnabled: z.boolean().optional(),
      canManageExpenditure: z.boolean().optional(),
      preferredLocale: z.enum(['en', 'hi']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const mobile = normalizeMobile(req.body.mobile);
    if (!isValidIndianMobile(mobile)) throw Errors.badRequest('Invalid mobile');
    const alternateMobile = req.body.alternateMobile
      ? normalizeMobile(req.body.alternateMobile)
      : undefined;
    if (alternateMobile && !isValidIndianMobile(alternateMobile)) {
      throw Errors.badRequest('Invalid alternate mobile');
    }
    const emergencyContactMobile = req.body.emergencyContactMobile
      ? normalizeMobile(req.body.emergencyContactMobile)
      : undefined;
    if (emergencyContactMobile && !isValidIndianMobile(emergencyContactMobile)) {
      throw Errors.badRequest('Invalid emergency contact mobile');
    }
    const aadhaarNumber = req.body.aadhaarNumber?.replace(/\D/g, '');
    if (aadhaarNumber && !aadhaarRegex.test(aadhaarNumber)) {
      throw Errors.badRequest('Aadhaar must be 12 digits');
    }

    const profile = await EmployerProfile.findOne({ userId: req.user!.id });
    if (!profile) throw Errors.forbidden('Employer profile required');

    const exists = await OfficeEmployee.findOne({ employerId: req.user!.id, mobile });
    if (exists) throw Errors.conflict('Employee already added for this company');
    if (aadhaarNumber) {
      const aadhaarExists = await OfficeEmployee.findOne({
        employerId: req.user!.id,
        aadhaarNumber,
      });
      if (aadhaarExists) throw Errors.conflict('Aadhaar already linked to another employee');
    }

    let user = await User.findOne({
      mobile,
      accountType: ACCOUNT_TYPES.OFFICE_EMPLOYEE,
    });

    if (!user) {
      user = await User.create({
        accountType: ACCOUNT_TYPES.OFFICE_EMPLOYEE,
        mobile,
        status: USER_STATUS.ACTIVE,
        preferredLocale: req.body.preferredLocale ?? 'en',
      });
    } else if (user.status === USER_STATUS.SUSPENDED) {
      throw Errors.forbidden('This employee account is suspended');
    }

    const employee = await OfficeEmployee.create({
      employerId: req.user!.id,
      employerProfileId: profile._id,
      userId: user._id,
      mobile,
      fullName: req.body.fullName,
      fullNameHi: req.body.fullNameHi,
      employeeCode: req.body.employeeCode,
      email: req.body.email,
      alternateMobile,
      aadhaarNumber,
      dob: req.body.dob,
      gender: req.body.gender,
      maritalStatus: req.body.maritalStatus,
      designation: req.body.designation,
      department: req.body.department,
      qualification: req.body.qualification,
      joiningDate: req.body.joiningDate,
      addressLine1: req.body.addressLine1,
      addressLine2: req.body.addressLine2,
      city: req.body.city,
      state: req.body.state,
      pincode: req.body.pincode,
      emergencyContactName: req.body.emergencyContactName,
      emergencyContactMobile,
      baseSalary: req.body.baseSalary ?? 0,
      salaryCycle: req.body.salaryCycle ?? 'monthly',
      primarySiteId: req.body.primarySiteId,
      locationTrackingEnabled: req.body.locationTrackingEnabled ?? false,
      canManageExpenditure: req.body.canManageExpenditure ?? false,
      status: USER_STATUS.ACTIVE,
    });

    void notifyEmployeeAdded({
      employeeUserId: String(user._id),
      companyName: profile.companyName,
    });

    sendCreated(res, employee, 'Employee added');
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      fullName: z.string().optional(),
      fullNameHi: z.string().optional(),
      employeeCode: z.string().optional(),
      email: z.string().email().optional(),
      alternateMobile: z.string().optional(),
      aadhaarNumber: z.string().optional(),
      dob: z.coerce.date().optional().nullable(),
      gender: z.enum(['male', 'female', 'other']).optional().nullable(),
      maritalStatus: z.enum(['single', 'married', 'other']).optional().nullable(),
      designation: z.string().optional(),
      department: z.string().optional(),
      qualification: z.string().optional(),
      joiningDate: z.coerce.date().optional(),
      addressLine1: z.string().optional(),
      addressLine2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
      emergencyContactName: z.string().optional(),
      emergencyContactMobile: z.string().optional(),
      baseSalary: z.number().min(0).optional(),
      salaryCycle: z.enum(['monthly', 'daily', 'weekly']).optional(),
      primarySiteId: z.string().optional().nullable(),
      locationTrackingEnabled: z.boolean().optional(),
      canManageExpenditure: z.boolean().optional(),
      status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE]).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const employee = await OfficeEmployee.findOne({
      _id: req.params.id,
      employerId: req.user!.id,
    });
    if (!employee) throw Errors.notFound('Employee not found');

    const patch: Record<string, unknown> = { ...req.body };
    if (req.body.alternateMobile !== undefined) {
      if (!req.body.alternateMobile) {
        patch.alternateMobile = undefined;
      } else {
        const parsed = normalizeMobile(req.body.alternateMobile);
        if (!isValidIndianMobile(parsed)) throw Errors.badRequest('Invalid alternate mobile');
        patch.alternateMobile = parsed;
      }
    }
    if (req.body.emergencyContactMobile !== undefined) {
      if (!req.body.emergencyContactMobile) {
        patch.emergencyContactMobile = undefined;
      } else {
        const parsed = normalizeMobile(req.body.emergencyContactMobile);
        if (!isValidIndianMobile(parsed)) throw Errors.badRequest('Invalid emergency contact mobile');
        patch.emergencyContactMobile = parsed;
      }
    }
    if (req.body.aadhaarNumber !== undefined) {
      if (!req.body.aadhaarNumber) {
        patch.aadhaarNumber = undefined;
      } else {
        const parsed = req.body.aadhaarNumber.replace(/\D/g, '');
        if (!aadhaarRegex.test(parsed)) throw Errors.badRequest('Aadhaar must be 12 digits');
        const aadhaarExists = await OfficeEmployee.findOne({
          employerId: req.user!.id,
          aadhaarNumber: parsed,
          _id: { $ne: employee._id },
        });
        if (aadhaarExists) throw Errors.conflict('Aadhaar already linked to another employee');
        patch.aadhaarNumber = parsed;
      }
    }
    Object.assign(employee, patch);
    if (req.body.status === USER_STATUS.INACTIVE) {
      employee.deactivatedAt = new Date();
    }
    await employee.save();
    sendSuccess(res, employee, 'Employee updated');
  }),
);

export default router;
