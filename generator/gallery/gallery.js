const { readFile, readdir, rm, mkdir } = require('node:fs/promises');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');

const galleryItemTemplatePath = path.join(__dirname, './templates/gallery-item.html');
const galleryTemplatePath = path.join(__dirname, './templates/gallery.html');
const imagesDir = path.join(__dirname, '../../images/gallery/images');
const videosDir = path.join(__dirname, '../../images/gallery/videos');
const thumbsDir = path.join(__dirname, '../../images/gallery/thumbs');
const imagesPath = './images/gallery/images';
const videosPath = './images/gallery/videos';
const thumbsPath = './images/gallery/thumbs'

async function mapGalleryTemplate(html) {
  const [galleryItemTemplate, galleryTemplate] = await Promise.all([
    readFile(galleryItemTemplatePath, { encoding: 'utf8' }),
    readFile(galleryTemplatePath, { encoding: 'utf8' }),
    initThumbsDir(),
  ]);
  const galleryItems = [];
  const [imgFileNames, vidFileNames] = await Promise.all([
    readdir(imagesDir),
    readdir(videosDir)
  ]);
  imgFileNames.forEach((fileName, index) => {
    galleryItems.push(getImgGalleryItem(galleryItemTemplate, getImagePath(fileName), fileName));
  });
  for (const fileName of vidFileNames) {
    try {
      const thumbName = `${uuidv4()}.jpg`;
      await generateThumbnail(path.join(videosDir, fileName), path.join(thumbsDir, thumbName));
      galleryItems.push(getVidGalleryItem(galleryItemTemplate, getVideoPath(fileName), getThumbPath(thumbName), fileName));
    } catch (error) {
      console.error(`Skiping video ${fileName}: ${error}`);
    }
  }
  const galleryHTML = galleryTemplate
    .replaceAll('{{items}}', galleryItems.join('\n'));
  html = html.replaceAll('{{gallery.html}}', galleryHTML);
  return html;
}

function getImgGalleryItem(template, imagePath, alt) {
  return template
    .replaceAll('{{href}}', imagePath)
    .replaceAll('{{type}}', 'image')
    .replaceAll('{{src}}', imagePath)
    .replaceAll('{{alt}}', alt)
}

function getVidGalleryItem(template, href, imagePath, alt) {
  return template
    .replaceAll('{{href}}', href)
    .replaceAll('{{type}}', 'video')
    .replaceAll('{{src}}', imagePath)
    .replaceAll('{{alt}}', alt)
}

function getImagePath(fileName) {
  return `${imagesPath}/${fileName}`;
}

function getThumbPath(id) {
  return `${thumbsPath}/${id}`;
}

function getVideoPath(fileName) {
  return `${videosPath}/${fileName}`;
}

function generateThumbnail(video, output) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-i', video,
      '-ss', '1',
      '-vframes', '1',
      '-q:v', '2',
      output
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('FFmpeg failed'));
    });
  });
}

async function initThumbsDir() {
  try {
    await rm(thumbsDir, { recursive: true, force: true });
    await mkdir(thumbsDir)
  } catch (err) {
    console.error('Init thumbsDir failed:', err);
    throw error;
  }
}

module.exports = {
  mapGalleryTemplate
};