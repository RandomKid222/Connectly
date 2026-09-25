const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

if (process.env.NODE_ENV === 'production' &&
    (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
  throw new Error('Cloudinary credentials are required in production');
}
const remote = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (remote) cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Unsupported image type'), { status: 400 }));
  }
});

async function saveImage(bytes) {
  let normalized;
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error', animated: false });
    const meta = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw new Error('Unsupported image format');
    normalized = await source.rotate().resize({ width: 1600, height: 1600,
      fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch (_) {
    throw Object.assign(new Error('Invalid image'), { status: 400 });
  }
  if (remote) {
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'connectly',
          resource_type: 'image', format: 'webp' }, (err, value) => err ? reject(err) : resolve(value));
        stream.end(normalized);
      });
    } catch (err) {
      console.error('Cloudinary image upload failed:', err);
      throw Object.assign(new Error('Image storage unavailable'), {
        status: 502, publicMessage: 'Image upload is temporarily unavailable.'
      });
    }
    return { url: result.secure_url, publicId: result.public_id };
  }
  const filename = `${crypto.randomUUID()}.webp`;
  await fs.writeFile(path.join(__dirname, 'uploads', filename), normalized);
  return { url: `/uploads/${filename}`, publicId: '' };
}

async function deleteImage(url, publicId) {
  if (publicId && remote) return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  if (url?.startsWith('/uploads/')) {
    await fs.unlink(path.join(__dirname, 'uploads', path.basename(url))).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
}
module.exports = { upload, saveImage, deleteImage };
