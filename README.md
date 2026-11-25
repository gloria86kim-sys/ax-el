# SAVE DKU | AX-EL Co-Define 워크숍 사이트

「AX 시대, 평가를 다시 쓰다」 워크숍 진행용 게임형 사이트임. 교수 15명이 다섯 스쿼드로 일곱 개 미션을 수행하면 입력 내용이 실시간으로 모여 영역별 AX 평가 가이드북 초안으로 자동 조립됨.

- 호스팅: GitHub Pages (정적 파일)
- 데이터 저장과 실시간 공유: Supabase (Postgres + Realtime)
- AI 코파일럿 LUMI: Supabase Edge Function을 거쳐 OpenAI API 호출 (API 키는 브라우저에 노출되지 않음)

## 파일 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 사이트 본체 |
| `config.js` | Supabase 주소와 anon key 설정 |
| `hero.webp`, `fonts/` | 첫 화면 이미지, 프리젠테이션 폰트 |
| `supabase/schema.sql` | 테이블, 보안 정책(RLS), 실시간 설정 |
| `supabase/functions/ai/index.ts` | OpenAI 프록시 함수 |

## 설정 순서

### 1. Supabase 프로젝트 만들기
1. supabase.com 에서 새 프로젝트를 만듦(리전은 Northeast Asia (Seoul) 권장)
2. SQL Editor에서 `supabase/schema.sql` 내용을 붙여 넣고, `CHANGE-ME`를 실제 워크숍 입장 코드로 바꾼 뒤 실행
3. Project Settings > API 에서 `Project URL`과 `anon public` 키를 복사해 `config.js`에 입력

### 2. AI 함수 배포
Supabase CLI가 설치된 컴퓨터에서 실행함.

```bash
supabase login
supabase link --project-ref <프로젝트 ref>
supabase secrets set OPENAI_API_KEY=sk-... WORKSHOP_CODE=<입장 코드> OPENAI_MODEL=<사용할 모델명>
# 선택: 힌트처럼 짧은 응답용 경량 모델
supabase secrets set OPENAI_MODEL_QUICK=<경량 모델명>
supabase functions deploy ai
```

- `OPENAI_MODEL`에는 사용하는 OpenAI 계정에서 호출 가능한 모델명을 넣음
- `WORKSHOP_CODE`는 schema.sql에 넣은 코드와 같아야 함
- OpenAI 대시보드에서 월 사용 한도(Usage limit)를 설정해 두기를 권장함

### 3. GitHub Pages 켜기
저장소 Settings > Pages > Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 지정함.

### 4. 도메인 연결(구매 후)
1. 저장소 Settings > Pages > Custom domain에 도메인 입력(저장소에 `CNAME` 파일이 생성됨)
2. 도메인 구매처 DNS에 레코드 추가
   - 루트 도메인: A 레코드 4개 `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` 등 하위 도메인: CNAME 레코드 → `gloria86kim-sys.github.io`
3. DNS 반영 후 `Enforce HTTPS` 체크

## 워크숍 운영

- 참가자 안내 링크: `https://<도메인>/?code=<입장 코드>` 형태로 배포하면 코드가 자동 저장됨
- 코드 없이 접속하면 내용은 그 기기에만 저장되고 서버에는 저장되지 않음
- 리허설 데이터 초기화: Supabase SQL Editor에서 `truncate public.ws;` 실행
- 결과 백업: Table Editor에서 `ws` 테이블을 CSV로 내보내기, 또는 사이트의 가이드북 랩에서 .md/.html 내려받기

## 보안상 유의점

- 읽기는 공개, 쓰기는 입장 코드가 맞을 때만 허용됨. 사이트 주소와 코드를 아는 사람은 내용을 읽을 수 있으므로 민감한 개인정보는 입력하지 않도록 안내함
- 입장 코드는 워크숍 종료 후 `ws_config`와 함수 Secret 모두에서 변경하거나, 프로젝트를 일시 중지함
