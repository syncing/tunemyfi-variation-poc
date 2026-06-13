# Premium Video Style Update

## 변경 내용

### 1. 모던 폰트 우선순위
- Pretendard / Inter 계열이 설치되어 있으면 우선 사용합니다.
- 없으면 기존 Noto Sans CJK / Nanum 계열로 자동 폴백합니다.

권장 설치 예시:

```bash
sudo apt update
sudo apt install -y fonts-noto-cjk fonts-nanum fonts-inter
```

Pretendard는 Ubuntu 기본 apt에 없는 경우가 많으므로, 서버에 별도 설치하면 자동 인식합니다.

### 2. 프리미엄 카드 디자인
- 단순 흰색 박스 대신 어두운 반투명 글래스 카드로 변경했습니다.
- 카드 뒤에 은은한 그라데이션을 넣어 제품 이미지와 자막이 더 잘 분리됩니다.
- 하단 accent bar와 그림자를 넣어 더 유튜브 리뷰 영상처럼 보이게 했습니다.
- 롱폼/쇼츠를 자동 구분해 카드 크기와 위치를 다르게 잡습니다.

### 3. 카드 애니메이션
- 카드가 갑자기 뜨지 않고 fade-in / fade-out 됩니다.

### 4. 영상 톤 보정
- 각 이미지 장면에 약한 contrast / saturation / sharpening / vignette를 적용했습니다.
- 과하지 않게 제품 리뷰 영상 느낌만 살리는 수준입니다.

### 5. 외부 무료 BGM 파일 우선 사용 구조
- 아래 위치에 저작권 문제가 없는 무료/라이선스 확보 BGM 파일을 넣으면 생성형 BGM 대신 우선 사용합니다.

```text
web/data/bgm/default.mp3
web/data/bgm/shorts.mp3
web/public/bgm/default.mp3
web/public/bgm/shorts.mp3
```

지원 확장자:

```text
mp3, m4a, wav, flac, ogg
```

- 파일이 없으면 기존처럼 프로그램 생성 BGM을 사용합니다.
