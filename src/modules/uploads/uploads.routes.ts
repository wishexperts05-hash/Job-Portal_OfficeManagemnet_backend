import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.ts';
import { upload } from '../../middlewares/upload.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess } from '../../utils/ApiResponse.ts';
import { Errors } from '../../utils/ApiError.ts';
import { cloudinary } from '../../config/cloudinary.ts';
import { env } from '../../config/env.ts';
import { Readable } from 'stream';

const router = Router();

function uploadBuffer(buffer: Buffer, folder: string, resourceType: 'image' | 'raw' | 'auto') {
  return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `textile_portal/${folder}`, resource_type: resourceType },
      (err, result) => {
        if (err || !result) {
          reject(err ?? new Error('Upload failed'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

router.post(
  '/',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!env.CLOUDINARY_CLOUD_NAME) {
      throw Errors.badRequest('Cloudinary is not configured');
    }
    if (!req.file) throw Errors.badRequest('file is required');

    const folder = typeof req.body.folder === 'string' ? req.body.folder : 'misc';
    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
    const result = await uploadBuffer(req.file.buffer, folder, resourceType);
    sendSuccess(res, result, 'Uploaded');
  }),
);

export default router;
