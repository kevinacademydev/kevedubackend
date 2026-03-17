/**
 * 2026 Summer Science & CS Schedule Seed Script
 *
 * Inserts a new schedule page for the summer science/CS bootcamp.
 */
require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

const OWNER_ID = 1;

// ============================================================
// Header Data
// ============================================================
const headerData = {
  programTitle: {
    ko: "2026 여름방학 과학·CS 특강",
    en: "2026 Summer Science & CS Bootcamp"
  },
  subtitle: {
    ko: "8주 집중 프로그램 (6/15 – 8/9)",
    en: "Intensive 8-Week Program (6/15 – 8/9)"
  },
  description: {
    ko: "AP Science, USACO, ACSL, USNCO 등 과학·컴퓨터과학 분야의 심화 수업을 제공합니다.",
    en: "Advanced courses in AP Science, USACO, ACSL, USNCO and more."
  },
  cards: [
    { title: { ko: "Session A", en: "Session A" }, desc: { ko: "6/15 – 7/12 (4주)", en: "6/15 – 7/12 (4 weeks)" } },
    { title: { ko: "Session B", en: "Session B" }, desc: { ko: "7/13 – 8/9 (4주)", en: "7/13 – 8/9 (4 weeks)" } }
  ],
  highlights: [
    { ko: "AP Chemistry / AP Physics 1", en: "AP Chemistry / AP Physics 1" },
    { ko: "USACO Bronze & Silver", en: "USACO Bronze & Silver" },
    { ko: "ACSL Theory Intensive", en: "ACSL Theory Intensive" },
    { ko: "AP Physics C: Mechanics & E&M", en: "AP Physics C: Mechanics & E&M" }
  ]
};

// ============================================================
// Schedule Data - Two schedules (Session A & Session B)
// ============================================================
const commonBlocks = [
  // Tue/Thu evening - USACO
  { day: "화", start: "19:00", end: "22:00", subject: { ko: "USACO Bronze / Silver", en: "USACO Bronze / Silver" }, color: "#F39C12" },
  { day: "목", start: "19:00", end: "22:00", subject: { ko: "USACO Bronze / Silver", en: "USACO Bronze / Silver" }, color: "#F39C12" },
  // Sat
  { day: "토", start: "10:00", end: "12:00", subject: { ko: "ACSL Theory Intensive", en: "ACSL Theory Intensive" }, color: "#1ABC9C" },
  { day: "토", start: "12:30", end: "14:30", subject: { ko: "USNCO Local Concept Intensive", en: "USNCO Local Concept Intensive" }, color: "#2ECC71" },
  { day: "토", start: "15:00", end: "18:00", subject: { ko: "Honors Physics", en: "Honors Physics" }, color: "#9B59B6" },
  { day: "토", start: "19:00", end: "22:00", subject: { ko: "AP Physics C: Mechanics", en: "AP Physics C: Mechanics" }, color: "#E74C3C" },
  // Sun
  { day: "일", start: "10:00", end: "12:00", subject: { ko: "ACSL Theory Intensive", en: "ACSL Theory Intensive" }, color: "#1ABC9C" },
  { day: "일", start: "12:30", end: "14:30", subject: { ko: "USNCO Local Concept Intensive", en: "USNCO Local Concept Intensive" }, color: "#2ECC71" },
  { day: "일", start: "15:00", end: "18:00", subject: { ko: "Honors Chemistry", en: "Honors Chemistry" }, color: "#E67E22" },
  { day: "일", start: "19:00", end: "22:00", subject: { ko: "AP Physics C: E&M", en: "AP Physics C: E&M" }, color: "#C0392B" },
];

const scheduleData = {
  schedules: [
    {
      id: "s_sci_session_a",
      title: { ko: "Session A", en: "Session A" },
      dateRange: { start: "2026-06-15", end: "2026-07-12" },
      days: ["월", "화", "수", "목", "금", "토", "일"],
      blocks: [
        // Mon/Wed/Fri - AP Chemistry (Session A)
        { day: "월", start: "19:00", end: "22:00", subject: { ko: "AP Chemistry", en: "AP Chemistry" }, color: "#3498DB" },
        { day: "수", start: "19:00", end: "22:00", subject: { ko: "AP Chemistry", en: "AP Chemistry" }, color: "#3498DB" },
        { day: "금", start: "19:00", end: "22:00", subject: { ko: "AP Chemistry", en: "AP Chemistry" }, color: "#3498DB" },
        ...commonBlocks
      ]
    },
    {
      id: "s_sci_session_b",
      title: { ko: "Session B", en: "Session B" },
      dateRange: { start: "2026-07-13", end: "2026-08-09" },
      days: ["월", "화", "수", "목", "금", "토", "일"],
      blocks: [
        // Mon/Wed/Fri - AP Physics 1 (Session B)
        { day: "월", start: "19:00", end: "22:00", subject: { ko: "AP Physics 1", en: "AP Physics 1" }, color: "#8E44AD" },
        { day: "수", start: "19:00", end: "22:00", subject: { ko: "AP Physics 1", en: "AP Physics 1" }, color: "#8E44AD" },
        { day: "금", start: "19:00", end: "22:00", subject: { ko: "AP Physics 1", en: "AP Physics 1" }, color: "#8E44AD" },
        ...commonBlocks
      ]
    }
  ]
};

// ============================================================
// Syllabus Data
// ============================================================
const syllabusData = {
  subjects: [
    // 1. AP Chemistry (12 sessions: MWF × 4 weeks)
    {
      name: { ko: "AP Chemistry", en: "AP Chemistry" },
      description: {
        ko: "College Board AP Chemistry 커리큘럼에 기반한 대학 수준의 화학 과정입니다.",
        en: "College-level chemistry course based on the College Board AP Chemistry curriculum."
      },
      promo: {
        ko: "AP Chemistry 시험 5점을 목표로 체계적으로 준비합니다.",
        en: "Systematic preparation targeting a score of 5 on the AP Chemistry exam."
      },
      placement: {
        ko: "Honors Chemistry 이수자 또는 동등 수준",
        en: "Honors Chemistry completion or equivalent"
      },
      highlights: [
        { ko: "Atomic Structure & Periodicity", en: "Atomic Structure & Periodicity" },
        { ko: "Chemical Bonding & Reactions", en: "Chemical Bonding & Reactions" },
        { ko: "Thermodynamics & Equilibrium", en: "Thermodynamics & Equilibrium" },
        { ko: "Acids, Bases & Electrochemistry", en: "Acids, Bases & Electrochemistry" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "원자 구조와 주기적 성질", en: "Atomic Structure & Periodic Properties" } },
        { week: "2회차", topic: { ko: "분자·이온 결합 구조", en: "Molecular & Ionic Compound Structure" } },
        { week: "3회차", topic: { ko: "분자간 힘과 물질의 성질", en: "Intermolecular Forces & Properties of Matter" } },
        { week: "4회차", topic: { ko: "화학 반응과 양론", en: "Chemical Reactions & Stoichiometry" } },
        { week: "5회차", topic: { ko: "반응 속도론 (Kinetics)", en: "Chemical Kinetics" } },
        { week: "6회차", topic: { ko: "열역학 (Thermodynamics)", en: "Thermodynamics" } },
        { week: "7회차", topic: { ko: "화학 평형 (Equilibrium)", en: "Chemical Equilibrium" } },
        { week: "8회차", topic: { ko: "산-염기 화학", en: "Acids & Bases" } },
        { week: "9회차", topic: { ko: "열역학 응용과 자유 에너지", en: "Applications of Thermodynamics & Free Energy" } },
        { week: "10회차", topic: { ko: "전기화학과 산화-환원", en: "Electrochemistry & Redox Reactions" } },
        { week: "11회차", topic: { ko: "AP 시험 실전 연습 (1)", en: "AP Exam Practice (1)" } },
        { week: "12회차", topic: { ko: "AP 시험 실전 연습 (2)", en: "AP Exam Practice (2)" } }
      ]
    },

    // 2. AP Physics 1 (12 sessions: MWF × 4 weeks)
    {
      name: { ko: "AP Physics 1", en: "AP Physics 1" },
      description: {
        ko: "College Board AP Physics 1 커리큘럼에 기반한 대수 기반 물리학 과정입니다.",
        en: "Algebra-based physics course based on the College Board AP Physics 1 curriculum."
      },
      promo: {
        ko: "AP Physics 1 시험 5점을 목표로 핵심 개념과 문제풀이를 집중 학습합니다.",
        en: "Intensive study of core concepts and problem-solving targeting a score of 5."
      },
      placement: {
        ko: "Algebra II 이수자 또는 동등 수준",
        en: "Algebra II completion or equivalent"
      },
      highlights: [
        { ko: "Kinematics & Dynamics", en: "Kinematics & Dynamics" },
        { ko: "Energy, Momentum & Rotation", en: "Energy, Momentum & Rotation" },
        { ko: "Waves & Circuits", en: "Waves & Circuits" },
        { ko: "AP Exam Strategies", en: "AP Exam Strategies" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "운동학 (Kinematics)", en: "Kinematics" } },
        { week: "2회차", topic: { ko: "뉴턴의 법칙과 동역학", en: "Newton's Laws & Dynamics" } },
        { week: "3회차", topic: { ko: "원운동과 중력", en: "Circular Motion & Gravitation" } },
        { week: "4회차", topic: { ko: "일과 에너지", en: "Work & Energy" } },
        { week: "5회차", topic: { ko: "운동량과 충격량", en: "Momentum & Impulse" } },
        { week: "6회차", topic: { ko: "단진동 (Simple Harmonic Motion)", en: "Simple Harmonic Motion" } },
        { week: "7회차", topic: { ko: "돌림힘과 회전 운동", en: "Torque & Rotational Motion" } },
        { week: "8회차", topic: { ko: "전하와 전기력", en: "Electric Charge & Force" } },
        { week: "9회차", topic: { ko: "직류 회로 (DC Circuits)", en: "DC Circuits" } },
        { week: "10회차", topic: { ko: "역학적 파동과 소리", en: "Mechanical Waves & Sound" } },
        { week: "11회차", topic: { ko: "AP 시험 실전 연습 (1)", en: "AP Exam Practice (1)" } },
        { week: "12회차", topic: { ko: "AP 시험 실전 연습 (2)", en: "AP Exam Practice (2)" } }
      ]
    },

    // 3. USACO Bronze / Silver (16 sessions: Tue/Thu × 8 weeks)
    {
      name: { ko: "USACO Bronze / Silver", en: "USACO Bronze / Silver" },
      description: {
        ko: "USACO Bronze에서 Silver 승급을 목표로 하는 알고리즘 및 경시 프로그래밍 과정입니다.",
        en: "Competitive programming course targeting USACO Bronze to Silver promotion."
      },
      promo: {
        ko: "체계적인 알고리즘 학습과 실전 모의고사로 USACO 승급을 준비합니다.",
        en: "Prepare for USACO promotion with systematic algorithm study and mock contests."
      },
      placement: {
        ko: "기초 프로그래밍 (Python/C++/Java 중 하나) 가능자",
        en: "Basic programming ability in Python, C++, or Java"
      },
      highlights: [
        { ko: "Complete Search & Simulation", en: "Complete Search & Simulation" },
        { ko: "Graph Traversal (DFS/BFS)", en: "Graph Traversal (DFS/BFS)" },
        { ko: "Binary Search & Sorting", en: "Binary Search & Sorting" },
        { ko: "Basic Dynamic Programming", en: "Basic Dynamic Programming" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "경시 프로그래밍 입문 & I/O 처리", en: "Intro to Competitive Programming & I/O" } },
        { week: "2회차", topic: { ko: "완전 탐색 (Complete Search) & 시뮬레이션", en: "Complete Search & Simulation" } },
        { week: "3회차", topic: { ko: "정렬 & 탐색 알고리즘", en: "Sorting & Searching Algorithms" } },
        { week: "4회차", topic: { ko: "기본 자료구조 (배열, 문자열)", en: "Basic Data Structures (Arrays, Strings)" } },
        { week: "5회차", topic: { ko: "그리디 알고리즘", en: "Greedy Algorithms" } },
        { week: "6회차", topic: { ko: "구현 문제 & Ad Hoc", en: "Implementation & Ad Hoc Problems" } },
        { week: "7회차", topic: { ko: "재귀와 기초 그래프 이론", en: "Recursion & Basic Graph Theory" } },
        { week: "8회차", topic: { ko: "USACO Bronze 모의 대회", en: "USACO Bronze Mock Contest" } },
        { week: "9회차", topic: { ko: "표준 라이브러리 활용 (Silver)", en: "Standard Library & STL (Silver)" } },
        { week: "10회차", topic: { ko: "이분 탐색 & 투 포인터", en: "Binary Search & Two Pointers" } },
        { week: "11회차", topic: { ko: "DFS & BFS 그래프 탐색", en: "DFS & BFS Graph Traversal" } },
        { week: "12회차", topic: { ko: "Flood Fill & 연결 요소", en: "Flood Fill & Connected Components" } },
        { week: "13회차", topic: { ko: "누적합 & 차분 배열", en: "Prefix Sums & Difference Arrays" } },
        { week: "14회차", topic: { ko: "스택, 큐 & 우선순위 큐", en: "Stacks, Queues & Priority Queues" } },
        { week: "15회차", topic: { ko: "기초 동적 프로그래밍 (DP)", en: "Basic Dynamic Programming" } },
        { week: "16회차", topic: { ko: "USACO Silver 모의 대회", en: "USACO Silver Mock Contest" } }
      ]
    },

    // 4. ACSL Theory Intensive (16 sessions: Sat/Sun × 8 weeks)
    {
      name: { ko: "ACSL Theory Intensive", en: "ACSL Theory Intensive" },
      description: {
        ko: "ACSL (American Computer Science League) 대회 준비를 위한 이론 집중 과정입니다.",
        en: "Theory-intensive course preparing for ACSL competitions."
      },
      promo: {
        ko: "ACSL 전 카테고리를 체계적으로 학습하여 대회 고득점을 목표로 합니다.",
        en: "Systematically study all ACSL categories targeting high scores in competitions."
      },
      placement: {
        ko: "기초 컴퓨터 과학 지식 보유자",
        en: "Basic computer science knowledge required"
      },
      highlights: [
        { ko: "Number Systems & Boolean Algebra", en: "Number Systems & Boolean Algebra" },
        { ko: "LISP & Recursive Functions", en: "LISP & Recursive Functions" },
        { ko: "Assembly Language & FSA", en: "Assembly Language & FSA" },
        { ko: "Graph Theory & Data Structures", en: "Graph Theory & Data Structures" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "컴퓨터 수 체계 (Number Systems)", en: "Computer Number Systems" } },
        { week: "2회차", topic: { ko: "불 대수 (Boolean Algebra)", en: "Boolean Algebra" } },
        { week: "3회차", topic: { ko: "디지털 전자공학", en: "Digital Electronics" } },
        { week: "4회차", topic: { ko: "LISP 프로그래밍", en: "LISP Programming" } },
        { week: "5회차", topic: { ko: "재귀 함수 (Recursive Functions)", en: "Recursive Functions" } },
        { week: "6회차", topic: { ko: "비트 문자열 연산 (Bit-String Flicking)", en: "Bit-String Flicking" } },
        { week: "7회차", topic: { ko: "정규 표현식 (Regular Expressions)", en: "Regular Expressions" } },
        { week: "8회차", topic: { ko: "ACSL 모의 대회 (1)", en: "ACSL Practice Contest (1)" } },
        { week: "9회차", topic: { ko: "프로그램 해석 (What Does This Program Do?)", en: "What Does This Program Do?" } },
        { week: "10회차", topic: { ko: "어셈블리 언어 (Assembly Language)", en: "Assembly Language" } },
        { week: "11회차", topic: { ko: "유한 상태 기계 (FSA) 심화", en: "Finite State Automata (Advanced)" } },
        { week: "12회차", topic: { ko: "전위/중위/후위 표기법", en: "Pre/In/Post-fix Notation" } },
        { week: "13회차", topic: { ko: "그래프 이론 (Graph Theory)", en: "Graph Theory" } },
        { week: "14회차", topic: { ko: "자료구조 (Data Structures)", en: "Data Structures" } },
        { week: "15회차", topic: { ko: "디지털 전자공학 심화", en: "Digital Electronics (Advanced)" } },
        { week: "16회차", topic: { ko: "ACSL 모의 대회 (2)", en: "ACSL Practice Contest (2)" } }
      ]
    },

    // 5. USNCO Local Concept Intensive (16 sessions: Sat/Sun × 8 weeks)
    {
      name: { ko: "USNCO Local Concept Intensive", en: "USNCO Local Concept Intensive" },
      description: {
        ko: "USNCO (US National Chemistry Olympiad) Local 시험 대비 화학 심화 과정입니다.",
        en: "Advanced chemistry course preparing for the USNCO Local exam."
      },
      promo: {
        ko: "USNCO Local 시험의 핵심 개념을 집중적으로 다루며 실전 문제풀이를 훈련합니다.",
        en: "Intensive coverage of key concepts for USNCO Local with practice problem-solving."
      },
      placement: {
        ko: "Honors Chemistry 이수자 또는 AP Chemistry 병행 수강자",
        en: "Honors Chemistry or concurrent AP Chemistry enrollment"
      },
      highlights: [
        { ko: "Atomic Structure & Bonding", en: "Atomic Structure & Bonding" },
        { ko: "Thermochemistry & Kinetics", en: "Thermochemistry & Kinetics" },
        { ko: "Equilibrium & Acid-Base", en: "Equilibrium & Acid-Base" },
        { ko: "Electrochemistry & Organic", en: "Electrochemistry & Organic" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "원자 구조와 주기율표", en: "Atomic Structure & Periodicity" } },
        { week: "2회차", topic: { ko: "화학 결합과 분자 기하학", en: "Chemical Bonding & Molecular Geometry" } },
        { week: "3회차", topic: { ko: "양론과 용액", en: "Stoichiometry & Solutions" } },
        { week: "4회차", topic: { ko: "기체 법칙과 분자 운동론", en: "Gas Laws & Kinetic Molecular Theory" } },
        { week: "5회차", topic: { ko: "열화학과 열량 측정", en: "Thermochemistry & Calorimetry" } },
        { week: "6회차", topic: { ko: "화학 반응 속도론", en: "Chemical Kinetics" } },
        { week: "7회차", topic: { ko: "화학 평형", en: "Chemical Equilibrium" } },
        { week: "8회차", topic: { ko: "산-염기 화학", en: "Acid-Base Chemistry" } },
        { week: "9회차", topic: { ko: "완충 용액과 적정", en: "Buffers & Titrations" } },
        { week: "10회차", topic: { ko: "열역학과 엔트로피", en: "Thermodynamics & Entropy" } },
        { week: "11회차", topic: { ko: "전기화학", en: "Electrochemistry" } },
        { week: "12회차", topic: { ko: "핵화학", en: "Nuclear Chemistry" } },
        { week: "13회차", topic: { ko: "유기화학 기초", en: "Organic Chemistry Basics" } },
        { week: "14회차", topic: { ko: "배위 화학", en: "Coordination Chemistry" } },
        { week: "15회차", topic: { ko: "실험 기법과 안전", en: "Lab Techniques & Safety" } },
        { week: "16회차", topic: { ko: "USNCO Local 모의시험", en: "USNCO Local Practice Exam" } }
      ]
    },

    // 6. Honors Physics (8 sessions: Sat × 8 weeks)
    {
      name: { ko: "Honors Physics", en: "Honors Physics" },
      description: {
        ko: "고등 물리학의 핵심 개념을 심화 학습하는 Honors 수준 물리학 과정입니다.",
        en: "Honors-level physics course covering core concepts in depth."
      },
      promo: {
        ko: "AP Physics 진학을 위한 탄탄한 기초를 다집니다.",
        en: "Build a strong foundation for AP Physics advancement."
      },
      placement: {
        ko: "Algebra II 이수자 또는 동등 수준",
        en: "Algebra II completion or equivalent"
      },
      highlights: [
        { ko: "Mechanics & Energy", en: "Mechanics & Energy" },
        { ko: "Waves & Thermodynamics", en: "Waves & Thermodynamics" },
        { ko: "Rotational Motion", en: "Rotational Motion" },
        { ko: "Fluid Mechanics", en: "Fluid Mechanics" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "운동학: 1차원 & 2차원 운동", en: "Kinematics: Motion in 1D & 2D" } },
        { week: "2회차", topic: { ko: "뉴턴의 법칙과 응용", en: "Newton's Laws & Applications" } },
        { week: "3회차", topic: { ko: "일, 에너지, 보존 법칙", en: "Work, Energy & Conservation Laws" } },
        { week: "4회차", topic: { ko: "운동량과 충돌", en: "Momentum & Collisions" } },
        { week: "5회차", topic: { ko: "회전 운동과 돌림힘", en: "Rotational Motion & Torque" } },
        { week: "6회차", topic: { ko: "진동과 파동", en: "Oscillations & Waves" } },
        { week: "7회차", topic: { ko: "유체 역학과 열역학", en: "Fluid Mechanics & Thermodynamics" } },
        { week: "8회차", topic: { ko: "종합 복습 & 문제풀이", en: "Comprehensive Review & Problem-Solving" } }
      ]
    },

    // 7. Honors Chemistry (8 sessions: Sun × 8 weeks)
    {
      name: { ko: "Honors Chemistry", en: "Honors Chemistry" },
      description: {
        ko: "고등 화학의 핵심 개념을 심화 학습하는 Honors 수준 화학 과정입니다.",
        en: "Honors-level chemistry course covering core concepts in depth."
      },
      promo: {
        ko: "AP Chemistry 진학을 위한 탄탄한 화학 기초를 다집니다.",
        en: "Build a strong foundation for AP Chemistry advancement."
      },
      placement: {
        ko: "기초 화학 또는 Physical Science 이수자",
        en: "Introductory Chemistry or Physical Science completion"
      },
      highlights: [
        { ko: "Atomic Theory & Bonding", en: "Atomic Theory & Bonding" },
        { ko: "Stoichiometry & Reactions", en: "Stoichiometry & Reactions" },
        { ko: "States of Matter & Solutions", en: "States of Matter & Solutions" },
        { ko: "Acid-Base & Redox", en: "Acid-Base & Redox" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "원자 이론과 전자 배치", en: "Atomic Theory & Electron Configuration" } },
        { week: "2회차", topic: { ko: "화학 결합과 분자 구조", en: "Chemical Bonding & Molecular Structure" } },
        { week: "3회차", topic: { ko: "양론과 화학 반응", en: "Stoichiometry & Chemical Reactions" } },
        { week: "4회차", topic: { ko: "물질의 상태와 기체 법칙", en: "States of Matter & Gas Laws" } },
        { week: "5회차", topic: { ko: "용액과 농도", en: "Solutions & Concentration" } },
        { week: "6회차", topic: { ko: "열화학과 에너지 변화", en: "Thermochemistry & Energy Changes" } },
        { week: "7회차", topic: { ko: "산-염기 및 산화-환원 반응", en: "Acid-Base & Redox Reactions" } },
        { week: "8회차", topic: { ko: "종합 복습 & 문제풀이", en: "Comprehensive Review & Problem-Solving" } }
      ]
    },

    // 8. AP Physics C: Mechanics (8 sessions: Sat evening × 8 weeks)
    {
      name: { ko: "AP Physics C: Mechanics", en: "AP Physics C: Mechanics" },
      description: {
        ko: "미적분 기반의 대학 수준 역학 과정으로, AP Physics C: Mechanics 시험을 대비합니다.",
        en: "Calculus-based college-level mechanics course for the AP Physics C: Mechanics exam."
      },
      promo: {
        ko: "미적분을 활용한 심화 역학 학습으로 AP 시험 5점을 목표로 합니다.",
        en: "Target a score of 5 with calculus-based advanced mechanics."
      },
      placement: {
        ko: "AP Calculus AB/BC 이수 또는 병행 수강자",
        en: "AP Calculus AB/BC completion or concurrent enrollment"
      },
      highlights: [
        { ko: "Calculus-based Kinematics", en: "Calculus-based Kinematics" },
        { ko: "Newton's Laws & Diff. Equations", en: "Newton's Laws & Diff. Equations" },
        { ko: "Rotation & Moment of Inertia", en: "Rotation & Moment of Inertia" },
        { ko: "Oscillations & Gravitation", en: "Oscillations & Gravitation" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "미적분 기반 운동학", en: "Calculus-based Kinematics" } },
        { week: "2회차", topic: { ko: "뉴턴의 법칙과 미분방정식", en: "Newton's Laws & Differential Equations" } },
        { week: "3회차", topic: { ko: "일, 에너지, 일률", en: "Work, Energy & Power" } },
        { week: "4회차", topic: { ko: "입자계와 질량 중심", en: "Systems of Particles & Center of Mass" } },
        { week: "5회차", topic: { ko: "회전과 관성 모멘트", en: "Rotation & Moment of Inertia" } },
        { week: "6회차", topic: { ko: "진동과 만유인력", en: "Oscillations & Gravitation" } },
        { week: "7회차", topic: { ko: "AP 시험 자유 응답 연습", en: "AP Exam Free Response Practice" } },
        { week: "8회차", topic: { ko: "AP 시험 종합 모의고사", en: "AP Exam Full Practice & Review" } }
      ]
    },

    // 9. AP Physics C: E&M (8 sessions: Sun evening × 8 weeks)
    {
      name: { ko: "AP Physics C: E&M", en: "AP Physics C: E&M" },
      description: {
        ko: "미적분 기반의 대학 수준 전자기학 과정으로, AP Physics C: E&M 시험을 대비합니다.",
        en: "Calculus-based college-level E&M course for the AP Physics C: E&M exam."
      },
      promo: {
        ko: "전기장, 자기장, 맥스웰 방정식까지 체계적으로 학습합니다.",
        en: "Systematic study from electric fields to magnetic fields and Maxwell's equations."
      },
      placement: {
        ko: "AP Physics C: Mechanics 이수 또는 병행 수강, AP Calculus BC 권장",
        en: "AP Physics C: Mechanics completion or concurrent, AP Calculus BC recommended"
      },
      highlights: [
        { ko: "Electrostatics & Gauss's Law", en: "Electrostatics & Gauss's Law" },
        { ko: "Capacitance & DC Circuits", en: "Capacitance & DC Circuits" },
        { ko: "Magnetic Fields & Induction", en: "Magnetic Fields & Induction" },
        { ko: "Maxwell's Equations", en: "Maxwell's Equations" }
      ],
      weeklyPlan: [
        { week: "1회차", topic: { ko: "정전기학: 전하와 쿨롱의 법칙", en: "Electrostatics: Charge & Coulomb's Law" } },
        { week: "2회차", topic: { ko: "전기장과 가우스 법칙", en: "Electric Fields & Gauss's Law" } },
        { week: "3회차", topic: { ko: "전위와 축전기", en: "Electric Potential & Capacitance" } },
        { week: "4회차", topic: { ko: "전류, 저항, 직류 회로", en: "Current, Resistance & DC Circuits" } },
        { week: "5회차", topic: { ko: "자기장과 비오-사바르 법칙", en: "Magnetic Fields & Biot-Savart Law" } },
        { week: "6회차", topic: { ko: "앙페르 법칙과 전자기 유도", en: "Ampere's Law & Electromagnetic Induction" } },
        { week: "7회차", topic: { ko: "맥스웰 방정식과 전자기파", en: "Maxwell's Equations & EM Waves" } },
        { week: "8회차", topic: { ko: "AP 시험 종합 모의고사", en: "AP Exam Full Practice & Review" } }
      ]
    }
  ]
};

// ============================================================
// Theme Data
// ============================================================
const themeData = {
  heroBg: "#133327",
  accent: "#ffffff"
};

// ============================================================
// Insert into DB
// ============================================================
(async () => {
  try {
    // Find next slot number
    const existing = await sql`SELECT COALESCE(MAX(slot_number), 0) as max_slot FROM schedule_pages WHERE owner_id = ${OWNER_ID}`;
    const nextSlot = existing[0].max_slot + 1;

    const result = await sql`
      INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
      VALUES (
        ${OWNER_ID},
        ${nextSlot},
        ${'2026 여름방학 과학·CS 특강'},
        ${'2026summersci'},
        ${'published'},
        ${JSON.stringify(headerData)},
        ${JSON.stringify(scheduleData)},
        ${JSON.stringify(syllabusData)},
        ${JSON.stringify(themeData)}
      )
      RETURNING id, slot_number, slug
    `;

    console.log('Successfully inserted schedule page:', result[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
