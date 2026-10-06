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
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, fieldSize: 24 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Unsupported image type'), { status: 400 }));
  }
});

async function saveImage(bytes, { maxDimension = 1600, folder = 'connectly', privateImage = false } = {}) {
  let normalized;
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error', animated: false });
    const meta = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw new Error('Unsupported image format');
    normalized = await source.rotate().resize({ width: maxDimension, height: maxDimension,
      fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch (_) {
    throw Object.assign(new Error('Invalid image'), { status: 400 });
  }
  if (remote) {
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder,
          resource_type: 'image', format: 'webp', type: privateImage ? 'authenticated' : 'upload',
          timeout: 30000 }, (err, value) => err ? reject(err) : resolve(value));
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
  const directory = privateImage ? 'private-uploads' : 'uploads';
  await fs.mkdir(path.join(__dirname, directory), { recursive: true });
  await fs.writeFile(path.join(__dirname, directory, filename), normalized);
  return { url: '/' + directory + '/' + filename, publicId: '' };
}

async function deleteImage(url, publicId, { privateImage = false } = {}) {
  if (publicId && remote) return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image', type: privateImage ? 'authenticated' : 'upload', invalidate: true
  });
  if (url?.startsWith('/uploads/') || url?.startsWith('/private-uploads/')) {
    const directory = url.startsWith('/private-uploads/') ? 'private-uploads' : 'uploads';
    await fs.unlink(path.join(__dirname, directory, path.basename(url))).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
}

// Only the authorized API route calls this. Signed Cloudinary URLs never reach the browser.
async function readPrivateImage(url, publicId) {
  if (publicId && remote) {
    try {
      const format = new URL(url).pathname.match(/\.(webp|png|jpe?g)$/i)?.[1]?.toLowerCase() || 'webp';
      const delivery = cloudinary.url(publicId, {
        resource_type: 'image', type: 'authenticated', format, sign_url: true, secure: true
      });
      const response = await fetch(delivery, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error('Cloudinary returned HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Stored image is too large');
      if (format !== 'webp') {
        return await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error', animated: false })
          .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 }).toBuffer();
      }
      return bytes;
    } catch (error) {
      console.error('Private image delivery failed:', error.message);
      throw Object.assign(new Error('Image unavailable'), {
        status: 502, publicMessage: 'This image is temporarily unavailable. Try again shortly.'
      });
    }
  }
  const name = path.basename(url || '');
  if (!url?.startsWith('/private-uploads/') || !/^[a-f0-9-]+\.webp$/.test(name)) {
    throw Object.assign(new Error('Image not found'), { status: 404, publicMessage: 'Image not found' });
  }
  try {
    return await fs.readFile(path.join(__dirname, 'private-uploads', name));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Object.assign(new Error('Image not found'), { status: 404, publicMessage: 'Image not found' });
    }
    throw error;
  }
}
async function protectExistingImage(url, publicId) {
  if (remote) {
    try {
      if (!publicId) {
        const parsed = new URL(url);
        const prefix = '/' + process.env.CLOUDINARY_CLOUD_NAME + '/image/upload/';
        if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.startsWith(prefix)) {
          throw new Error('Unrecognized older photo');
        }
        publicId = decodeURIComponent(parsed.pathname.slice(prefix.length).replace(/^v\d+\//, '').replace(/\.[a-z0-9]+$/i, ''));
      }
      const image = await cloudinary.uploader.rename(publicId, publicId, {
        resource_type: 'image', type: 'upload', to_type: 'authenticated', invalidate: true
      });
      return { url: image.secure_url, publicId: image.public_id };
    } catch (error) {
      console.error('Older photo protection failed:', error.message);
      throw Object.assign(new Error('Photo protection unavailable'), {
        status: 502, publicMessage: 'Could not protect an older photo. Please retry before making your profile private.'
      });
    }
  }
  if (!url?.startsWith('/uploads/')) throw Object.assign(new Error('Invalid stored photo'), { status: 400 });
  return saveImage(await fs.readFile(path.join(__dirname, 'uploads', path.basename(url))), { privateImage: true, folder: 'connectly/posts' });
}
module.exports = { upload, saveImage, deleteImage, readPrivateImage, protectExistingImage };
