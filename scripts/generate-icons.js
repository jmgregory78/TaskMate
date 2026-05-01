const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../src/assets/icon-preview.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  // Main app icon
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(__dirname, '../assets/icon.png'));
  console.log('✅ Generated icon.png (1024x1024)');

  // Adaptive icon for Android
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(__dirname, '../assets/adaptive-icon.png'));
  console.log('✅ Generated adaptive-icon.png (1024x1024)');

  // Splash screen icon (smaller, centered)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, '../assets/splash-icon.png'));
  console.log('✅ Generated splash-icon.png (512x512)');
}

generateIcons().catch(console.error);
