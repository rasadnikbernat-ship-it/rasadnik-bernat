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
const thumbsPath = './images/gallery/thumbs';

const THUMB_SIZE = 300;

async function mapGalleryTemplate(html) {
  const [galleryItemTemplate, galleryTemplate] = await Promise.all([
    readFile(galleryItemTemplatePath, { encoding: 'utf8' }),
    readFile(galleryTemplatePath, { encoding: 'utf8' }),
    initThumbsDir(),
  ]);

  const galleryItems = [];
  const imgFileNames = await readdir(imagesDir);

  for (const fileName of imgFileNames) {
    try {
      const thumbName = `${uuidv4()}.jpg`;
      await generateImageThumbnail(
        path.join(imagesDir, fileName),
        path.join(thumbsDir, thumbName)
      );
      galleryItems.push(getImgGalleryItem(
        galleryItemTemplate,
        getImagePath(fileName),
        getThumbPath(thumbName),
        fileName
      ));
    } catch (error) {
      console.error(`Skipping image ${fileName}: ${error}`);
      // fall back to original image if thumbnail generation fails
      galleryItems.push(getImgGalleryItem(
        galleryItemTemplate,
        getImagePath(fileName),
        getImagePath(fileName),
        fileName
      ));
    }
  }

  try {
    const vidFileNames = await readdir(videosDir);
    for (const fileName of vidFileNames) {
      try {
        const thumbName = `${uuidv4()}.jpg`;
        await generateVideoThumbnail(
          path.join(videosDir, fileName),
          path.join(thumbsDir, thumbName)
        );
        galleryItems.push(getVidGalleryItem(
          galleryItemTemplate,
          getVideoPath(fileName),
          getThumbPath(thumbName),
          fileName
        ));
      } catch (error) {
        console.error(`Skipping video ${fileName}: ${error}`);
      }
    }
  } catch (error) {
    // videos directory doesn't exist — skip silently
  }

  const galleryHTML = galleryTemplate
    .replaceAll('{{items}}', galleryItems.join('\n'));
  html = html.replaceAll('{{gallery.html}}', galleryHTML);
  return html;
}

function getImgGalleryItem(template, href, thumbPath, alt) {
  return template
    .replaceAll('{{href}}', href)
    .replaceAll('{{type}}', 'image')
    .replaceAll('{{src}}', thumbPath)
    .replaceAll('{{alt}}', alt);
}

function getVidGalleryItem(template, href, thumbPath, alt) {
  return template
    .replaceAll('{{href}}', href)
    .replaceAll('{{type}}', 'video')
    .replaceAll('{{src}}', thumbPath)
    .replaceAll('{{alt}}', alt);
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
