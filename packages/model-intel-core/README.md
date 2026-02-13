# model-intel-core

Pure utilities for:

- Normalizing OpenRouter model payloads into a stable application contract.
- Parsing Artificial Analysis benchmark payloads.
- Fuzzy matching model entries to benchmark entries.

## API

- `normalizeOpenRouterModel(...)`
- `tokenPriceToMillionPrice(...)`
- `extractProvider(...)`
- `normalizeModality(...)`
- `supportsVision(...)`
- `supportsAudio(...)`
- `supportsTools(...)`
- `supportsImageGeneration(...)`
- `supportsFileInput(...)`
- `supportsSearchCapability(...)`
- `parseBenchmarks(...)`
- `matchBenchmark(...)`

## Notes

- This package is intentionally framework-agnostic.
- It contains no Electron, browser storage, or UI concerns.
