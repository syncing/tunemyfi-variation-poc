# BGM Style + Text Card Update

## 변경 내용

- 기본 BGM을 bright(밝고 경쾌한) 스타일로 변경했습니다.
- BGM 코드 생성 로직에 8마디 코드 진행, 아르페지오, 가벼운 펄스 리듬, shimmer 변화를 추가했습니다.
- Step 5에서 BGM 분위기와 볼륨을 선택할 수 있습니다.
- 선택값은 `bgmMood`, `bgmVolume`으로 workflow-state에 저장되고 worker가 Python 스크립트에 전달합니다.
- 텍스트 카드에서 체크 표시를 제거했습니다.
- 장면별 카드 문장을 2줄 정도의 짧고 선명한 문장으로 제한했습니다.

## BGM Mood 옵션

- bright: 밝고 경쾌한 기본값
- warm: 따뜻하고 편안함
- premium: 고급스럽고 차분함
- tech: 전자적이고 세련됨
- calm: 아주 은은하고 조용함
- auto: 리뷰 내용 기반 자동 판단

## BGM Volume 옵션

- 0.06: 아주 작게
- 0.09: 작게
- 0.12: 기본
- 0.16: 조금 더 들리게
- 0.22: 테스트용 크게
