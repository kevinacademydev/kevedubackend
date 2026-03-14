// Twilio SMS 유틸리티 (mock 모드 지원)
// 환경변수 TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER 설정 시 실제 발송

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

const isMock = !TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE;

let twilioClient = null;
if (!isMock) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
  } catch (e) {
    console.log('[SMS] twilio 패키지 미설치 - mock 모드로 동작합니다.');
  }
}

if (isMock) {
  console.log('[SMS] Twilio 환경변수 미설정 - mock 모드로 동작합니다.');
}

// 한국 전화번호 → E.164 형식 변환
function toE164(phone) {
  if (!phone) return null;
  // 하이픈, 공백 제거
  const cleaned = phone.replace(/[-\s]/g, '');
  // 이미 +82 형식이면 그대로
  if (cleaned.startsWith('+82')) return cleaned;
  // 010-xxxx-xxxx → +8210xxxxxxxx
  if (cleaned.startsWith('0')) {
    return '+82' + cleaned.slice(1);
  }
  return '+82' + cleaned;
}

// 기본 SMS 발송
async function sendSMS(to, message) {
  const e164 = toE164(to);
  if (!e164) {
    console.log('[SMS] 전화번호 없음 - 발송 건너뜀');
    return { success: false, reason: 'no_phone' };
  }

  if (isMock || !twilioClient) {
    console.log(`[SMS MOCK] To: ${e164}`);
    console.log(`[SMS MOCK] Message: ${message}`);
    console.log('[SMS MOCK] ---');
    return { success: true, mock: true };
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE,
      to: e164
    });
    console.log(`[SMS] 발송 완료: ${e164} (SID: ${result.sid})`);
    return { success: true, sid: result.sid };
  } catch (err) {
    console.error(`[SMS] 발송 실패: ${e164}`, err.message);
    return { success: false, error: err.message };
  }
}

// 채점 완료 알림
async function notifyGradingComplete(phone, name) {
  const message = `[케빈아카데미] ${name} 학생의 첨삭 결과가 등록되었습니다. 학원 홈페이지에서 확인해주세요.`;
  return sendSMS(phone, message);
}

// 추가 첨삭 요청 상태 알림
async function notifyExtraRequestStatus(phone, name, status, note) {
  let message;
  if (status === 'approved') {
    message = `[케빈아카데미] ${name} 학생의 추가 첨삭 요청이 승인되었습니다. 첨삭 완료 후 다시 알려드리겠습니다.`;
  } else if (status === 'rejected') {
    message = `[케빈아카데미] ${name} 학생의 추가 첨삭 요청이 거절되었습니다.`;
    if (note) message += ` 사유: ${note}`;
  } else if (status === 'completed') {
    message = `[케빈아카데미] ${name} 학생의 추가 첨삭이 완료되었습니다. 학원 홈페이지에서 확인해주세요.`;
  }
  return sendSMS(phone, message);
}

module.exports = { sendSMS, notifyGradingComplete, notifyExtraRequestStatus, toE164 };
