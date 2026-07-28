# GeoSentiment Analyzer

Aplikasi lokal untuk mengambil hingga 100 ulasan Google Maps, menganalisis
sentimennya dengan IndoBERT, dan menampilkan statistik, kata kunci, ulasan
teratas, serta potensi anomali rating. Antarmuka menggunakan bahasa Inggris;
teks ulasan asli dipertahankan dan ditampilkan bersama terjemahan Inggris.

## Persyaratan

- Windows 10/11
- Node.js 20 atau lebih baru
- Python 3.11
- Koneksi internet pada penggunaan pertama untuk Chromium, model IndoBERT,
  dan model terjemahan Indonesia–Inggris

Virtual environment tidak disimpan di repository. Jangan menyalin folder
`venv` dari komputer lain karena path interpreter di dalamnya tidak portable.

## Setup backend dengan uv

Jalankan dari folder proyek:

```powershell
$env:UV_CACHE_DIR = "$PWD\.uv-cache"
$env:UV_PYTHON_INSTALL_DIR = "$PWD\.uv-python"
uv python install 3.11.9
uv venv backend\.venv --python 3.11.9
uv pip install --python backend\.venv\Scripts\python.exe -r backend\requirements.txt
backend\.venv\Scripts\python.exe -m playwright install chromium
```

Kemudian:

```powershell
Copy-Item .env.example .env
Set-Location backend
.\.venv\Scripts\python.exe main.py
```

Model IndoBERT diunduh saat backend pertama kali dimulai. Model terjemahan
`Helsinki-NLP/opus-mt-id-en` diunduh ketika analisis pertama memerlukan
terjemahan, kemudian digunakan dari cache lokal. Endpoint health:
`http://127.0.0.1:8001/health`.

### Jika Google Maps menampilkan “tampilan terbatas”

Google dapat menyembunyikan ulasan untuk sesi signed-out atau trafik yang
dianggap tidak biasa. Buat profil browser lokal satu kali:

```powershell
backend\.venv\Scripts\python.exe backend\google_maps_session.py
```

Login secara manual pada jendela Chromium, pastikan ulasan terlihat, kemudian
tekan Enter di terminal. Profil disimpan di `.browser-profile` dan diabaikan
Git. Aplikasi tidak membaca atau menyimpan kata sandi; autentikasi sepenuhnya
dilakukan di halaman Google.

Pastikan `.env` berisi:

```text
PLAYWRIGHT_USER_DATA_DIR=.browser-profile
```

## Input dan foto lokasi

Aplikasi hanya menerima tautan resmi Google Maps agar lokasi yang dianalisis
tidak ambigu. Nama, alamat, koordinat, dan foto utama lokasi dibaca dari halaman
Google Maps yang sama ketika scraper berjalan. Jika foto tidak tersedia, kartu
lokasi menampilkan pratinjau peta berdasarkan koordinat yang ditemukan.

Google Places API tidak diperlukan untuk alur ini.

## Setup frontend

Pada terminal kedua:

```powershell
Set-Location frontend
npm install
npm run dev
```

Buka `http://localhost:5173`, lalu tempel URL penuh Google Maps atau short link
`https://maps.app.goo.gl/...`.

## Test

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v

# Pemeriksaan live scraper (opsional)
.\.venv\Scripts\python.exe .\manual_scraper_check.py "https://www.google.com/maps/place/Plaza+Indonesia" --max-reviews 10

# Pemeriksaan end-to-end API + SSE + IndoBERT (opsional, hingga MAX_REVIEWS)
.\.venv\Scripts\python.exe .\manual_api_check.py "https://www.google.com/maps/place/Plaza+Indonesia"

Set-Location ..\frontend
npm run lint
npm run build
```

## Catatan operasional

- Endpoint dibatasi per IP dan hanya menjalankan sejumlah job sesuai
  `MAX_CONCURRENT_JOBS`.
- URL non-Google Maps ditolak sebelum browser dibuka.
- Chromium sandbox tetap aktif secara default.
- Data ulasan hanya berada di memori selama sesi.
- Scraping antarmuka web dapat terpengaruh perubahan DOM dan kebijakan Google.
  Tinjau persyaratan penggunaan dan atribusi sebelum deployment publik.
