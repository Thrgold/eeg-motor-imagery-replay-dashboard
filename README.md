# EEG Motor Imagery Replay and Visualization Prototype

A browser dashboard and Python WebSocket backend for replaying preprocessed EEG windows and visualizing model output.

## Scope

The backend replays local `*_preprocessed.npz` files; it does not acquire BioSemi signals. “Real-time” means timed replay. Browser mock data are synthetic. No accuracy, latency, rehabilitation, clinical-safety, or multimodal-fusion result is established.

## Structure

- `frontend/`: React dashboard loaded through CDN scripts.
- `backend/`: FastAPI/WebSocket replay server and CNN-BiLSTM model.
- `outputs/`: private checkpoints and outputs, excluded from Git.
- `biosemi128.elc`, `generate_electrodes.py`: coordinate resource and projection utility.

## Setup and checks

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
python check_project.py
```

The frontend requires Internet access for CDN dependencies. For the UI mock, serve `frontend/` on localhost port 5173. Mock predictions are for UI testing only.

For backend replay, explicitly set `BCI_STAGE1_WEIGHTS`, `BCI_STAGE2_WEIGHTS`, and `BCI_SESSION_DIR`, then run `uvicorn main_frontend:app --host 127.0.0.1 --port 8080` from `backend/`. Do not expose the unauthenticated development server to untrusted networks.

The reader expects trusted NPZ files and uses `allow_pickle=True`; never load untrusted files. The model assumes 128 channels, 100 samples and 100 Hz. Checkpoint channel order, preprocessing and class mapping require external verification.

`check_project.py` checks syntax, imports, a synthetic model forward pass and frontend file references. It does not reproduce training or empirical performance. Activation and report outputs are engineering summaries, not validated biomarkers or clinical assessments.

Raw EEG, participant data, checkpoints and generated reports are excluded. Check provenance and redistribution permission for the electrode file and checkpoints before licensing. No repository-wide open-source license is assigned yet. See `RELEASE_REVIEW.md`.
