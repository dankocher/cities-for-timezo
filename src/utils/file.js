import fs from 'fs';
import path from 'path';

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createWriteStream(filePath) {
  ensureDirSync(path.dirname(filePath));
  return fs.createWriteStream(filePath, { encoding: 'utf8' });
}

export {
  ensureDirSync,
  createWriteStream,
};

