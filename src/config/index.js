import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEO_NAMES_BASE_URL = 'https://download.geonames.org/export/dump';

const DATASET_OPTIONS = [
  { id: '500', label: 'cities500 (population > 500)', minPopulation: 500 },
  { id: '1000', label: 'cities1000 (population > 1,000)', minPopulation: 1000 },
  { id: '5000', label: 'cities5000 (population > 5,000)', minPopulation: 5000 },
  { id: '15000', label: 'cities15000 (population > 15,000 or capitals)', minPopulation: 15000 },
];

const DEFAULT_DATASET_ID = '15000';
const OUTPUT_DIR = path.resolve(__dirname, '../../data');
const DEFAULT_COLLECTION = process.env.FIRESTORE_COLLECTION || 'cities';

const REQUIRED_FIELDS = [
  'id',
  'name',
  'country',
  'lat',
  'lon',
  'tz',
  'aliases',
  'altNames',
  'population',
];

function resolveCredentialsPath(customPath) {
  const defaultPath = path.resolve(__dirname, '../../credentials/firebase-service-account.json');
  
  const candidate =
    customPath ||
    process.env.FIREBASE_CREDENTIALS_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (fs.existsSync(defaultPath) ? defaultPath : null);

  if (!candidate) {
    throw new Error(
      'Firebase credentials path not found. Configure FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS, or place credentials at credentials/firebase-service-account.json'
    );
  }

  const resolvedPath = path.resolve(candidate);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Credentials file does not exist: ${resolvedPath}`);
  }

  return resolvedPath;
}

export {
  DATASET_OPTIONS,
  DEFAULT_DATASET_ID,
  DEFAULT_COLLECTION,
  GEO_NAMES_BASE_URL,
  OUTPUT_DIR,
  REQUIRED_FIELDS,
  resolveCredentialsPath,
};

