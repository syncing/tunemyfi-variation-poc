# Pronunciation Dictionary UI Update

Step 4. Narration Script Review now includes a pronunciation dictionary editor.

## What changed

- Added `GET /api/pronunciation` to read `scripts/config/tts_pronunciation_ko.json`.
- Added `POST /api/pronunciation` to save pronunciation entries from the web UI.
- Added a Pronunciation Dictionary panel in Step 4.
- Added Add / Delete / Save Dictionary / Reload Dictionary controls.
- Rebuild Spoken Script now applies both:
  - product/brand pronunciation dictionary
  - digit pronunciation rules such as `1 → 원`, `2 → 투`

## Intended flow

1. Prepare Narration Script.
2. Add or edit pronunciation terms, such as:
   - `Apple` → `애플`
   - `AirPods` → `에어팟`
   - `Apple AirPods` → `애플 에어팟`
3. Save Dictionary.
4. Click Rebuild Spoken Script from Narration + Dictionary.
5. Manually fine-tune the Spoken Script if needed.
6. Save Edited Scripts.
7. Generate Dubbed Review Video.

Screen/card text is not changed by the dictionary. Only Spoken Script / TTS pronunciation is changed.
