import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Available fields for indexing
export const INDEXABLE_FIELDS = [
  { field: 'name', type: 'string', description: 'City name' },
  { field: 'country', type: 'string', description: 'ISO country code (e.g., US, MX, ES)' },
  { field: 'population', type: 'number', description: 'Population count' },
  { field: 'tz', type: 'string', description: 'Timezone identifier' },
  { field: 'lat', type: 'number', description: 'Latitude' },
  { field: 'lon', type: 'number', description: 'Longitude' },
];

// Common index combinations for typical queries
export const COMMON_INDEX_PRESETS = [
  {
    name: 'Search by country and population',
    fields: ['country', 'population'],
    description: 'Query cities by country, sorted by population',
  },
  {
    name: 'Search by country and name',
    fields: ['country', 'name'],
    description: 'Query cities by country, sorted by name',
  },
  {
    name: 'Search by timezone',
    fields: ['tz'],
    description: 'Query cities by timezone',
  },
  {
    name: 'Geographic queries',
    fields: ['lat', 'lon'],
    description: 'Query cities by geographic coordinates',
  },
  {
    name: 'Country and timezone',
    fields: ['country', 'tz'],
    description: 'Query cities by country and timezone',
  },
];

function generateIndexConfig(collection, selectedFields) {
  const indexes = [];

  // Single field indexes
  selectedFields.forEach((field) => {
    indexes.push({
      collectionGroup: collection,
      queryScope: 'COLLECTION',
      fields: [
        {
          fieldPath: field,
          order: 'ASCENDING',
        },
      ],
    });
  });

  // Common combinations (if both fields are selected)
  const fieldSet = new Set(selectedFields);
  
  COMMON_INDEX_PRESETS.forEach((preset) => {
    if (preset.fields.every((f) => fieldSet.has(f))) {
      indexes.push({
        collectionGroup: collection,
        queryScope: 'COLLECTION',
        fields: preset.fields.map((field) => ({
          fieldPath: field,
          order: 'ASCENDING',
        })),
      });
    }
  });

  return {
    indexes,
    fieldOverrides: [],
  };
}

export async function generateFirestoreIndexesFile(collection, selectedFields, outputPath) {
  const config = generateIndexConfig(collection, selectedFields);
  const jsonContent = JSON.stringify(config, null, 2);
  
  fs.writeFileSync(outputPath, jsonContent, 'utf8');
  return config;
}

export async function deployIndexesInstructions(collection, selectedFields) {
  const outputPath = path.resolve(__dirname, '../../firestore.indexes.json');
  await generateFirestoreIndexesFile(collection, selectedFields, outputPath);
  
  return {
    filePath: outputPath,
    instructions: [
      'Index configuration file generated!',
      '',
      'To deploy the indexes to Firestore, run:',
      `  firebase deploy --only firestore:indexes`,
      '',
      'Or if you prefer to use the Firebase CLI interactively:',
      '  1. Make sure you have Firebase CLI installed: npm install -g firebase-tools',
      '  2. Login: firebase login',
      '  3. Initialize (if not done): firebase init firestore',
      '  4. Deploy indexes: firebase deploy --only firestore:indexes',
    ],
  };
}

