const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const { AGENT_DIR, getScriptPath } = require('./config');
const { Logger } = require('./logger');

const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

const PAPER_SIZES = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  a2: [1190.55, 1683.78],
  a1: [1683.78, 2383.94],
  letter: [612.0, 792.0],
  legal: [612.0, 1008.0]
};

function getPaperDimensions(size) {
  return PAPER_SIZES[(size || 'a4').toLowerCase()] || PAPER_SIZES.a4;
}

// BT.601 perceptual grayscale conversion using Windows GDI ColorMatrix
async function toGrayscaleJpeg(inputPath, outputPath) {
  const scriptPath = getScriptPath('convert-gray.ps1');
  return new Promise((resolve, reject) => {
    execFile(PS_EXE, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-InputPath', inputPath,
      '-OutputPath', outputPath
    ], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

// Universal image converter to standard JPEG for any unusual phone format
async function convertAnyImageToJpeg(buf) {
  const tmpIn = path.join(AGENT_DIR, `conv_in_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
  const tmpOut = path.join(AGENT_DIR, `conv_out_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    fs.writeFileSync(tmpIn, buf);
    const scriptPath = getScriptPath('convert-gray.ps1');
    await new Promise((resolve, reject) => {
      execFile(PS_EXE, [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-InputPath', tmpIn,
        '-OutputPath', tmpOut
      ], { windowsHide: true, timeout: 20000 }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
      return fs.readFileSync(tmpOut);
    }
  } catch (e) {
    Logger.warn('[imgToPdf]', 'ConvertAny fallback:', e.message);
  } finally {
    try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch (_) {}
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (_) {}
  }
  return buf;
}

// Bulletproof Image to PDF Converter
async function imgToPdf(buf, originalName, size, colorMode) {
  let imgBuf = buf;

  // When BW mode is selected, convert image (JPG, PNG, WebP) to 
  // high-definition BT.601 perceptual grayscale so photos, skin tones, and midtones
  // print with full photographic depth and realistic shading!
  if (colorMode === 'bw') {
    const rawTmp = path.join(AGENT_DIR, `raw_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
    const grayTmp = path.join(AGENT_DIR, `gray_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    try {
      fs.writeFileSync(rawTmp, buf);
      await toGrayscaleJpeg(rawTmp, grayTmp);
      if (fs.existsSync(grayTmp) && fs.statSync(grayTmp).size > 0) {
        const readBuf = fs.readFileSync(grayTmp);
        // Verify JPEG magic bytes (FF D8)
        if (readBuf.length > 2 && readBuf[0] === 0xff && readBuf[1] === 0xd8) {
          imgBuf = readBuf;
          Logger.info('[imgToPdf]', 'High-definition BT.601 perceptual grayscale applied.');
        } else {
          Logger.warn('[imgToPdf]', 'Grayscale output missing JPEG SOI header, using fallback.');
        }
      }
    } catch (e) {
      Logger.warn('[imgToPdf]', 'Grayscale conversion fallback:', e.message);
    } finally {
      try { if (fs.existsSync(rawTmp)) fs.unlinkSync(rawTmp); } catch (_) {}
      try { if (fs.existsSync(grayTmp)) fs.unlinkSync(grayTmp); } catch (_) {}
    }
  }

  const doc = await PDFDocument.create();

  // Detect image type by true magic bytes
  const isJpg = imgBuf.length > 2 && imgBuf[0] === 0xff && imgBuf[1] === 0xd8;
  const isPng = imgBuf.length > 4 && imgBuf[0] === 0x89 && imgBuf[1] === 0x50 && imgBuf[2] === 0x4e && imgBuf[3] === 0x47;

  // Pass a clean, unshared, zero-offset Uint8Array to pdf-lib (fixes Node slab offset bug)
  const cleanBytes = new Uint8Array(imgBuf.buffer.slice(imgBuf.byteOffset, imgBuf.byteOffset + imgBuf.byteLength));

  let img;
  if (isJpg) {
    img = await doc.embedJpg(cleanBytes);
  } else if (isPng) {
    img = await doc.embedPng(cleanBytes);
  } else {
    Logger.info('[imgToPdf]', `Converting unusual format (magic: ${imgBuf.slice(0, 4).toString('hex')}) to standard JPEG...`);
    const standardJpg = await convertAnyImageToJpeg(imgBuf);
    const cleanJpg = new Uint8Array(standardJpg.buffer.slice(standardJpg.byteOffset, standardJpg.byteOffset + standardJpg.byteLength));
    img = await doc.embedJpg(cleanJpg);
  }

  const [W, H] = getPaperDimensions(size);
  const pg = doc.addPage([W, H]);
  const margin = 24;
  const scale = Math.min((W - margin * 2) / img.width, (H - margin * 2) / img.height, 1);
  pg.drawImage(img, {
    x: (W - img.width * scale) / 2,
    y: (H - img.height * scale) / 2,
    width: img.width * scale,
    height: img.height * scale
  });
  return doc.save();
}

module.exports = { imgToPdf, toGrayscaleJpeg };
