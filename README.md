# S3 URL Uploader

A full-stack TypeScript application for uploading files from URLs to cloud storage providers (AWS S3, Google Cloud Storage, and Azure Blob Storage).

## Features

- **Multi-Cloud Support**: Upload to AWS S3, Google Cloud Storage, or Azure Blob Storage
- **Multiple Upload Modes**: Single URL, bulk URLs, or file upload
- **Real-time Progress Tracking**: Monitor upload progress with visual indicators
- **Secure**: Uses presigned URLs for direct upload to cloud storage
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **Type Safety**: Full TypeScript support for both frontend and backend
- **Error Handling**: Comprehensive error handling and user feedback
- **Rate Limiting**: Built-in rate limiting to prevent abuse

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Lucide React for icons

### Backend
- Node.js with Express
- TypeScript
- AWS SDK v3
- Google Cloud Storage SDK
- Azure Blob Storage SDK
- Winston for logging
- Zod for validation
- Helmet for security

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Cloud storage accounts (AWS S3, GCP, or Azure)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd s3-url-uploader
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
```

4. Configure your cloud storage credentials in the `.env` file (see Configuration section).

## Development

Start the development server:
```bash
npm run dev
```

This will start both the frontend (port 3000) and backend (port 3001) servers.

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# Google Cloud Storage Configuration
GCP_PROJECT_ID=your-project-id
GCP_BUCKET_NAME=your-bucket-name
GCP_KEY_FILE_PATH=path/to/service-account-key.json

# Azure Blob Storage Configuration
AZURE_STORAGE_ACCOUNT=your-storage-account
AZURE_STORAGE_CONTAINER=your-container-name
AZURE_STORAGE_ACCOUNT_KEY=your-account-key
AZURE_STORAGE_SAS_TOKEN=your-sas-token

# Security
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### Cloud Storage Setup

#### AWS S3
1. Create an S3 bucket
2. Create an IAM user with S3 permissions
3. Configure CORS on your bucket:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": []
  }
]
```

#### Google Cloud Storage
1. Create a GCS bucket
2. Create a service account with Storage Object Admin role
3. Download the JSON key file
4. Configure CORS on your bucket

#### Azure Blob Storage
1. Create a storage account and container
2. Generate a shared access signature or use account key
3. Configure CORS on your storage account

## Usage

1. Open the application in your browser (http://localhost:3000)
2. Click "Configure Cloud Storage" to set up your credentials
3. Choose your upload mode:
   - **Single URL**: Upload one file from a URL
   - **Bulk URLs**: Upload multiple files from a list of URLs
   - **Upload File**: Upload a text file containing URLs
4. Enter your file URLs and click upload
5. Monitor the progress and status of your uploads

## API Endpoints

- `POST /api/s3-presigned-url` - Generate S3 presigned URL
- `POST /api/gcp-signed-url` - Generate GCP signed URL
- `POST /api/azure-sas-url` - Generate Azure SAS URL
- `GET /api/health` - Health check endpoint

## Building for Production

Build the application:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Linting

Run linting:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

## Project Structure

```
src/
├── client/                 # React frontend
│   ├── components/         # React components
│   ├── main.tsx           # React entry point
│   └── index.html         # HTML template
├── server/                # Express backend
│   ├── routes/            # API routes
│   ├── middleware/        # Express middleware
│   ├── utils/             # Utility functions
│   └── index.ts           # Server entry point
└── shared/                # Shared types and utilities
```

## Security Considerations

- Credentials are stored in memory only (not persisted)
- Use IAM roles, service accounts, or SAS tokens in production
- Implement proper authentication and authorization
- Set up CORS policies on your storage buckets
- Use HTTPS in production
- Implement rate limiting to prevent abuse

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 