# GeoSentiment Analyzer: Real-Time Google Maps Review Analytics

A full-stack, real-time analytics dashboard engineered to extract, process, and analyze Google Maps reviews using state-of-the-art NLP models.

![Python](https://img.shields.io/badge/Python-3.11-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.95%2B-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react)
![Playwright](https://img.shields.io/badge/Playwright-Scraping-2EAD33?style=flat-square&logo=playwright)
![Transformers](https://img.shields.io/badge/HuggingFace-Transformers-FFD21E?style=flat-square&logo=huggingface)

---

## Project Overview

GeoSentiment Analyzer provides an interactive, live look at public sentiment for any location on Google Maps. It integrates a custom headless browser scraper to extract up to 100 reviews in real-time, processes them through IndoBERT for sentiment classification, and translates the featured reviews to English locally. All insights are presented through a clean, responsive, and modern dashboard.

---

## Core Features

- **Real-Time Scraping:** Utilizes a highly resilient Playwright scraper with structural DOM fallback (rating-stars traversal) to bypass Google's aggressive A/B testing and class obfuscation.
- **Deep NLP Analysis:** Integrates HuggingFace Transformers (`mdhugol/indonesia-bert-sentiment-classification`) for accurate sentiment detection.
- **On-the-fly Translation:** Employs a local translation model (`Helsinki-NLP/opus-mt-id-en`) to translate featured Indonesian reviews into English without relying on paid APIs.
- **Anomaly Detection & Keyword Extraction:** Automatically detects conflicting reviews (e.g., 5-star rating with negative text) and extracts the most frequently used keywords.
- **Live Event Streaming (SSE):** The backend streams extraction and analysis progress to the frontend in real-time via Server-Sent Events.

---

## Technical Stack

- **Backend:** Python 3.11, FastAPI, SSE-Starlette
- **Scraping Engine:** Playwright (Chromium)
- **Machine Learning:** PyTorch, Transformers (IndoBERT)
- **Frontend:** React, Vite, Tailwind CSS, Recharts

---

## Getting Started

### Prerequisites

- Windows 10/11
- Node.js 20 or newer
- Python 3.11
- Internet connection (required on first run to download Chromium and NLP models)

### Installation & Setup

**1. Clone the repository:**

```bash
git clone https://github.com/LaboNapitupulu/location-sentiment_analyzer.git
cd location-sentiment_analyzer
```

**2. Setup Backend Dependencies (using `uv`):**

```powershell
$env:UV_CACHE_DIR = "$PWD\.uv-cache"
$env:UV_PYTHON_INSTALL_DIR = "$PWD\.uv-python"
uv python install 3.11.9
uv venv backend\.venv --python 3.11.9
uv pip install --python backend\.venv\Scripts\python.exe -r backend\requirements.txt
backend\.venv\Scripts\python.exe -m playwright install chromium
```

**3. Configure Environment Variables:**

```powershell
Copy-Item .env.example .env
```

**4. Start the API Server:**

```powershell
cd backend
.\.venv\Scripts\python.exe main.py
```

*(Note: IndoBERT and Translation models will be downloaded automatically on the first start/request).*

**5. Start the Frontend:**

Open a new terminal window:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser and paste any Google Maps URL to start the analysis!

---

## Troubleshooting: Google Maps "Limited View"

If Google Maps hides reviews due to unusual traffic, create a local authenticated browser profile:

```powershell
cd backend
.\.venv\Scripts\python.exe google_maps_session.py
```

Log in manually in the Chromium window, ensure reviews are visible, and press Enter in the terminal. The profile is saved in `.browser-profile`. Update your `.env` to include: `PLAYWRIGHT_USER_DATA_DIR=.browser-profile`.

---

## Deployment Architecture (Portfolio Setup)

To keep hosting costs at zero while running heavy Machine Learning models and a headless Chromium browser, this project utilizes a hybrid deployment approach:

1. **Frontend (Cloud):**
   - Deployed on **Vercel** (`location-sentiment-analyzer.vercel.app`).
   - Automatically builds and serves the React + Vite static assets globally.

2. **Backend (Local Machine + Ngrok):**
   - The FastAPI backend, PyTorch models, and Playwright scraper run locally on the developer's machine to leverage local RAM and CPU.
   - The local backend is securely exposed to the internet and connected to the Vercel frontend using **Ngrok** (e.g., `ngrok http 8001`).

This architecture ensures the heavy backend requirements (2GB+ RAM for NLP models and browser instances) are met without requiring an expensive cloud VPS.

---

## Privacy Notice

The `.gitignore` strictly blocks virtual environments, `.env` credential files, and `.browser-profile` session data. No passwords or authentication tokens are ever read by the application or pushed to version control.
