# Release review

## Changes

- Renamed project components and utilities in English.
- Corrected acquisition claims: the backend replays arrays and does not connect to an amplifier.
- Excluded checkpoints, data, reports, caches and bytecode from Git.
- Removed personal defaults and required explicit data/checkpoint paths.
- Limited model exports to the CNN-BiLSTM implementation actually present.
- Disabled wildcard credentialed CORS and changed checkpoint loading to tensor-only deserialization.
- Added structural checks with synthetic inputs; no empirical result is claimed.
- Removed a fabricated 1500 ms latency placeholder from the activation score.
- Documented that `filtfilt` is window-level noncausal filtering and cannot establish causal online operation.

## Remaining limitations

Training code, frozen preprocessing, checkpoint metadata, participant-level evaluation and measured latency are absent. Visual summaries are heuristics, not validated biomarkers. CDN compilation and an unauthenticated WebSocket make this a local prototype. Hardware, security, clinical and cross-machine tests were not completed.

## PI assessment

Suitable as a transparent full-stack prototype portfolio, not evidence of a validated multimodal BCI, medical device or publishable decoding algorithm. Add training and evaluation provenance before reporting accuracy or distributing checkpoints.
