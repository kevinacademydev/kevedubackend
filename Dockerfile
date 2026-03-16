# ============================================================
# 케빈아카데미 - Google Cloud Run 배포용 Dockerfile
# ============================================================
#
# ▶ 로컬 Docker 테스트:
#   docker build -t chanwoo-academy .
#   docker run -p 3001:3001 --env-file .env chanwoo-academy
#
# ▶ Cloud Run 배포 (소스 기반 - Dockerfile 자동 감지):
#   gcloud run deploy chanwoo-academy --source . --region asia-northeast3 --allow-unauthenticated
#
# ▶ Cloud Run이 자동으로 처리하는 것:
#   - Docker 이미지 빌드 (Cloud Build)
#   - Artifact Registry에 이미지 저장
#   - 컨테이너 배포 및 HTTPS URL 발급
#   - PORT 환경변수 자동 설정 (보통 8080)
# ============================================================

# Node.js 20 LTS 경량 이미지
FROM node:20-slim

WORKDIR /app

# package.json만 먼저 복사 → 의존성 캐싱 (코드 변경 시 npm install 재실행 방지)
COPY package.json ./
RUN npm install --production

# 나머지 소스 코드 복사 (.dockerignore에 의해 node_modules, .env 등 제외)
COPY . .

# Cloud Run은 PORT 환경변수를 자동 설정하므로 EXPOSE는 참고용
EXPOSE 3001

CMD ["node", "server.js"]
