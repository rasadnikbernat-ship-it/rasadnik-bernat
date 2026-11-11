const { readFile, readdir, rm, mkdir } = require('node:fs/promises');
const { spawn } = require('child_process');
const crypto = require('node:crypto');
const { readFileSync, statSync, openSync, readSync, closeSync } = require('node:fs');
const path = require('node:path');
const config = require('../../config.json');
const ffmpegPath = require('ffmpeg-static');
const { escapeHtml } = require('../common/site');

const galleryItemTemplatePath = path.join(__dirname, './templates/gallery-item.html');
const galleryTemplatePath = path.join(__dirname, './templates/gallery.html');
const imagesDir = path.join(__dirname, '../../images/gallery/images');
const videosDir = path.join(__dirname, '../../images/gallery/videos');
const thumbsDir = path.join(__dirname, '../../images/gallery/thumbs');
const imagesPath = './images/gallery/images';
const videosPath = './images/gallery/videos';
const thumbsPath = './images/gallery/thumbs';

const THUMB_SIZE = 300;

// Ime thumbnaila = hash izvorne datoteke + veličine (isti ulaz -> isto ime, bez nepotrebnih promjena u gitu;
// promijenjena slika -> novo ime -> preglednik ne koristi staru iz cachea).
// Za velike datoteke (videi) hashira se samo početak + veličina, da build ne učitava stotine MB u memoriju.
const HASH_FULL_LIMIT = 16 * 1024 * 1024;
function thumbNameFor(filePath) {
  const h = crypto.createHash('sha1');
  const size = statSync(filePath).size;
  if (size <= HASH_FULL_LIMIT) {
    h.update(readFileSync(filePath));
  } else {
    const fd = openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(HASH_FULL_LIMIT);
      const n = readSync(fd, buf, 0, HASH_FULL_LIMIT, 0);
      h.update(buf.subarray(0, n));
    } finally { closeSync(fd); }
  }
  h.update(`:${size}:${THUMB_SIZE}`);
  return `${h.digest('hex').slice(0, 16)}.jpg`;
}

async function mapGalleryTemplate(html) {
  const [galleryItemTemplate, galleryTemplate] = await Promise.all([
    readFile(galleryItemTemplatePath, { encoding: 'utf8' }),
    readFile(galleryTemplatePath, { encoding: 'utf8' }),
    initThumbsDir(),
  ]);

  const galleryEntries = []; // { name, html } — slike pa videi, zatim se slaže po redoslijedu iz editora
  const imgFileNames = (await readdir(imagesDir)).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));

  for (const fileName of imgFileNames) {
    try {
      const thumbName = thumbNameFor(path.join(imagesDir, fileName));
      await generateImageThumbnail(
        path.join(imagesDir, fileName),
        path.join(thumbsDir, thumbName)
      );
      galleryEntries.push({ name: fileName, html: getImgGalleryItem(
        galleryItemTemplate,
        getImagePath(fileName),
        getThumbPath(thumbName),
        fileName
      ) });
    } catch (error) {
      console.error(`Skipping image ${fileName}: ${error}`);
      // fall back to original image if thumbnail generation fails
      galleryEntries.push({ name: fileName, html: getImgGalleryItem(
        galleryItemTemplate,
        getImagePath(fileName),
        getImagePath(fileName),
        fileName
      ) });
    }
  }

  try {
    const vidFileNames = await readdir(videosDir);
    for (const fileName of vidFileNames.filter((f) => /\.(mp4|webm)$/i.test(f))) {
      try {
        const thumbName = thumbNameFor(path.join(videosDir, fileName));
        await generateVideoThumbnail(
          path.join(videosDir, fileName),
          path.join(thumbsDir, thumbName)
        );
        galleryEntries.push({ name: fileName, html: getVidGalleryItem(
          galleryItemTemplate,
          getVideoPath(fileName),
          getThumbPath(thumbName),
          fileName
        ) });
      } catch (error) {
        console.error(`Skipping video ${fileName}: ${error}`);
      }
    }
  } catch (error) {
    // videos directory doesn't exist — skip silently
  }

  const galleryHTML = galleryTemplate
    .replaceAll('{{items}}', () => orderEntries(galleryEntries, (config.site || {}).galleryOrder).map((e) => e.html).join('\n'));
  html = html.replaceAll('{{gallery.html}}', () => galleryHTML);
  return html;
}

// Redoslijed iz editora (site.galleryOrder); neuvršteni zadržavaju izvorni slijed (slike pa videi) na kraju.
function orderEntries(entries, order) {
  const ord = Array.isArray(order) ? order : [];
  const rank = (e) => { const i = ord.indexOf(e.name); return i === -1 ? Infinity : i; };
  return entries
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) => {
      const ra = rank(a.e), rb = rank(b.e);
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
      return a.idx - b.idx;
    })
    .map((x) => x.e);
}

function getImgGalleryItem(template, href, thumbPath, alt) {
  return template
    .replaceAll('{{href}}', () => escapeHtml(href))
    .replaceAll('{{type}}', () => 'image')
    .replaceAll('{{src}}', () => escapeHtml(thumbPath))
    .replaceAll('{{alt}}', () => escapeHtml(alt));
}

function getVidGalleryItem(template, href, thumbPath, alt) {
  return template
    .replaceAll('{{href}}', () => escapeHtml(href))
    .replaceAll('{{type}}', () => 'video')
    .replaceAll('{{src}}', () => escapeHtml(thumbPath))
    .replaceAll('{{alt}}', () => escapeHtml(alt));
}

function getImagePath(fileName) {
  return `${imagesPath}/${fileName}`;
}

function getThumbPath(thumbName) {
  return `${thumbsPath}/${thumbName}`;
}

function getVideoPath(fileName) {
  return `${videosPath}/${fileName}`;
}

function generateImageThumbnail(input, output) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-i', input,
      '-vf', `scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
      '-q:v', '5',
      '-y',
      output
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

function generateVideoThumbnail(video, output) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-i', video,
      '-ss', '1',
      '-vframes', '1',
      '-vf', `scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
      '-q:v', '5',
      '-y',
      output
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

async function initThumbsDir() {
  try {
    await rm(thumbsDir, { recursive: true, force: true });
    await mkdir(thumbsDir);
  } catch (err) {
    console.error('Init thumbsDir failed:', err);
    throw err;
  }
}

module.exports = {
  mapGalleryTemplate
};
