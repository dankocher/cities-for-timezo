## GeoNames → Firestore CLI

This project downloads public GeoNames datasets above certain population thresholds, allows interactive filtering, and uploads the result to Firebase Firestore.

### Requirements

- Node.js 18+
- A Firebase service account JSON credentials file (`FIREBASE_CREDENTIALS_PATH`)
- Internet connection to download `.zip` files from [GeoNames](https://download.geonames.org/export/dump/)

### Firebase Configuration

**Firebase Project:** `weather-forecast-f019a`

To obtain the service account credentials needed for `firebase-admin`:

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select the `weather-forecast-f019a` project
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file and save it securely (e.g., `./credentials/firebase-service-account.json`)

**Important:** The service account JSON credentials file is different from the web client configuration. This project uses `firebase-admin` which requires the service account JSON file.

### Installation

```bash
npm install
```

Relevant environment variables (you can configure them in a `.env` file or as environment variables):

- `FIREBASE_CREDENTIALS_PATH`: absolute path to the Firebase service account JSON file.
- `FIRESTORE_COLLECTION`: default destination collection (optional, defaults to `cities` if not set).

### Available Commands

| Script        | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `npm run download` | Runs the CLI in download mode: select dataset (500, 1000, 5000, 15000) and additional filters (countries, min/max population). Generates `data/processed-citiesXXXX.json`. |
| `npm run upload`   | Uses an existing processed file and uploads it to Firestore in configurable batches (up to 450 docs). Allows selecting collection and credentials. |
| `npm run full`     | Complete flow: asks for filters, downloads, processes and immediately uploads to Firestore. |

All commands interactively display the options provided by GeoNames so you can choose the most convenient threshold. The `cities15000` dataset is set as default.

### Generated Files

- `data/processed-citiesXXXX.json`: optimized file (only necessary fields) ready to import or review.

### Filter Customization

During the interactive flow you can:

- Adjust additional minimum population (in addition to the dataset's own threshold).
- Define an optional maximum population.
- Filter by country codes (ISO-3166 alpha-2) separated by commas.

### Firestore Upload

The uploader:

1. Reads the JSON file as a stream to avoid memory saturation.
2. Initializes `firebase-admin` with your credentials.
3. Generates batches (configurable `batchSize`, 400 by default) and performs upsert writes using `geonameId` as the document ID.

### Common Errors

- **Credentials not found**: make sure to export `FIREBASE_CREDENTIALS_PATH` or use the interactive option to provide the path. The file must be the service account JSON credentials, not the web client configuration.
- **Firestore limits**: keep `batchSize ≤ 450` to respect SDK restrictions.
- **Insufficient permissions**: make sure the service account has write permissions in Firestore.

### References

- GeoNames official download: https://download.geonames.org/export/dump/
