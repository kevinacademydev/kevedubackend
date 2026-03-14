// 이메일 알림 유틸리티 (nodemailer)
// 환경변수 EMAIL_USER, EMAIL_PASS 설정 시 실제 발송
// Gmail 사용 시 앱 비밀번호 필요

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT, 10) || 587;

const isMock = !EMAIL_USER || !EMAIL_PASS;

let transporter = null;
if (!isMock) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
}

if (isMock) {
  console.log('[EMAIL] 이메일 환경변수 미설정 - mock 모드로 동작합니다.');
}

async function sendEmail(to, subject, text) {
  if (!to) {
    console.log('[EMAIL] 이메일 주소 없음 - 발송 건너뜀');
    return { success: false, reason: 'no_email' };
  }

  if (isMock || !transporter) {
    console.log(`[EMAIL MOCK] To: ${to}`);
    console.log(`[EMAIL MOCK] Subject: ${subject}`);
    console.log(`[EMAIL MOCK] Body: ${text}`);
    console.log('[EMAIL MOCK] ---');
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"케빈아카데미" <${EMAIL_USER}>`,
      to,
      subject,
      text
    });
    console.log(`[EMAIL] 발송 완료: ${to} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL] 발송 실패: ${to}`, err.message);
    return { success: false, error: err.message };
  }
}

async function notifyGradingCompleteEmail(email, name) {
  const subject = '[케빈아카데미] 첨삭 결과 등록 안내';
  const text = `안녕하세요.\n\n${name} 학생의 첨삭 결과가 등록되었습니다.\n학원 홈페이지에서 확인해주세요.\n\n감사합니다.\n케빈아카데미`;
  return sendEmail(email, subject, text);
}

async function notifyExtraRequestStatusEmail(email, name, status, note) {
  let subject, text;
  if (status === 'approved') {
    subject = '[케빈아카데미] 추가 첨삭 요청 승인';
    text = `안녕하세요.\n\n${name} 학생의 추가 첨삭 요청이 승인되었습니다.\n첨삭 완료 후 다시 알려드리겠습니다.\n\n감사합니다.\n케빈아카데미`;
  } else if (status === 'rejected') {
    subject = '[케빈아카데미] 추가 첨삭 요청 거절';
    text = `안녕하세요.\n\n${name} 학생의 추가 첨삭 요청이 거절되었습니다.`;
    if (note) text += `\n사유: ${note}`;
    text += `\n\n감사합니다.\n케빈아카데미`;
  } else if (status === 'completed') {
    subject = '[케빈아카데미] 추가 첨삭 완료';
    text = `안녕하세요.\n\n${name} 학생의 추가 첨삭이 완료되었습니다.\n학원 홈페이지에서 확인해주세요.\n\n감사합니다.\n케빈아카데미`;
  }
  return sendEmail(email, subject, text);
}

module.exports = { sendEmail, notifyGradingCompleteEmail, notifyExtraRequestStatusEmail };
