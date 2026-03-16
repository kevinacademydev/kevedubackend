// ============================================================
// Google Cloud Storage (GCS) 파일 관리 유틸리티
// ============================================================
//
// ▶ 필요한 환경변수:
//   GOOGLE_SERVICE_ACCOUNT_JSON  - 서비스 계정 JSON 키 (한 줄로)
//   GCS_BUCKET_NAME              - GCS 버킷 이름 (예: kevedu-academy-files)
//
// ▶ GCS 버킷 생성 (최초 1회):
//   gcloud storage buckets create gs://kevedu-academy-files \
//     --location=asia-northeast3 --project=kevedu-dev
//
// ▶ 서비스 계정 권한 부여 (최초 1회):
//   gcloud storage buckets add-iam-policy-binding gs://kevedu-academy-files \
//     --member=serviceAccount:kevedu-dev-storage@kevedu-dev.iam.gserviceaccount.com \
//     --role=roles/storage.objectAdmin
//
// ▶ 파일 구조:
//   gs://kevedu-academy-files/uploads/{timestamp}-{파일명}
//
// ▶ 업로드된 파일 확인:
//   gcloud storage ls gs://kevedu-academy-files/uploads/
//
// ▶ 비용 (참고):
//   50GB 기준 월 ~$1.15 (₩1,500)
// ============================================================

const { Storage } = require('@google-cloud/storage');

let storageClient = null;
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || '';

// 서비스 계정 JSON으로 GCS 클라이언트 초기화 (싱글톤)
// GOOGLE_SERVICE_ACCOUNT_JSON 미설정 시 파일 기능 비활성화 (업로드/다운로드 불가)
function getStorage() {
  if (storageClient) return storageClient;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.log('[Storage] GOOGLE_SERVICE_ACCOUNT_JSON 미설정 - 파일 기능 비활성화');
    return null;
  }

  const credentials = JSON.parse(raw);
  storageClient = new Storage({ credentials });
  return storageClient;
}

// 파일 업로드 → GCS 파일 경로 반환 (예: "uploads/1710500000000-homework.pdf")
// DB의 file_path 컬럼에 이 경로가 저장됨
async function uploadFile(buffer, fileName, mimeType) {
  const storage = getStorage();
  if (!storage || !BUCKET_NAME) throw new Error('Google Cloud Storage not configured');

  const filePath = `uploads/${Date.now()}-${fileName}`;
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  await file.save(buffer, {
    metadata: { contentType: mimeType || 'application/octet-stream' }
  });

  return filePath;
}

// 파일 다운로드 → { buffer, mimeType }
// DB에 저장된 file_path로 GCS에서 파일 가져옴
async function downloadFile(filePath) {
  const storage = getStorage();
  if (!storage || !BUCKET_NAME) throw new Error('Google Cloud Storage not configured');

  const file = storage.bucket(BUCKET_NAME).file(filePath);
  const [metadata] = await file.getMetadata();
  const [contents] = await file.download();

  return {
    buffer: contents,
    mimeType: metadata.contentType || 'application/octet-stream'
  };
}

// 파일 삭제
async function deleteFile(filePath) {
  const storage = getStorage();
  if (!storage || !BUCKET_NAME) return;

  try {
    await storage.bucket(BUCKET_NAME).file(filePath).delete();
  } catch (err) {
    console.error(`[Storage] 파일 삭제 실패 (${filePath}):`, err.message);
  }
}

// 폴더/파일 목록 조회 (prefix 기반 탐색)
// delimiter '/'를 사용하여 현재 경로의 폴더(prefixes)와 파일(files)을 분리 반환
async function listFiles(prefix = '') {
  const storage = getStorage();
  if (!storage || !BUCKET_NAME) throw new Error('Google Cloud Storage not configured');

  const [files, , apiResponse] = await storage.bucket(BUCKET_NAME).getFiles({
    prefix,
    delimiter: '/',
    autoPaginate: false,
  });

  const prefixes = (apiResponse.prefixes || []).map(p => ({
    name: p.replace(prefix, '').replace(/\/$/, ''),
    fullPath: p,
    isFolder: true,
  }));

  const fileList = files
    .filter(f => f.name !== prefix) // 자기 자신(폴더 placeholder) 제외
    .map(f => ({
      name: f.name.replace(prefix, ''),
      fullPath: f.name,
      size: Number(f.metadata.size || 0),
      contentType: f.metadata.contentType || 'application/octet-stream',
      updated: f.metadata.updated || null,
      isFolder: false,
    }));

  return { prefixes, files: fileList };
}

// 지정 경로에 파일 업로드 (파일 탐색기용 - 경로 그대로 사용)
async function uploadFileDirect(buffer, filePath, mimeType) {
  const storage = getStorage();
  if (!storage || !BUCKET_NAME) throw new Error('Google Cloud Storage not configured');

  await storage.bucket(BUCKET_NAME).file(filePath).save(buffer, {
    metadata: { contentType: mimeType || 'application/octet-stream' }
  });
  return filePath;
}

// 빈 폴더 생성 (placeholder 파일)
async function createFolder(folderPath) {
  const storage = getStorage();
  if (!storage || !BUCKET_NAME) throw new Error('Google Cloud Storage not configured');

  await storage.bucket(BUCKET_NAME).file(folderPath).save('', {
    metadata: { contentType: 'application/x-directory' }
  });
  return folderPath;
}

module.exports = { uploadFile, downloadFile, deleteFile, listFiles, uploadFileDirect, createFolder };
