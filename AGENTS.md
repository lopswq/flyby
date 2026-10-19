# 프로젝트 구조

```text
flyby/
├── AGENTS.md                         # Codex 프로젝트 지침과 구조
├── docs/
│   ├── README.md                     # 프로젝트 개요·문서 목차·실행 안내
│   ├── resources/                    # 발표 원자료와 개인 작성 문서
│   │   ├── textbook/                 # 교과서 본문 사진
│   │   ├── content.md                # 발표 내용
│   │   ├── script.md                 # 발표 대본
│   │   └── summary.md                # 본문 및 개념 정리
│   └── md/                           # 기획·설계 문서
│       ├── codex_start.md             # CLI HTML 제작 시작 지시서
│       ├── flyby_presentation_plan.md # 현재 발표 구상 전체
│       ├── animation.md              # 초기 v1 요구사항 원문
│       ├── requirements.md           # 개인 작성용 요구사항 문서
│       ├── plan.md                   # 개인 작성용 개발 계획 문서
│       ├── design.md                 # 개인 작성용 디자인 문서
│       └── progress.md               # 개인 작성용 진행 기록 문서
├── presentation/                     # 전체 HTML 발표 구현 위치
│   ├── index.html
│   ├── css/
│   └── js/
└── simulations/                      # 단일 장면 프로토타입
    ├── v1/
    │   ├── flyby.html                # 이전 시뮬레이션형 버전
    │   └── check-physics.cjs         # v1 물리 계산 검사
    └── v2/
        └── index.html               # 발표용 자동 반복 버전
```

- 발표 전체 기획의 기준은 `docs/md/flyby_presentation_plan.md`임.
- `docs/md/animation.md`는 초기 v1 요구사항 원문임. 현재 발표 기획과 혼동하지 않음.
- `simulations/`의 버전은 단일 장면 시안임. 전체 발표는 `presentation/`에서 구현함.
- 개인 작성용 빈 문서는 사용자 요청 없이 채우거나 삭제하지 않음.

## HTML 발표 제작 시작

- 사용자가 `docs/md/codex_start.md`를 읽고 진행하라고 요청하면 해당 문서와 발표 계획서를 읽고 지정된 HTML 제작 범위를 수행함.
- 시작 요청은 해당 문서에 명시된 구현 범위의 착수 승인으로 취급함. 작업 방향을 설명한 뒤 같은 범위의 승인을 반복해서 묻지 않음.
- 시작 문서의 존재만으로 HTML 제작을 시작하지 않음. 문서 검토·수정 요청은 제작 착수 요청과 구분함.
- 발표 계획서는 내용과 흐름의 기준임. 시작 문서는 구현 순서·범위·검사·완료 기준임.
- 삭제·이동·새 의존성·Git 초기화 등 시작 문서 범위 밖 변경은 별도로 판단함.