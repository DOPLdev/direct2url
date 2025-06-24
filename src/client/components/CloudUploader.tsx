import React, { useState, useCallback, useRef } from 'react';
import { AlertCircle, Upload, CheckCircle2, Loader2, FileText, X, Plus, Settings, Eye, EyeOff } from 'lucide-react';

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  endpoint?: string;
}

interface GCPConfig {
  bucket: string;
  projectId: string;
  keyFile: string; // JSON key file content
}

interface AzureConfig {
  accountName: string;
  containerName: string;
  accountKey?: string;
  sasToken?: string;
}

interface CloudConfig {
  provider: 's3' | 'gcp' | 'azure';
  s3?: S3Config;
  gcp?: GCPConfig;
  azure?: AzureConfig;
}

interface UploadItem {
  id: string;
  url: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  fileName?: string;
}

interface UploadState {
  items: UploadItem[];
  isUploading: boolean;
}

const CloudUploader: React.FC = () => {
  const [singleUrl, setSingleUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>({
    items: [],
    isUploading: false
  });
  const [mode, setMode] = useState<'single' | 'bulk' | 'file'>('single');
  const [showConfig, setShowConfig] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({
    provider: 's3',
    s3: {
      bucket: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
      endpoint: ''
    },
    gcp: {
      bucket: '',
      projectId: '',
      keyFile: ''
    },
    azure: {
      accountName: '',
      containerName: '',
      accountKey: '',
      sasToken: ''
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sanitizeInput = useCallback((input: string): string => {
    return input.trim().replace(/[<>'"&]/g, '');
  }, []);

  const sanitizeUrl = useCallback((url: string): string => {
    return url.trim().replace(/[<>'"]/g, '');
  }, []);

  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, []);

  const sanitizeFileName = useCallback((fileName: string): string => {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }, []);

  const parseUrls = useCallback((input: string): string[] => {
    return input
      .split(/[,\n\r]+/)
      .map(sanitizeUrl)
      .filter(url => url && isValidUrl(url));
  }, [sanitizeUrl, isValidUrl]);

  const getPresignedUrl = async (fileName: string, fileType: string): Promise<string> => {
    const config = cloudConfig[cloudConfig.provider];
    
    // Validate configuration based on provider
    if (cloudConfig.provider === 's3') {
      const s3Config = config as S3Config;
      if (!s3Config?.bucket || !s3Config?.accessKeyId || !s3Config?.secretAccessKey) {
        throw new Error('S3 configuration required');
      }
    } else if (cloudConfig.provider === 'gcp') {
      const gcpConfig = config as GCPConfig;
      if (!gcpConfig?.bucket || !gcpConfig?.projectId || !gcpConfig?.keyFile) {
        throw new Error('GCP configuration required');
      }
    } else if (cloudConfig.provider === 'azure') {
      const azureConfig = config as AzureConfig;
      if (!azureConfig?.accountName || !azureConfig?.containerName || (!azureConfig?.accountKey && !azureConfig?.sasToken)) {
        throw new Error('Azure configuration required');
      }
    }

    const endpoint = cloudConfig.provider === 's3' ? '/api/s3-presigned-url' :
                    cloudConfig.provider === 'gcp' ? '/api/gcp-signed-url' :
                    '/api/azure-sas-url';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fileName: sanitizeFileName(fileName), 
        fileType: sanitizeInput(fileType),
        config: {
          provider: cloudConfig.provider,
          ...config
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Failed to get ${cloudConfig.provider.toUpperCase()} signed URL`);
    }
    
    const { signedUrl } = await response.json();
    return signedUrl;
  };

  const uploadFileToCloud = async (
    file: File, 
    signedUrl: string, 
    itemId: string
  ): Promise<void> => {
    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadState(prev => ({
            ...prev,
            items: prev.items.map(item =>
              item.id === itemId ? { ...item, progress } : item
            )
          }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      // Different HTTP methods for different providers
      const method = cloudConfig.provider === 'azure' ? 'PUT' : 'PUT';
      xhr.open(method, signedUrl);
      
      // Set appropriate headers for each provider
      if (cloudConfig.provider === 's3') {
        xhr.setRequestHeader('Content-Type', file.type);
      } else if (cloudConfig.provider === 'gcp') {
        xhr.setRequestHeader('Content-Type', file.type);
      } else if (cloudConfig.provider === 'azure') {
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
      }
      
      xhr.send(file);
    });
  };

  const processUpload = async (item: UploadItem): Promise<void> => {
    try {
      setUploadState(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i
        )
      }));

      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = sanitizeFileName(
        item.fileName || item.url.split('/').pop() || 'uploaded-file'
      );
      const file = new File([blob], fileName, { type: blob.type });

      const presignedUrl = await getPresignedUrl(fileName, file.type);
      await uploadFileToCloud(file, presignedUrl, item.id);

      setUploadState(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id ? { ...i, status: 'success', progress: 100 } : i
        )
      }));
    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id ? {
            ...i,
            status: 'error',
            progress: 0,
            error: error instanceof Error ? error.message : 'Upload failed'
          } : i
        )
      }));
    }
  };

  const handleSingleUpload = async (): Promise<void> => {
    const sanitized = sanitizeUrl(singleUrl);
    if (!isValidUrl(sanitized)) {
      return;
    }

    const item: UploadItem = {
      id: Date.now().toString(),
      url: sanitized,
      status: 'pending',
      progress: 0
    };

    setUploadState({ items: [item], isUploading: true });
    await processUpload(item);
    setUploadState(prev => ({ ...prev, isUploading: false }));
  };

  const handleBulkUpload = async (): Promise<void> => {
    const urls = parseUrls(bulkUrls);
    if (urls.length === 0) return;

    const items: UploadItem[] = urls.map((url, index) => ({
      id: `${Date.now()}-${index}`,
      url,
      status: 'pending' as const,
      progress: 0
    }));

    setUploadState({ items, isUploading: true });

    // Process uploads sequentially to avoid overwhelming the server
    for (const item of items) {
      await processUpload(item);
    }

    setUploadState(prev => ({ ...prev, isUploading: false }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const urls = parseUrls(text);
      
      if (urls.length === 0) {
        throw new Error('No valid URLs found in file');
      }

      const items: UploadItem[] = urls.map((url, index) => ({
        id: `${Date.now()}-${index}`,
        url,
        status: 'pending' as const,
        progress: 0
      }));

      setUploadState({ items, isUploading: true });

      for (const item of items) {
        await processUpload(item);
      }

      setUploadState(prev => ({ ...prev, isUploading: false }));
    } catch (error) {
      console.error('File processing error:', error);
    }
  };

  const removeItem = (id: string): void => {
    setUploadState(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const isCloudConfigured = (): boolean => {
    const config = cloudConfig[cloudConfig.provider];
    
    if (cloudConfig.provider === 's3') {
      const s3Config = config as S3Config;
      return !!(s3Config?.bucket && s3Config?.accessKeyId && s3Config?.secretAccessKey);
    } else if (cloudConfig.provider === 'gcp') {
      const gcpConfig = config as GCPConfig;
      return !!(gcpConfig?.bucket && gcpConfig?.projectId && gcpConfig?.keyFile);
    } else if (cloudConfig.provider === 'azure') {
      const azureConfig = config as AzureConfig;
      return !!(azureConfig?.accountName && azureConfig?.containerName && (azureConfig?.accountKey || azureConfig?.sasToken));
    }
    
    return false;
  };

  const handleConfigSave = (): void => {
    setShowConfig(false);
  };

  const clearAll = (): void => {
    setUploadState({ items: [], isUploading: false });
    setSingleUrl('');
    setBulkUrls('');
  };

  const getOverallProgress = (): number => {
    if (uploadState.items.length === 0) return 0;
    const total = uploadState.items.reduce((sum, item) => sum + item.progress, 0);
    return Math.round(total / uploadState.items.length);
  };

  const getStatusCounts = () => {
    return uploadState.items.reduce(
      (acc, item) => {
        acc[item.status]++;
        return acc;
      },
      { pending: 0, uploading: 0, success: 0, error: 0 }
    );
  };

  const isDisabled = uploadState.isUploading;
  const statusCounts = getStatusCounts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Cloud File Uploader</h1>
          <p className="text-gray-600">Upload files from URLs to AWS S3, Google Cloud Storage, or Azure Blob Storage</p>
          
          <div className="flex items-center justify-center gap-4 mt-4">
            <button
              onClick={() => setShowConfig(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isCloudConfigured()
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              <Settings className="w-4 h-4" />
              {isCloudConfigured() ? `${cloudConfig.provider.toUpperCase()} Configured` : 'Configure Cloud Storage'}
            </button>
            {!isCloudConfigured() && (
              <span className="text-sm text-red-600">Configuration required</span>
            )}
          </div>
        </div>

        {/* Mode Selection */}
        <div className="flex gap-2 mb-6">
          {(['single', 'bulk', 'file'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isDisabled}
            >
              {m === 'single' ? 'Single URL' : m === 'bulk' ? 'Bulk URLs' : 'Upload File'}
            </button>
          ))}
        </div>

        {/* Input Forms */}
        <div className="space-y-6">
          {mode === 'single' && (
            <div>
              <label htmlFor="singleUrl" className="block text-sm font-medium text-gray-700 mb-2">
                File URL
              </label>
              <input
                id="singleUrl"
                type="url"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                placeholder="https://example.com/file.pdf"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isDisabled}
              />
              <button
                onClick={handleSingleUpload}
                disabled={isDisabled || !singleUrl.trim() || !isCloudConfigured()}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg transition-colors"
              >
                Upload File
              </button>
            </div>
          )}

          {mode === 'bulk' && (
            <div>
              <label htmlFor="bulkUrls" className="block text-sm font-medium text-gray-700 mb-2">
                URLs (comma or newline separated)
              </label>
              <textarea
                id="bulkUrls"
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder="https://example.com/file1.pdf,&#10;https://example.com/file2.jpg"
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isDisabled}
              />
              <button
                onClick={handleBulkUpload}
                disabled={isDisabled || !bulkUrls.trim() || !isCloudConfigured()}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg transition-colors"
              >
                Upload All Files
              </button>
            </div>
          )}

          {mode === 'file' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Text File with URLs
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isDisabled || !isCloudConfigured()}
              />
            </div>
          )}
        </div>

        {/* Overall Progress */}
        {uploadState.isUploading && uploadState.items.length > 1 && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Overall Progress</span>
              <span>{getOverallProgress()}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getOverallProgress()}%` }}
              />
            </div>
          </div>
        )}

        {/* Status Summary */}
        {uploadState.items.length > 0 && (
          <div className="mt-6 flex justify-between items-center">
            <div className="flex gap-4 text-sm">
              {statusCounts.success > 0 && (
                <span className="text-green-600">✓ {statusCounts.success} completed</span>
              )}
              {statusCounts.uploading > 0 && (
                <span className="text-blue-600">↑ {statusCounts.uploading} uploading</span>
              )}
              {statusCounts.error > 0 && (
                <span className="text-red-600">✗ {statusCounts.error} failed</span>
              )}
            </div>
            <button
              onClick={clearAll}
              disabled={isDisabled}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Upload Items */}
        {uploadState.items.length > 0 && (
          <div className="mt-6 space-y-3 max-h-96 overflow-y-auto">
            {uploadState.items.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {item.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                    {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                    <span className="text-sm text-gray-700 truncate">{item.url}</span>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={item.status === 'uploading'}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {item.status === 'uploading' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Uploading...</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div
                        className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {item.error && (
                  <p className="text-xs text-red-600 mt-1">{item.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="text-sm font-medium text-amber-800 mb-2">Setup Required</h3>
          <ul className="text-xs text-amber-700 space-y-1">
            <li>• Configure cloud storage credentials using the button above</li>
            <li>• Implement backend APIs for signed URLs with validation</li>
            <li>• Set up CORS policies on your storage buckets/containers</li>
          </ul>
        </div>

        {/* Cloud Storage Configuration Modal */}
        {showConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Cloud Storage Configuration</h2>
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Provider Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Storage Provider
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['s3', 'gcp', 'azure'] as const).map((provider) => (
                    <button
                      key={provider}
                      onClick={() => setCloudConfig(prev => ({ ...prev, provider }))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        cloudConfig.provider === provider
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {provider === 's3' ? 'AWS S3' : provider === 'gcp' ? 'GCP Storage' : 'Azure Blob'}
                    </button>
                  ))}
                </div>
              </div>

              {/* AWS S3 Configuration */}
              {cloudConfig.provider === 's3' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bucket Name *
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.s3?.bucket || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        s3: { ...prev.s3!, bucket: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="my-s3-bucket"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Region *
                    </label>
                    <select
                      value={cloudConfig.s3?.region || 'us-east-1'}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        s3: { ...prev.s3!, region: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="us-east-1">US East (N. Virginia)</option>
                      <option value="us-east-2">US East (Ohio)</option>
                      <option value="us-west-1">US West (N. California)</option>
                      <option value="us-west-2">US West (Oregon)</option>
                      <option value="eu-west-1">Europe (Ireland)</option>
                      <option value="eu-central-1">Europe (Frankfurt)</option>
                      <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                      <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Access Key ID *
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.s3?.accessKeyId || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        s3: { ...prev.s3!, accessKeyId: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Secret Access Key *
                    </label>
                    <div className="relative">
                      <input
                        type={showSecrets ? "text" : "password"}
                        value={cloudConfig.s3?.secretAccessKey || ''}
                        onChange={(e) => setCloudConfig(prev => ({
                          ...prev,
                          s3: { ...prev.s3!, secretAccessKey: e.target.value }
                        }))}
                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecrets(!showSecrets)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Session Token (optional)
                    </label>
                    <input
                      type={showSecrets ? "text" : "password"}
                      value={cloudConfig.s3?.sessionToken || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        s3: { ...prev.s3!, sessionToken: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="For temporary credentials"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* GCP Configuration */}
              {cloudConfig.provider === 'gcp' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bucket Name *
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.gcp?.bucket || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        gcp: { ...prev.gcp!, bucket: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="my-gcp-bucket"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project ID *
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.gcp?.projectId || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        gcp: { ...prev.gcp!, projectId: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="my-project-123456"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Service Account Key (JSON) *
                    </label>
                    <textarea
                      value={cloudConfig.gcp?.keyFile || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        gcp: { ...prev.gcp!, keyFile: e.target.value }
                      }))}
                      placeholder='{"type": "service_account", "project_id": "..."}'
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Azure Configuration */}
              {cloudConfig.provider === 'azure' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Storage Account Name *
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.azure?.accountName || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        azure: { ...prev.azure!, accountName: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="mystorageaccount"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Container Name *
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.azure?.containerName || ''}
                      onChange={(e) => setCloudConfig(prev => ({
                        ...prev,
                        azure: { ...prev.azure!, containerName: sanitizeInput(e.target.value) }
                      }))}
                      placeholder="uploads"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account Key
                    </label>
                    <div className="relative">
                      <input
                        type={showSecrets ? "text" : "password"}
                        value={cloudConfig.azure?.accountKey || ''}
                        onChange={(e) => setCloudConfig(prev => ({
                          ...prev,
                          azure: { ...prev.azure!, accountKey: e.target.value }
                        }))}
                        placeholder="Storage account access key"
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecrets(!showSecrets)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-center text-gray-500 text-sm">or</div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SAS Token
                    </label>
                    <div className="relative">
                      <input
                        type={showSecrets ? "text" : "password"}
                        value={cloudConfig.azure?.sasToken || ''}
                        onChange={(e) => setCloudConfig(prev => ({
                          ...prev,
                          azure: { ...prev.azure!, sasToken: sanitizeInput(e.target.value) }
                        }))}
                        placeholder="?sv=2021-06-08&ss=bfqt..."
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecrets(!showSecrets)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowConfig(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfigSave}
                  disabled={!isCloudConfigured()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Save Configuration
                </button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Security Note:</strong> Credentials are stored in memory only. 
                  Consider using IAM roles, service accounts, or SAS tokens in production.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudUploader; 