import multer from 'multer';
import { Errors } from '../utils/ApiError.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(Errors.badRequest('Unsupported file type'));
      return;
    }
    cb(null, true);
  },
});
