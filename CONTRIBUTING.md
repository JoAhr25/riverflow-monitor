# Contributing to RiverFlow Monitor

Thanks for your interest in improving this research project.

## Getting started

1. Fork the repository and clone your fork.
2. Follow the [README](README.md) installation steps (backend: `pip install -r backend/requirements.txt`, frontend: `npm install`).
3. Verify everything works before changing anything:
   - `python -m pytest backend/tests -q`
   - `cd frontend && npm run build`

## Ground rules

- **Scientific integrity is non-negotiable.** Never present simulated values as
  real measurements, image-space pixels as m/s, or uncalibrated output as
  discharge. Demo/mock data must always be labeled.
- **Fix root causes, not symptoms.** No suppressing errors, deleting failing
  tests, or hardcoding values to make the UI look complete.
- **Keep the processing pipeline real-time.** Anything added to the per-frame
  loop should be justified with measurements (the loop currently runs at
  ~25 fps on 1080p input).

## Making changes

- Frontend: TypeScript is strict — `npm run build` must pass with zero errors.
- Backend: add/extend pytest coverage for new endpoints or processing changes.
- Keep components small and reuse the existing design system tokens
  (`frontend/src/index.css`) rather than introducing ad-hoc colors.
- Commit messages: short imperative summary, e.g.
  `Add processing resolution cap for 4K inputs`.

## Submitting

1. Create a feature branch (`git checkout -b my-change`).
2. Commit with a clear message; include test updates in the same commit.
3. Open a pull request against `main` describing what changed and how it was
   verified (commands run + results).
