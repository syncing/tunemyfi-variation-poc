# Card Compact Width + Algorithmic Open Composer BGM Update

## 변경 요약

- 장면별 텍스트 카드의 좌우 폭을 고정 88%에서 내용 기반 가변 폭으로 변경했습니다.
- 카드가 내용보다 과도하게 넓어 보이지 않도록 실제 제목/본문 줄 폭을 계산해 카드 폭을 동적으로 결정합니다.
- 카드 최대 폭은 화면의 약 76%, 최소 폭은 약 46%로 제한했습니다.
- 기존 단순 반복형 BGM을 더 다채로운 algorithmic-open-composer 방식으로 개선했습니다.
- 외부 음원 없이 Python WAV 합성으로 생성하지만, MIDI 시퀀서/오픈소스 생성기처럼 A/B/A/C 섹션, 코드 진행 변화, 베이스, 벨 리드, 드럼/하이햇, 브리지 필을 포함합니다.

## 기대 효과

- 텍스트 박스 좌우 여백이 줄어 더 방송용 자막 카드처럼 보입니다.
- 카드가 내용 길이에 따라 자연스럽게 줄어듭니다.
- BGM이 단순 패드 반복에서 벗어나 밝고 경쾌하게 계속 변화합니다.
- BGM Mood/Volume UI는 기존대로 유지됩니다.

## 생성 결과

`bgm_plan.json`에는 다음 항목이 추가됩니다.

```json
{
  "generator": "algorithmic-open-composer",
  "arrangement": "A/B/A/C sections + chord progression + bass + bell lead + light rhythm"
}
```
