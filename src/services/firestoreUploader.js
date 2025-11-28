import fs from 'fs';
import firebaseAdmin from 'firebase-admin';

import { resolveCredentialsPath } from '../config/index.js';

let firestoreInstance;
let initializedCredentials;

function getFirestore(credentialsPath) {
  if (firestoreInstance) {
    if (credentialsPath) {
      const resolved = resolveCredentialsPath(credentialsPath);
      if (resolved !== initializedCredentials) {
        throw new Error(
          'Firestore was already initialized with a different credentials file in this session.'
        );
      }
    }
    return firestoreInstance;
  }

  const resolvedPath = resolveCredentialsPath(credentialsPath);
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  if (!firebaseAdmin.apps.length) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
  }

  initializedCredentials = resolvedPath;
  firestoreInstance = firebaseAdmin.firestore();
  return firestoreInstance;
}

async function countRecords(filePath) {
  let count = 0;
  for await (const _ of iterateJsonArray(filePath)) {
    count++;
  }
  return count;
}

async function uploadJsonToFirestore({ filePath, collection, credentialsPath, batchSize = 400, onProgress, startFromId, startFromIndex }) {
  const firestore = getFirestore(credentialsPath);
  const collectionRef = firestore.collection(collection);

  // Count total records first for progress tracking
  console.log('Counting records...');
  const totalRecords = await countRecords(filePath);
  console.log(`Found ${totalRecords} records to upload.`);

  let batch = firestore.batch();
  let pending = 0;
  let uploaded = 0; // total uploaded across whole file
  let uploadedInRun = 0; // uploaded during this specific run (after resume point)
  let skipped = 0;
  let recordIndex = 0; // Current position in the JSON array
  let started = !startFromId && !startFromIndex; // If no start point, start immediately
  let lastSuccessfulId = null; // Last ID that was successfully committed
  let lastSuccessfulIndex = 0; // Last record index that was successfully committed
  let currentBatchIds = []; // IDs in current batch
  let totalToUpload = totalRecords; // adjusted when resuming
  let startedAtRecord = null; // index where we actually started uploading

  for await (const record of iterateJsonArray(filePath)) {
    recordIndex++;
    
    // Skip records until we reach the start point
    if (!started) {
      if (startFromIndex && recordIndex <= startFromIndex) {
        skipped++;
        continue;
      } else if (startFromIndex && recordIndex > startFromIndex) {
        started = true;
        console.log(`Resuming from record index: ${startFromIndex} (current: ${recordIndex})`);
      } else if (startFromId && String(record.id) === String(startFromId)) {
        started = true;
        console.log(`Resuming from city ID: ${startFromId} (record index: ${recordIndex})`);
      } else if (startFromId) {
        skipped++;
        continue;
      }
    }

    if (started && startedAtRecord === null) {
      startedAtRecord = recordIndex;
      totalToUpload = totalRecords - skipped;
      if (totalToUpload <= 0) {
        console.log('Nothing left to upload (all records skipped).');
        return { uploaded: 0, lastSuccessfulId, lastSuccessfulIndex: skipped };
      }
      console.log(`Uploading ${totalToUpload} remaining records (skipped ${skipped}).`);
    }

    const docRef = collectionRef.doc(String(record.id));
    batch.set(docRef, record, { merge: true });
    pending += 1;
    currentBatchIds.push(record.id);

    if (pending >= batchSize) {
      try {
        await batch.commit();
        uploaded += pending;
        uploadedInRun += pending;
        // After successful commit, update lastSuccessfulId and lastSuccessfulIndex
        lastSuccessfulId = currentBatchIds[currentBatchIds.length - 1];
        lastSuccessfulIndex = recordIndex;
        const overallPercentage = ((uploaded / totalRecords) * 100).toFixed(1);
        const runPercentage = ((uploadedInRun / totalToUpload) * 100).toFixed(1);
        console.log(
          `Progress: ${uploaded}/${totalRecords} (${overallPercentage}%) | Run: ${uploadedInRun}/${totalToUpload} (${runPercentage}%) - Record index: ${lastSuccessfulIndex} - Last ID: ${lastSuccessfulId} - Skipped: ${skipped}`
        );
        if (onProgress)
          onProgress({
            uploaded,
            total: totalRecords,
            percentage: overallPercentage,
            skipped,
            lastSuccessfulId,
            lastSuccessfulIndex,
            runUploaded: uploadedInRun,
            runTotal: totalToUpload,
            runPercentage,
          });
        batch = firestore.batch();
        pending = 0;
        currentBatchIds = [];
      } catch (error) {
        // If commit fails, lastSuccessfulIndex and lastSuccessfulId have the last successfully committed values
        throw new Error(`Failed to commit batch. Last successfully uploaded record index: ${lastSuccessfulIndex}, ID: ${lastSuccessfulId || 'none'}. Error: ${error.message}`);
      }
    }
  }

  if (pending > 0) {
    try {
      await batch.commit();
      uploaded += pending;
      uploadedInRun += pending;
      lastSuccessfulId = currentBatchIds[currentBatchIds.length - 1];
      lastSuccessfulIndex = recordIndex;
      const overallPercentage = ((uploaded / totalRecords) * 100).toFixed(1);
      const runPercentage = ((uploadedInRun / totalToUpload) * 100).toFixed(1);
      console.log(
        `Progress: ${uploaded}/${totalRecords} (${overallPercentage}%) | Run: ${uploadedInRun}/${totalToUpload} (${runPercentage}%) - Record index: ${lastSuccessfulIndex} - Last ID: ${lastSuccessfulId} - Skipped: ${skipped}`
      );
      if (onProgress)
        onProgress({
          uploaded,
          total: totalRecords,
          percentage: overallPercentage,
          skipped,
          lastSuccessfulId,
          lastSuccessfulIndex,
          runUploaded: uploadedInRun,
          runTotal: totalToUpload,
          runPercentage,
        });
    } catch (error) {
      throw new Error(`Failed to commit final batch. Last successfully uploaded record index: ${lastSuccessfulIndex}, ID: ${lastSuccessfulId || 'none'}. Error: ${error.message}`);
    }
  }

  if (skipped > 0) {
    console.log(`\nSkipped ${skipped} records (already processed).`);
  }

  return { uploaded, lastSuccessfulId, lastSuccessfulIndex };
}

async function* iterateJsonArray(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  let buffer = '';
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let collecting = false;

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!collecting) {
        if (char === '{') {
          collecting = true;
          buffer = '{';
          depth = 1;
          inString = false;
          escapeNext = false;
        }
        continue;
      }

      buffer += char;

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          yield JSON.parse(buffer);
          buffer = '';
          collecting = false;
        }
      }
    }
  }
}

export {
  uploadJsonToFirestore,
};

