
# Product Requirements Document (PRD)

**Project Name:** GeoSentiment Analyzer
**Document Version:** 1.0
**Target Platform:** Web Application (Localhost Optimized / Docker-Ready)
**Design System:** Google Material Design (Clean, Minimalist, Professional)

## 1. Product Overview

GeoSentiment Analyzer adalah mesin analitik spasial berbasis web yang mengekstrak dan menganalisis ulasan lokasi dari Google Maps secara *real-time*. Platform ini berfokus pada kecepatan dan ketepatan pemrosesan Bahasa Alami (NLP) untuk mengubah teks ulasan mentah menjadi wawasan bisnis yang terstruktur, tanpa membebani penyimpanan lokal.

## 2. Core Features (MVP)

### 2.1. Dynamic Input & Real-Time Tracking

* Kolom pencarian bergaya Google Search untuk menempelkan tautan URL Google Maps.
* **Live Extraction Tracker (Progress Bar):** Indikator visual dan *countdown* (hitung mundur) waktu estimasi yang memberi tahu pengguna proses penarikan data (misal: "Mengekstrak ulasan 45/100...").

### 2.2. Modul Analisis Sentimen (100 Ulasan On-The-Fly)

* Mesin mengekstrak maksimal 100 ulasan terbaru/terpilih dari URL target.
* Inferensi menggunakan model IndoBERT untuk membedah teks ke dalam 3 kategori sentimen: Positif, Negatif, dan Netral.
* Data diproses secara *on-the-fly* dan langsung dihapus dari memori setelah sesi berakhir (Stateless Architecture).

### 2.3. Dasbor Analitik & Wawasan Mendalam

* **Sentiment Overview:** Diagram *Donut/Pie* dengan persentase dominasi sentimen.
* **Top & Bottom Reviews:** Menampilkan 5 daftar ulasan paling positif (Terbaik) dan 5 ulasan paling negatif (Terburuk) secara lengkap.
* **Anomaly Detection (Bonus Portfolio Feature):** Sistem secara otomatis menyorot anomali data (misal: ulasan dengan Bintang 5 tetapi IndoBERT mendeteksi teks bersentimen sangat Negatif, indikasi sarkasme atau *spam*).
* **Keyword Cloud:** Daftar kata/frasa yang paling sering muncul di keluhan atau pujian pelanggan.

## 3. UI/UX Specifications (Google Tone)

* **Warna Utama:** Latar belakang putih (`#FFFFFF`) dipadu dengan abu-abu sangat terang (`#F8F9FA`).
* **Aksen (Google Brand Colors):**
  * Blue (`#4285F4`) untuk elemen interaktif utama.
  * Red (`#EA4335`) untuk sentimen negatif.
  * Yellow (`#FBBC05`) untuk sentimen netral / anomali.
  * Green (`#34A853`) untuk sentimen positif.
* **Tipografi:** Roboto atau Google Sans, tebal di bagian tajuk, bersih dan sangat terbaca pada teks ulasan.
* **Komponen:** Menggunakan bayangan lembut (*soft shadows*) dan batas membulat tipis layaknya kartu (*cards*) pada Google Workspace.

## 4. Technical Architecture

### 4.1. Frontend (Client-Side)

* **Framework:** React 18+ (dengan Vite).
* **Styling:** Tailwind CSS (dengan palet warna kustom Google).
* **Komunikasi Data:** Menggunakan Server-Sent Events (SSE) atau WebSockets untuk menerima pembaruan *Progress Bar* secara *real-time* dari server.
* **Charting:** Recharts atau Chart.js.

### 4.2. Backend (Server-Side)

* **Framework:** Python FastAPI.
* **Scraper Engine:** Playwright (Mode *Headless* untuk menggulir dan menarik 100 ulasan DOM Google Maps).
* **NLP Pipeline:** Hugging Face `transformers` (IndoBERT) untuk analisis sentimen, NLTK/SpaCy untuk ekstraksi kata kunci.
* **Database:** TIDAK ADA. Sepenuhnya menggunakan RAM (*In-Memory processing*).
