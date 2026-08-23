# GeoSentiment Analyzer — Frontend

Frontend React, TypeScript, Vite, Tailwind CSS, dan Recharts.

## Development

```powershell
npm install
npm run dev
```

Vite meneruskan `/api` dan `/health` ke `http://127.0.0.1:8001`. Jika backend
berada di host lain, salin `.env.example` menjadi `.env.local` lalu isi
`VITE_API_BASE_URL`.

Jika `VITE_API_BASE_URL` kosong, frontend memakai origin yang sama. Tidak ada
URL ngrok bawaan; URL tunnel deployment harus diberikan secara eksplisit.

## Pemeriksaan

```powershell
npm run lint
npm run build
```
