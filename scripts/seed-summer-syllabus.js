// ============================================================
// 2026 Summer Math Bootcamp - 교과 과정 데이터 일괄 입력
// 실행: node scripts/seed-summer-syllabus.js
// ============================================================
require('dotenv').config();
const postgres = require('postgres');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
  max: 1,
  idle_timeout: 10,
  connect_timeout: 10
});

// 대상 페이지 ID (관리자 페이지 schedule-pages/2/edit)
const TARGET_PAGE_ID = 2;

// ── 과목 데이터 ──────────────────────────────────────────────

const subjects = [
  // ── 1. Algebra I (기존 보존 대상 — 여기서 새로 정의) ──
  {
    name: { ko: 'Algebra I', en: 'Algebra I' },
    description: { ko: '대수학 기초 완성 과정', en: 'Foundations of Algebra' },
    promo: {
      ko: '변수, 방정식, 함수의 기초를 탄탄히 다져 중학 수학에서 고등 수학으로의 전환을 완벽히 준비합니다.',
      en: 'Build a strong foundation in variables, equations, and functions to transition smoothly from middle school to high school math.'
    },
    highlights: [
      { ko: 'Linear Equations & Inequalities', en: 'Linear Equations & Inequalities' },
      { ko: 'Systems of Equations', en: 'Systems of Equations' },
      { ko: 'Polynomials & Factoring', en: 'Polynomials & Factoring' },
      { ko: 'Quadratic Functions', en: 'Quadratic Functions' }
    ],
    placement: { ko: 'Pre-Algebra 이수자 또는 동등 수준', en: 'Pre-Algebra completion or equivalent' },
    weeklyPlan: [
      { week: '1회차', topic: { ko: '실수의 성질과 연산', en: 'Properties of Real Numbers & Operations' } },
      { week: '2회차', topic: { ko: '일차방정식 풀이', en: 'Solving Linear Equations' } },
      { week: '3회차', topic: { ko: '일차부등식과 절댓값', en: 'Linear Inequalities & Absolute Value' } },
      { week: '4회차', topic: { ko: '기울기와 일차함수 그래프', en: 'Slope & Graphing Linear Functions' } },
      { week: '5회차', topic: { ko: '연립방정식 (대입법/소거법)', en: 'Systems of Equations (Substitution/Elimination)' } },
      { week: '6회차', topic: { ko: '지수 법칙과 다항식 연산', en: 'Exponent Rules & Polynomial Operations' } },
      { week: '7회차', topic: { ko: '인수분해 (GCF, 차이의 제곱, 삼항식)', en: 'Factoring (GCF, Difference of Squares, Trinomials)' } },
      { week: '8회차', topic: { ko: '이차방정식 풀이 (인수분해/근의 공식)', en: 'Solving Quadratics (Factoring/Quadratic Formula)' } },
      { week: '9회차', topic: { ko: '이차함수의 그래프와 꼭짓점', en: 'Graphing Quadratics & Vertex Form' } },
      { week: '10회차', topic: { ko: '유리식과 근호식 기초', en: 'Introduction to Rational & Radical Expressions' } },
      { week: '11회차', topic: { ko: '종합 복습과 문제 풀이', en: 'Comprehensive Review & Problem Solving' } },
      { week: '12회차', topic: { ko: '최종 평가 및 Geometry 준비', en: 'Final Assessment & Geometry Readiness' } }
    ]
  },

  // ── 2. Geometry ──
  {
    name: { ko: 'Geometry', en: 'Geometry' },
    description: { ko: '기하학 핵심 개념과 증명', en: 'Core Geometry Concepts & Proofs' },
    promo: {
      ko: '도형의 성질, 합동과 닮음, 증명 기법을 체계적으로 학습하여 논리적 사고력을 키웁니다.',
      en: 'Systematically learn properties of shapes, congruence, similarity, and proof techniques to build logical reasoning.'
    },
    highlights: [
      { ko: 'Congruence & Similarity', en: 'Congruence & Similarity' },
      { ko: 'Triangle Proofs', en: 'Triangle Proofs' },
      { ko: 'Circles & Arc Length', en: 'Circles & Arc Length' },
      { ko: 'Coordinate Geometry', en: 'Coordinate Geometry' }
    ],
    placement: { ko: 'Algebra I 이수자', en: 'Algebra I completion required' },
    weeklyPlan: [
      { week: '1회차', topic: { ko: '점, 선, 면 & 기본 공리', en: 'Points, Lines, Planes & Basic Postulates' } },
      { week: '2회차', topic: { ko: '각도 관계와 평행선', en: 'Angle Relationships & Parallel Lines' } },
      { week: '3회차', topic: { ko: '삼각형의 합동 (SSS, SAS, ASA, AAS)', en: 'Triangle Congruence (SSS, SAS, ASA, AAS)' } },
      { week: '4회차', topic: { ko: '삼각형 성질과 부등식', en: 'Triangle Properties & Inequalities' } },
      { week: '5회차', topic: { ko: '닮음과 비례', en: 'Similarity & Proportional Reasoning' } },
      { week: '6회차', topic: { ko: '직각삼각형과 피타고라스 정리', en: 'Right Triangles & Pythagorean Theorem' } },
      { week: '7회차', topic: { ko: '사각형과 다각형의 성질', en: 'Properties of Quadrilaterals & Polygons' } },
      { week: '8회차', topic: { ko: '원의 성질: 현, 접선, 호', en: 'Circle Properties: Chords, Tangents, Arcs' } },
      { week: '9회차', topic: { ko: '넓이와 부피 공식', en: 'Area & Volume Formulas' } },
      { week: '10회차', topic: { ko: '좌표 기하학과 변환', en: 'Coordinate Geometry & Transformations' } },
      { week: '11회차', topic: { ko: '기하 증명 종합 연습', en: 'Comprehensive Proof Practice' } },
      { week: '12회차', topic: { ko: '최종 평가 및 Algebra II 준비', en: 'Final Assessment & Algebra II Readiness' } }
    ]
  },

  // ── 3. Algebra II ──
  {
    name: { ko: 'Algebra II', en: 'Algebra II' },
    description: { ko: '심화 대수학 및 함수 분석', en: 'Advanced Algebra & Function Analysis' },
    promo: {
      ko: '다항함수, 지수/로그함수, 삼각함수를 깊이 있게 학습하여 Precalculus로의 도약을 준비합니다.',
      en: 'Dive deep into polynomial, exponential/logarithmic, and trigonometric functions to prepare for Precalculus.'
    },
    highlights: [
      { ko: 'Polynomial & Rational Functions', en: 'Polynomial & Rational Functions' },
      { ko: 'Exponential & Logarithmic Functions', en: 'Exponential & Logarithmic Functions' },
      { ko: 'Sequences & Series', en: 'Sequences & Series' },
      { ko: 'Introduction to Trigonometry', en: 'Introduction to Trigonometry' }
    ],
    placement: { ko: 'Algebra I + Geometry 이수자', en: 'Algebra I + Geometry completion required' },
    weeklyPlan: [
      { week: '1회차', topic: { ko: '복소수와 이차방정식 심화', en: 'Complex Numbers & Advanced Quadratics' } },
      { week: '2회차', topic: { ko: '다항함수의 그래프와 영점', en: 'Graphing Polynomials & Finding Zeros' } },
      { week: '3회차', topic: { ko: '다항식의 나눗셈과 인수정리', en: 'Polynomial Division & Factor Theorem' } },
      { week: '4회차', topic: { ko: '유리함수와 점근선', en: 'Rational Functions & Asymptotes' } },
      { week: '5회차', topic: { ko: '근호함수와 유리 지수', en: 'Radical Functions & Rational Exponents' } },
      { week: '6회차', topic: { ko: '지수함수와 성장/감쇠 모델', en: 'Exponential Functions & Growth/Decay Models' } },
      { week: '7회차', topic: { ko: '로그함수와 로그 방정식', en: 'Logarithmic Functions & Equations' } },
      { week: '8회차', topic: { ko: '수열과 급수 (등차/등비)', en: 'Sequences & Series (Arithmetic/Geometric)' } },
      { week: '9회차', topic: { ko: '삼각비와 단위원', en: 'Trigonometric Ratios & the Unit Circle' } },
      { week: '10회차', topic: { ko: '삼각함수 그래프와 변환', en: 'Graphing Trig Functions & Transformations' } },
      { week: '11회차', topic: { ko: '확률과 통계 기초', en: 'Introduction to Probability & Statistics' } },
      { week: '12회차', topic: { ko: '최종 평가 및 Precalculus 준비', en: 'Final Assessment & Precalculus Readiness' } }
    ]
  },

  // ── 4. Precalculus ──
  {
    name: { ko: 'Precalculus', en: 'Precalculus' },
    description: { ko: '미적분 사전 준비 심화 과정', en: 'Advanced Preparation for Calculus' },
    promo: {
      ko: '함수의 심화 분석, 삼각법, 극좌표, 벡터를 마스터하여 AP Calculus 수강을 완벽히 준비합니다.',
      en: 'Master advanced function analysis, trigonometry, polar coordinates, and vectors to fully prepare for AP Calculus.'
    },
    highlights: [
      { ko: 'Advanced Trigonometry', en: 'Advanced Trigonometry' },
      { ko: 'Polar & Parametric Equations', en: 'Polar & Parametric Equations' },
      { ko: 'Limits Preview', en: 'Limits Preview' },
      { ko: 'Vectors & Matrices', en: 'Vectors & Matrices' }
    ],
    placement: { ko: 'Algebra II 이수자', en: 'Algebra II completion required' },
    weeklyPlan: [
      { week: '1회차', topic: { ko: '함수의 분석: 정의역, 치역, 역함수', en: 'Function Analysis: Domain, Range, Inverses' } },
      { week: '2회차', topic: { ko: '다항함수와 유리함수 심화', en: 'Advanced Polynomial & Rational Functions' } },
      { week: '3회차', topic: { ko: '지수·로그 함수 응용', en: 'Exponential & Logarithmic Applications' } },
      { week: '4회차', topic: { ko: '삼각함수 항등식과 방정식', en: 'Trigonometric Identities & Equations' } },
      { week: '5회차', topic: { ko: '역삼각함수와 삼각방정식 풀이', en: 'Inverse Trig Functions & Solving Trig Equations' } },
      { week: '6회차', topic: { ko: '사인·코사인 법칙과 응용', en: 'Law of Sines/Cosines & Applications' } },
      { week: '7회차', topic: { ko: '극좌표와 극방정식', en: 'Polar Coordinates & Polar Equations' } },
      { week: '8회차', topic: { ko: '매개변수 방정식', en: 'Parametric Equations' } },
      { week: '9회차', topic: { ko: '벡터와 행렬 연산', en: 'Vectors & Matrix Operations' } },
      { week: '10회차', topic: { ko: '수열, 급수, 이항정리', en: 'Sequences, Series & Binomial Theorem' } },
      { week: '11회차', topic: { ko: '극한의 직관적 이해 (미적분 미리보기)', en: 'Intuitive Understanding of Limits (Calculus Preview)' } },
      { week: '12회차', topic: { ko: '최종 평가 및 AP Calculus 준비', en: 'Final Assessment & AP Calculus Readiness' } }
    ]
  },

  // ── 5. AP Calculus BC ──
  {
    name: { ko: 'AP Calculus BC', en: 'AP Calculus BC' },
    description: { ko: 'AP Calculus BC 시험 완벽 대비', en: 'Complete AP Calculus BC Exam Preparation' },
    promo: {
      ko: '극한, 미분, 적분, 급수까지 AP Calculus BC 전 범위를 집중 학습하여 5점 만점을 목표로 합니다.',
      en: 'Intensively cover limits, differentiation, integration, and series across the full AP Calculus BC curriculum, targeting a perfect score of 5.'
    },
    highlights: [
      { ko: 'Limits & Continuity', en: 'Limits & Continuity' },
      { ko: 'Differentiation Techniques', en: 'Differentiation Techniques' },
      { ko: 'Integration & Applications', en: 'Integration & Applications' },
      { ko: 'Infinite Series (BC Only)', en: 'Infinite Series (BC Only)' }
    ],
    placement: { ko: 'Precalculus 이수자 (AB 범위 선행 학습 권장)', en: 'Precalculus completion (prior AB exposure recommended)' },
    weeklyPlan: [
      { week: '1회차', topic: { ko: '극한의 정의와 연속성', en: 'Limits & Continuity' } },
      { week: '2회차', topic: { ko: '도함수의 정의와 기본 미분법', en: 'Definition of Derivative & Basic Differentiation' } },
      { week: '3회차', topic: { ko: '연쇄법칙, 음함수 미분, 관련 변화율', en: 'Chain Rule, Implicit Differentiation, Related Rates' } },
      { week: '4회차', topic: { ko: '미분의 응용 (최적화, 평균값 정리)', en: 'Applications of Derivatives (Optimization, MVT)' } },
      { week: '5회차', topic: { ko: '정적분과 미적분의 기본정리', en: 'Definite Integrals & Fundamental Theorem of Calculus' } },
      { week: '6회차', topic: { ko: '적분 기법 (치환, 부분적분)', en: 'Integration Techniques (Substitution, Integration by Parts)' } },
      { week: '7회차', topic: { ko: '적분의 응용 (넓이, 부피, 호의 길이)', en: 'Applications of Integration (Area, Volume, Arc Length)' } },
      { week: '8회차', topic: { ko: '미분방정식과 로지스틱 모델', en: 'Differential Equations & Logistic Models' } },
      { week: '9회차', topic: { ko: '매개변수·극좌표 미적분', en: 'Parametric & Polar Calculus' } },
      { week: '10회차', topic: { ko: '무한급수와 수렴 판정법', en: 'Infinite Series & Convergence Tests' } },
      { week: '11회차', topic: { ko: '테일러·매클로린 급수', en: 'Taylor & Maclaurin Series' } },
      { week: '12회차', topic: { ko: 'AP 실전 모의고사 및 최종 리뷰', en: 'AP Practice Exam & Final Review' } }
    ]
  }
];

// ── 메인 실행 ────────────────────────────────────────────────

async function main() {
  console.log(`[seed] page id=${TARGET_PAGE_ID} 조회 중...`);

  const rows = await sql`SELECT id, slug, title, syllabus_data FROM schedule_pages WHERE id = ${TARGET_PAGE_ID}`;

  if (rows.length === 0) {
    console.error(`[seed] id=${TARGET_PAGE_ID} 페이지를 찾을 수 없습니다.`);
    console.log('[seed] 현재 등록된 페이지 목록:');
    const all = await sql`SELECT id, slug, title FROM schedule_pages ORDER BY id`;
    all.forEach(r => console.log(`  id=${r.id}  slug=${r.slug}  title=${r.title}`));
    process.exit(1);
  }

  console.log(`[seed] 대상: "${rows[0].title}" (slug=${rows[0].slug})`);

  const page = rows[0];
  const syllabusData = { subjects };

  console.log(`[seed] id=${page.id} 페이지에 ${subjects.length}과목 × 12회차 데이터 입력 중...`);

  await sql`UPDATE schedule_pages
    SET syllabus_data = ${JSON.stringify(syllabusData)}, updated_at = NOW()
    WHERE id = ${page.id}`;

  console.log('[seed] 완료! 과목 목록:');
  subjects.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.name.ko} (${s.weeklyPlan.length}회차)`);
  });

  await sql.end();
}

main().catch(err => {
  console.error('[seed] 오류:', err);
  process.exit(1);
});
