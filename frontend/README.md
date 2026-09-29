# Synthora AI — frontend

React + TypeScript + Vite + Tailwind CSS (v4) + Lucide. One workspace: Input → Analyze → Plan → Generate → Validate → Export.
The API contract is `docs/API_CONTRACT.md`.

```bash
cp .env.example .env      # VITE_API_BASE_URL=http://127.0.0.1:8000
npm install
npm run dev               # http://127.0.0.1:5173
npm run build             # type-check + production build
```

Backend (separate terminal, from `backend/`): `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
