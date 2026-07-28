
# Implementation Plan

**Project:** GeoSentiment Analyzer

## Phase 1: Setup & UI Foundation

* [x] Menginisiasi proyek React menggunakan Vite (`npm create vite@latest`).
* [x] Mengonfigurasi Tailwind CSS dengan kode *hex* warna spesifik Google (Biru, Merah, Kuning, Hijau).
* [x] Membangun antarmuka utama (Halaman Pencarian URL) yang bersih layaknya beranda Google.
* [x] Membangun *layout* Dasbor Analitik dengan diagram Donut, daftar Top 5, kata kunci, dan Anomali.
* [x] Menginisiasi *backend* FastAPI dengan arsitektur modular.

## Phase 2: Mesin Scraper & Real-Time Connection

Fase ini berfokus pada ekstraksi 100 data ulasan tanpa membuat antarmuka *browser* membeku (*freeze*).

* [x] Membangun scraper Playwright dengan navigasi nama/URL, lazy-load scrolling, timeout, cleanup, serta deteksi mode terbatas Google Maps.
* [x] Membangun endpoint FastAPI menggunakan **Server-Sent Events (SSE)** dengan status progres terstruktur.
* [x] Menghubungkan progress bar, hitungan ulasan, durasi, estimasi, pembatalan, dan error state di React.

## Phase 3: NLP Pipeline & Logic

Mengubah teks mentah menjadi metrik terstruktur.

* [x] Mengintegrasikan pustaka `transformers` dan model IndoBERT ke environment Python lokal.
* [x] Menerapkan normalisasi input dan tokenizer truncation tanpa menghilangkan informasi sentimen penting seperti emoji.
* [x] Memproses ulasan melalui IndoBERT secara batch dan menghasilkan skor sentimen (0.0 hingga 1.0).
* [x] Membangun algoritma filter data:
  * Mengurutkan untuk mencari "Top 5" dan "Bottom 5".
  * Menulis logika perbandingan sederhana (*Rating* vs *Sentiment Score*) untuk mendeteksi *Anomaly*.
  * Menggunakan `collections.Counter` atau TF-IDF sederhana untuk mengekstrak kata kunci paling dominan.

## Phase 4: Integrasi Akhir & Visualisasi

* [x] Menyusun respons JSON akhir dari FastAPI yang berisi rekapitulasi total dan metadata model.
* [x] Menyambungkan respons SSE tersebut ke state React dengan validasi struktur runtime.
* [x] Me-render Recharts berdasarkan kalkulasi sentimen dan persentase.
* [x] Membersihkan data sesi dan menjalankan garbage collection ketika kueri selesai.
* [x] Melakukan stress test 100 ulasan setelah profil Google Maps lokal sudah login dan tidak lagi menerima “tampilan terbatas”.
