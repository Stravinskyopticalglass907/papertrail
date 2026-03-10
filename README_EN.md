# 📑 PaperTrail: Smart PDF Companion & Note-taking

<div align="center">
  <img src="figures/demo_main.png" alt="PaperTrail Workspace" width="800" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
</div>

<br/>

**[English](./README_EN.md) | [简体中文](./README.md)**

A Chrome sidebar AI extension built for "page-by-page deep reading" and "knowledge retention".

When facing 100-page academic papers, industry reports, or financial statements, traditional "one-click full-text summaries" often miss critical data and suffer from severe AI hallucinations. PaperTrail is built to solve this. Acting as your patient academic teaching assistant, it sits quietly in your browser's sidebar, helping you break down hardcore knowledge page by page while leaving behind your unique thought trail.

---

## ✨ Key Features

### 🤖 1. Pixel-Level Page Extraction
Say no to superficial reading! Input specific page numbers (e.g., `1, 3-5`) to precisely invoke LLMs like DeepSeek or Qwen to extract insights from the current page. It filters out fluff and hits the core. When text is scarce, it automatically degrades to an OCR assistant to extract chart titles.

### 📝 2. Dual-Track Immersive Annotation
Uninterrupted flow state. AI summaries at the top, your private notes at the bottom.
* **Seamless Integration**: Click the 📝 button to open a dedicated yellow note-taking area for the current page.
* **Debounced Auto-save**: No save button needed. Your notes are instantly saved to local storage the moment you leave the input box. Never lose a flash of inspiration.

<img src="figures/demo_sidebar.png" alt="Dual-Track Annotation" width="300" style="border-radius: 8px; margin-top: 10px;" />

### ⚡️ 3. Millisecond Cold Start & Ghost Sidebar
* **Context-Aware**: The sidebar acts like a ghost, appearing only when a PDF is opened and hiding automatically when switching tabs, giving you your screen back.
* **Optimistic UI**: When reopening the same document, your history loads instantly in 0 milliseconds—no waiting for massive PDFs to re-download.

<img src="figures/demo_history.png" alt="Millisecond Cold Start" width="300" style="border-radius: 8px; margin-top: 10px;" />

### 📦 4. Knowledge Closed-Loop (Export Engine)
Built-in, zero-dependency custom regex rendering engine that elegantly renders LaTeX math formulas and Markdown lists. Supports one-click export in three modes:
* 📚 **Summaries & Notes (Merged)**: A complete, illustrated reading archive.
* 🤖 **Summaries Only**: Pure AI-extracted insights.
* 📝 **Notes Only**: Your pure, personal thoughts.

<img src="figures/demo_export.png" alt="Export Engine" width="300" style="border-radius: 8px; margin-top: 10px;" />

### 🔐 5. Absolute Privacy (BYOK)
Built on a pure frontend Serverless architecture with no sketchy backend servers.
* **Bring Your Own Key (BYOK)**: Giving you the choice of models. Your API Key is encrypted and stored exclusively in your browser's local cache.
* **Zero Data Exfiltration**: Every private note you write stays strictly on your local hard drive.

<img src="figures/demo_settings.png" alt="Privacy Settings" width="300" style="border-radius: 8px; margin-top: 10px;" />

---

## 🛠️ Installation

Due to its strict local sandbox architecture, you can install it password-free via Developer Mode:

1. Download the `.zip` package from the Releases page and extract it to a fixed folder.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Turn on the **"Developer mode"** toggle in the top right corner.
4. Click **"Load unpacked"** in the top left and select your extracted folder.
5. ⚠️ **CRITICAL**: If you want to use this extension on local PDF files on your computer, click "Details" on the extension card and turn on **"Allow access to file URLs"**.
6. 🎉 **Success!** We recommend clicking the puzzle 🧩 icon in your browser to **Pin** the extension to your toolbar.

---

## 🚀 Quick Start

1. **Fuel Up**: On first use, click the 【⚙️ Settings】 button in the top right of the sidebar, enter your ModelScope API Key, and select your preferred model (DeepSeek-V3.2 recommended).
2. **Open the Range**: Open any online or local PDF in Chrome.
3. **Start Reading**:
   * Input `1-10` and click 【🚀 AI Summary】, grab a coffee, and watch the AI perform.
   * Got an idea on a specific page? Click 【📝 Blank Note】 and unleash your inspiration.

---

## 👨‍💻 Tech Stack
* **Core**: Vanilla JavaScript (ES6+) / HTML5 / CSS3 (Zero third-party UI frameworks, ultra-lightweight)
* **Parser**: Mozilla PDF.js (Isolated Web Worker)
* **Storage**: Chrome Extension Storage API
* **AI Engine**: Compatible with ModelScope Ecosystem (DeepSeek, Qwen, GLM, etc.)

---
*"Leave a trail, retain the knowledge."* —— Happy Reading!