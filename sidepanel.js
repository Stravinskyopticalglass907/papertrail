import * as pdfjsLib from './pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';

let abortController = null;
let currentPdf = null;
let currentPdfUrl = null;      
let currentFingerprint = null; 
let currentFileName = null;    

const statusEl = document.getElementById('status');
const container = document.getElementById('summaryContainer');
const historyContainer = document.getElementById('historyContainer');
const navTrack = document.getElementById('navTrack'); 
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const singleBtn = document.getElementById('singleBtn');
const noteBtn = document.getElementById('noteBtn'); // 新增：空白笔记按钮
const targetPageInput = document.getElementById('targetPage');
const historyBtn = document.getElementById('historyBtn');

// 设置弹窗 DOM
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const modalStatus = document.getElementById('modalStatus');

// 导出弹窗 DOM
const exportMenuBtn = document.getElementById('exportMenuBtn');
const exportModal = document.getElementById('exportModal');
const closeExportBtn = document.getElementById('closeExportBtn');
const exportOptions = document.querySelectorAll('.export-option');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const progressWrapper = document.getElementById('progressWrapper');
const progressBar = document.getElementById('progressBar');

function cleanPdfText(rawText) {
  if (!rawText) return '';
  let text = rawText.replace(/([a-zA-Z]+)-\s+([a-zA-Z]+)/g, "$1$2");
  text = text.replace(/\s{2,}/g, " ");
  text = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, "$1$2");
  text = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, "$1$2"); 
  text = text.replace(/\(cid:\d+\)/g, "");
  return text.trim();
}

// ================= 大师级微型渲染引擎 (终极版) =================
function renderMarkdownAndMath(text) {
  if (!text) return '';
  let html = text;

  // 提取通用公式解析逻辑 (处理上下标)
  const parseMath = (mathContent) => {
    return mathContent
      .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
      .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
      .replace(/_([a-zA-Z0-9])/g, '<sub>$1</sub>')
      .replace(/\^([a-zA-Z0-9])/g, '<sup>$1</sup>');
  };

  const mathStyle = `font-family: 'Cambria Math', 'Times New Roman', serif; font-style: italic; background: #f8f9fa; padding: 2px 4px; border-radius: 4px; border: 1px solid #f1f3f4; color: #1a73e8; margin: 0 2px;`;

  // 1A. 解析标准 LaTeX 公式 \( ... \) 和 \[ ... \]
  html = html.replace(/(\\\(|\\\[)(.*?)(\\\)|\\\])/g, (match, open, mathContent) => {
    return `<span style="${mathStyle}">${parseMath(mathContent)}</span>`;
  });

  // 1B. 解析 Markdown 单美元符号公式 $ ... $ 
  html = html.replace(/\$([^\$\n]+?)\$/g, (match, mathContent) => {
    // 【大师级防御】如果是纯价格描述（如 $50 和 $60），里面没有字母或数学运算符，就原样返回，防止误伤美金符号
    if (/^\s*\d/.test(mathContent) && !/[a-zA-Z=+\-*/_]/.test(mathContent)) {
      return match; 
    }
    return `<span style="${mathStyle}">${parseMath(mathContent)}</span>`;
  });

  // 2. 解析 Markdown 标题 (### 标题)
  html = html.replace(/^###\s+(.*)$/gm, '<div style="font-weight: bold; color: #1a73e8; margin-top: 12px; margin-bottom: 6px;">$1</div>');
  html = html.replace(/^##\s+(.*)$/gm, '<div style="font-weight: bold; color: #1a73e8; font-size: 15px; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">$1</div>');

  // 3. 解析 Markdown 粗体 (**加粗**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #222;">$1</strong>');

  // 4. 解析嵌套列表项 (支持前面的空格缩进)
  html = html.replace(/^(\s*)[-*]\s+(.*)$/gm, (match, spaces, content) => {
    // 核心算法：每多一个空格，左边距增加 8px，实现完美的子列表阶梯缩进
    const indent = 18 + (spaces.length * 8); 
    // 子列表的圆点换成空心圆或者较小的实心点，增加层级美感
    const bulletType = spaces.length > 0 ? '◦' : '•';
    return `<div style="margin-left: ${indent}px; position: relative; margin-bottom: 4px;"><span style="position: absolute; left: -14px; color: #1a73e8; font-size: ${spaces.length > 0 ? '12px' : 'inherit'};">${bulletType}</span>${content}</div>`;
  });

  // 5. 智能处理换行符
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<\/div><br>/g, '</div>');
  html = html.replace(/<br><div/g, '<div');

  return html;
}

async function callAIApiToSummarize(text, signal, maxRetries = 3) {
  // if (text.trim().length < 50) return "本页内容过少，未提取到核心信息。";
  // 如果提取出来的纯文本少于 15 个字符（放宽一点，防止误伤只有标题的页面）
  if (text.trim().length < 15) {
    return "⚠️ **未能提取到有效文本**<br>本页可能是纯图片、扫描件或空白排版。无法进行 AI 总结。";
  }
  // 获取 Key 和 模型。如果没有保存过模型，使用 DeepSeek-V3.2 兜底
  const storageData = await chrome.storage.local.get(['apiKey', 'aiModel']);
  const apiKey = storageData.apiKey;
  const aiModel = storageData.aiModel || 'deepseek-ai/DeepSeek-V3.2'; 
  
  if (!apiKey) throw new Error("尚未配置 API Key！请点击右上角【⚙️ 设置】按钮进行配置。");

  const apiUrl = 'https://api-inference.modelscope.cn/v1/chat/completions';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST', signal: signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: aiModel, // 【核心】使用用户选定的模型
          messages: [
            { 
              role: 'system', 
              content: `你是一个极其专业的学术和文档阅读助手。请你严格遵守以下四条铁律：
1. 【强制中文】：无论用户提供的 PDF 文本是什么语言，你都必须使用流畅的简体中文进行总结和输出！绝对不允许输出英文。
2. 【格式封印】：绝对不允许使用 Markdown 表格（|---|）。如果遇到数据对比，请使用列表（- ）的形式进行排版。
3. 【直入主题】：绝对不要使用“该页的核心内容为”、“为您总结如下”等废话前缀，直接输出正文。
4. 【智能降级】：如果你发现用户提供的文本极少，请直接放弃总结，将这些零散文字稍作排版后输出。` 
            },
            { 
              role: 'user', 
              content: `这是从PDF当前页提取的纯文本：\n\n${text}` 
            }
          ], temperature: 0.3
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      }
      
      const errorText = await response.text();
      
      if (response.status === 401) {
        throw new Error("API Key 无效或已过期，请重新填写！");
      }
      // 如果触发 402 或者报错信息中包含余额/配额相关的词汇
      if (response.status === 402 || errorText.toLowerCase().includes('balance') || errorText.toLowerCase().includes('quota') || errorText.toLowerCase().includes('insufficient')) {
        throw new Error(`【${aiModel}】额度已耗尽！请点击右上角【⚙️ 设置】切换其他免费模型试试。`);
      }
      if (response.status === 429) {
        if (attempt === maxRetries) throw new Error("触发接口频繁限流，请稍后再试。");
        await sleep(2000 * attempt); continue;
      }
      
      throw new Error(`API 错误 (${response.status}): ${errorText.substring(0, 50)}...`);
      
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      // 如果是配额耗尽或 Key 错误，没必要再重试了，直接跳出循环报错
      if (error.message.includes('额度已耗尽') || error.message.includes('API Key')) {
         return `<span style="color:red;">⚠️ ${error.message}</span>`;
      }
      
      if (attempt < maxRetries) await sleep(1000);
      else return `<span style="color:red;">⚠️ 生成总结失败: ${error.message}</span>`;
    }
  }
}

// ================= 页码解析引擎 (支持所有变态输入) =================
function parsePageRange(input, maxPage) {
  if (!input) return [];
  const pages = new Set();
  
  // 第一步：防御性清洗 (The Great Sanitization)
  // 1. 把连字符前后的空格去掉，防止用户手滑打成 "2 - 5" 导致切割断裂
  let sanitized = input.replace(/\s*-\s*/g, '-');
  
  // 2. 把所有的中文逗号（，）、英文逗号（,）全部替换为标准的空格
  sanitized = sanitized.replace(/,|，/g, ' ');
  
  // 第二步：精准切割
  // 现在的字符串只剩下数字、连字符和空格了。我们按“一个或多个连续空格”进行切割
  const parts = sanitized.split(/\s+/);
  
  // 第三步：遍历提取
  for (let part of parts) {
    if (!part.trim()) continue; // 防御空字符串
    
    if (part.includes('-')) {
      // 处理范围，例如 "2-5"
      const [start, end] = part.split('-').map(n => parseInt(n, 10));
      // 确保是有效的数字，且起点小于等于终点
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= maxPage) pages.add(i);
        }
      }
    } else {
      // 处理单页，例如 "3"
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPage) {
        pages.add(num);
      }
    }
  }
  
  // 最后一步：转化为数组，并进行严格的数字升序排列
  return Array.from(pages).sort((a, b) => a - b);
}

function setButtonsState(isProcessing) {
  startBtn.disabled = singleBtn.disabled = noteBtn.disabled = targetPageInput.disabled = historyBtn.disabled = exportMenuBtn.disabled = isProcessing;
  stopBtn.disabled = !isProcessing;
}
function clearCanvas() { container.innerHTML = ''; navTrack.innerHTML = ''; }

// ================= 设置与弹窗控制 =================
const modelSelect = document.getElementById('modelSelect'); // 新增获取下拉框DOM

settingsBtn.addEventListener('click', async () => {
  // 同时读取 key 和 模型偏好
  const data = await chrome.storage.local.get(['apiKey', 'aiModel']);
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  // 如果之前存过模型，就选中它；如果没有，HTML里默认选中了 DeepSeek
  if (data.aiModel) modelSelect.value = data.aiModel; 
  
  settingsModal.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => { settingsModal.classList.remove('active'); modalStatus.textContent = ''; });
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsBtn.click(); });

saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  const selectedModel = modelSelect.value; // 获取选中的模型
  
  if (!key) return modalStatus.textContent = '❌ API Key 不能为空！', modalStatus.style.color = '#dc3545';
  
  // 将 key 和 模型一并存入数据库
  await chrome.storage.local.set({ apiKey: key, aiModel: selectedModel });
  
  modalStatus.textContent = '✅ 保存成功！'; modalStatus.style.color = '#34a853';
  setTimeout(() => settingsModal.classList.remove('active'), 800);
});

// ================= 导出逻辑 (支持三种格式) =================
exportMenuBtn.addEventListener('click', () => {
  if (!currentFingerprint) return statusEl.textContent = "⚠️ 没有可导出的内容！";
  exportModal.classList.add('active');
});
closeExportBtn.addEventListener('click', () => exportModal.classList.remove('active'));
exportModal.addEventListener('click', (e) => { if (e.target === exportModal) closeExportBtn.click(); });

exportOptions.forEach(btn => {
  btn.addEventListener('click', async () => {
    const exportType = btn.getAttribute('data-type'); // 'all', 'summary', 'note'
    exportModal.classList.remove('active');
    
    const data = await chrome.storage.local.get('pdfDatabase');
    const doc = (data.pdfDatabase || {})[currentFingerprint];
    if (!doc || !doc.pages || Object.keys(doc.pages).length === 0) return statusEl.textContent = "⚠️ 没有已保存的记录！";

    let mdContent = `# ${doc.title}\n\n> 导出时间：${new Date().toLocaleString()}\n> 页面总数：${Object.keys(doc.pages).length} 页\n\n---\n\n`;
    
    let hasContent = false;
    Object.keys(doc.pages).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageNum => {
      // 将旧的字符串格式转为对象
      let pageData = doc.pages[pageNum];
      if (typeof pageData === 'string') pageData = { summary: pageData, note: '' };

      const showSummary = (exportType === 'all' || exportType === 'summary') && pageData.summary;
      const showNote = (exportType === 'all' || exportType === 'note') && pageData.note;

      if (showSummary || showNote) {
        hasContent = true;
        mdContent += `## 第 ${pageNum} 页\n\n`;
        if (showSummary) mdContent += `**🤖 AI总结:**\n${pageData.summary}\n\n`;
        if (showNote) mdContent += `**📝 私人笔记:**\n${pageData.note}\n\n`;
      }
    });

    if (!hasContent) return statusEl.textContent = `⚠️ 当前文档没有符合【${exportType}】条件的记录。`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${doc.title.replace(/\.pdf$/i, '')}_${exportType}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    statusEl.textContent = "✅ Markdown 导出成功！";
  });
});

// ================= 数据库升级与存储 =================
// 保存数据：统一保存为一个对象 {summary: "...", note: "..."}
async function savePageDataToStorage(fingerprint, fileName, pageNum, newSummary, newNote) {
  if (!chrome.storage || !chrome.storage.local) return;
  const data = await chrome.storage.local.get('pdfDatabase');
  const db = data.pdfDatabase || {};
  if (!db[fingerprint]) db[fingerprint] = { title: fileName, lastModified: Date.now(), pages: {} };
  
  // 提取现有数据，保证不丢失
  let existing = db[fingerprint].pages[pageNum];
  if (typeof existing === 'string') existing = { summary: existing, note: '' };
  else if (!existing) existing = { summary: '', note: '' };

  if (newSummary !== undefined) existing.summary = newSummary;
  if (newNote !== undefined) existing.note = newNote;

  // 如果这一页总结和笔记都被清空了，就直接删除这一页的数据
  if (!existing.summary && !existing.note) {
    delete db[fingerprint].pages[pageNum];
  } else {
    db[fingerprint].pages[pageNum] = existing;
  }
  
  db[fingerprint].lastModified = Date.now(); 
  await chrome.storage.local.set({ pdfDatabase: db });
}

// ================= 渲染逻辑 (支持卡片与笔记混合) =================

// pageData 参数结构: { summary: "...", note: "..." }
function renderPageCard(pageNum, pageData, isPrepend = false, shouldSave = true, forceRender = false) {
  if (typeof pageData === 'string') pageData = { summary: pageData, note: '' };
  if (!pageData) pageData = { summary: '', note: '' };

  const isError = pageData.summary && pageData.summary.includes('<span style="color:red;">');

  const existingCard = container.querySelector(`.page-summary[data-page-num="${pageNum}"]`);
  if (existingCard) existingCard.remove();
  const existingDot = navTrack.querySelector(`.nav-dot[data-page-num="${pageNum}"]`);
  if (existingDot) existingDot.remove();

  // 如果不是强制渲染，且没有任何内容，才拒绝渲染
  if (!pageData.summary && !pageData.note && !forceRender) return;

  const pageDiv = document.createElement('div');
  pageDiv.className = 'page-summary';
  pageDiv.setAttribute('data-page-num', pageNum); 
  
  const headerDiv = document.createElement('div');
  headerDiv.className = 'page-header';
  
  const titleSpan = document.createElement('span');
  titleSpan.className = 'page-num';
  titleSpan.textContent = `第 ${pageNum} 页`;

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'header-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn'; copyBtn.textContent = '📋'; copyBtn.title = '复制全部内容';
  
  const addNoteBtn = document.createElement('button');
  addNoteBtn.className = 'icon-btn'; addNoteBtn.textContent = '📝'; addNoteBtn.title = '展开/隐藏笔记';

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn'; delBtn.style.color = '#dc3545'; delBtn.textContent = '🗑️'; delBtn.title = '删除此页记录';

  actionsDiv.append(copyBtn, addNoteBtn, delBtn);
  headerDiv.append(titleSpan, actionsDiv);
  pageDiv.appendChild(headerDiv);

  if (pageData.summary) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'summary-content';
    // 让文本经过我们的渲染引擎洗礼再上墙
    summaryDiv.innerHTML = renderMarkdownAndMath(pageData.summary);
    pageDiv.appendChild(summaryDiv);
  }

  const noteContainer = document.createElement('div');
  noteContainer.className = 'note-container';
  // 如果是强制渲染空白笔记，必须把文本框展开显示出来！
  noteContainer.style.display = (pageData.note || forceRender) ? 'flex' : 'none';
  
  noteContainer.innerHTML = `
    <div class="note-header"><span>✍️ 私人笔记</span></div>
    <textarea class="note-input" placeholder="在这里写下你的想法... 离开输入框自动保存">${pageData.note}</textarea>
  `;
  pageDiv.appendChild(noteContainer);

  const textarea = noteContainer.querySelector('.note-input');

  // 事件绑定：展开/隐藏笔记
  addNoteBtn.addEventListener('click', () => {
    const isHidden = noteContainer.style.display === 'none';
    noteContainer.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) textarea.focus(); // 展开时自动聚焦
  });

  // 事件绑定：笔记自动保存 (使用 blur 事件防抖，避免高频写库)
  textarea.addEventListener('blur', () => {
    const newNote = textarea.value.trim();
    if (newNote !== pageData.note) {
      pageData.note = newNote; // 更新内存状态
      if (currentFingerprint) savePageDataToStorage(currentFingerprint, currentFileName, pageNum, undefined, newNote);
      
      // 更新导航豆的颜色状态 (有笔记变黄)
      const dot = navTrack.querySelector(`.nav-dot[data-page-num="${pageNum}"]`);
      if (dot) newNote ? dot.classList.add('has-note') : dot.classList.remove('has-note');
    }
  });

  // 事件绑定：复制
  copyBtn.addEventListener('click', async () => {
    try {
      let textToCopy = '';
      if (pageData.summary) textToCopy += `【AI 总结】\n${pageData.summary}\n\n`;
      if (pageData.note) textToCopy += `【私人笔记】\n${pageData.note}`;
      await navigator.clipboard.writeText(textToCopy.trim());
      copyBtn.textContent = '✅'; setTimeout(() => copyBtn.textContent = '📋', 2000);
    } catch (err) {}
  });

  // 事件绑定：删除此页
  delBtn.addEventListener('click', async () => {
    if (confirm(`确定要删除第 ${pageNum} 页的所有记录吗？`)) {
      pageDiv.remove();
      const dot = navTrack.querySelector(`.nav-dot[data-page-num="${pageNum}"]`);
      if (dot) dot.remove();
      if (currentFingerprint) await savePageDataToStorage(currentFingerprint, currentFileName, pageNum, '', ''); // 传空字符串触发删除逻辑
    }
  });

  // 构建导航豆
  const dot = document.createElement('div');
  dot.className = 'nav-dot';
  dot.setAttribute('data-page-num', pageNum); 
  dot.title = `第 ${pageNum} 页`; 
  if (isError) dot.style.backgroundColor = '#ffcdd2';
  else if (pageData.note) dot.classList.add('has-note'); // 黄色标明有笔记
  
  dot.addEventListener('click', () => pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  // 智能排序插入
  const cards = Array.from(container.querySelectorAll('.page-summary'));
  const nextCard = cards.find(card => parseInt(card.getAttribute('data-page-num')) > pageNum);
  if (nextCard) container.insertBefore(pageDiv, nextCard);
  else container.appendChild(pageDiv);

  const dots = Array.from(navTrack.querySelectorAll('.nav-dot'));
  const nextDot = dots.find(d => parseInt(d.getAttribute('data-page-num')) > pageNum);
  if (nextDot) navTrack.insertBefore(dot, nextDot);
  else navTrack.appendChild(dot);

  pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  navTrack.style.display = 'flex'; 

  // 初次生成卡片时的保存逻辑（此时笔记可能为空，保存的是总结）
  if (shouldSave && currentFingerprint && !isError) {
    savePageDataToStorage(currentFingerprint, currentFileName, pageNum, pageData.summary, undefined);
  }
}

// ================= 历史记录与初始化 =================
async function renderHistoryList() {
  const data = await chrome.storage.local.get('pdfDatabase');
  const db = data.pdfDatabase || {};
  const fingerprints = Object.keys(db);
  historyContainer.innerHTML = ''; 
  if (fingerprints.length === 0) return historyContainer.innerHTML = '<div style="color:#666; font-size:14px; text-align:center;">暂无历史记录</div>';

  const clearAllBtn = document.createElement('button');
  clearAllBtn.innerHTML = '🗑️ 清空所有记录'; clearAllBtn.style.cssText = 'width: 100%; margin-bottom: 15px; background: #ffebee; color: #c62828; padding: 8px; border-radius: 6px;';
  clearAllBtn.addEventListener('click', async () => { if (confirm('🚨 清空所有文档记录？')) { await chrome.storage.local.remove('pdfDatabase'); currentFingerprint = null; renderHistoryList(); } });
  historyContainer.appendChild(clearAllBtn);

  fingerprints.sort((a, b) => db[b].lastModified - db[a].lastModified).forEach(fp => {
    const doc = db[fp]; const pageKeys = Object.keys(doc.pages);
    const card = document.createElement('div'); card.className = 'page-summary'; card.style.cursor = 'pointer'; 
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between;"><div class="page-num" style="color:#333;">📄 ${doc.title}</div><button class="icon-btn delete-btn">🗑️</button></div>
      <div style="font-size: 12px; color: #888; margin-top: 5px;">已处理 ${pageKeys.length} 页 | ${new Date(doc.lastModified).toLocaleDateString()}</div>
    `;
    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation(); 
      if (confirm(`删除《${doc.title}》?`)) { const dbData = await chrome.storage.local.get('pdfDatabase'); delete dbData.pdfDatabase[fp]; await chrome.storage.local.set(dbData); if (currentFingerprint === fp) { currentFingerprint = null; clearCanvas(); } renderHistoryList(); }
    });
    card.addEventListener('click', () => {
      clearCanvas(); currentFingerprint = fp; currentFileName = doc.title; statusEl.textContent = `📚 正在回顾: ${doc.title}`;
      pageKeys.sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageNum => renderPageCard(pageNum, doc.pages[pageNum], false, false)); 
      toggleHistoryView(false); 
    });
    historyContainer.appendChild(card);
  });
}

let isHistoryView = false;
function toggleHistoryView(forceView) {
  isHistoryView = forceView !== undefined ? forceView : !isHistoryView;
  if (isHistoryView) {
    container.style.display = navTrack.style.display = 'none'; historyContainer.style.display = 'block'; historyBtn.textContent = '◀ 返回'; renderHistoryList(); statusEl.textContent = "📂 管理历史记录";
  } else {
    container.style.display = 'block'; navTrack.style.display = 'flex'; historyContainer.style.display = 'none'; historyBtn.textContent = '📂 历史'; if (currentPdf) statusEl.textContent = `✅ 回到视图: ${currentFileName}`;
  }
}
historyBtn.addEventListener('click', () => toggleHistoryView());

async function getActivePdf() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.toLowerCase().includes('.pdf')) throw new Error("当前页面不是 PDF 文件！");
  
  // 如果当前已经解析过了，直接复用缓存
  if (currentPdf && currentPdfUrl === tab.url) return currentPdf;

  currentFileName = decodeURIComponent(tab.url.split('/').pop().split('#')[0].split('?')[0]) || '未知文档.pdf'; 
  currentPdfUrl = tab.url; 

  // ================= 性能优化：乐观预加载 (Optimistic UI) =================
  // 1. 绝不等待 PDF 网络下载，优先从硬盘极速读取数据库
  const data = await chrome.storage.local.get('pdfDatabase');
  const db = data.pdfDatabase || {};

  // 用 URL 哈希生成一个极速指纹
  const fastUrlFingerprint = btoa(encodeURIComponent(tab.url)).substring(0, 30);
  let matchedFp = db[fastUrlFingerprint] ? fastUrlFingerprint : null;

  if (!matchedFp) {
     // 如果极速指纹没命中，尝试通过“文件名”找最新的一条记录作为【极速预览】
     const possibleFps = Object.keys(db).filter(fp => db[fp].title === currentFileName);
     if (possibleFps.length > 0) {
         // 按最后修改时间倒序，取最新的一份历史
         possibleFps.sort((a, b) => db[b].lastModified - db[a].lastModified);
         matchedFp = possibleFps[0];
     }
  }

  // 2. 如果摸到底了，瞬间渲染！用户体感延迟为 0 毫秒！
  if (matchedFp) {
      statusEl.textContent = `⚡ 极速恢复历史记录中...`;
      clearCanvas();
      Object.keys(db[matchedFp].pages).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageNum => renderPageCard(pageNum, db[matchedFp].pages[pageNum], false, false));
  } else {
      statusEl.textContent = `⏳ 正在下载并解析 PDF 文档，请稍候...`;
      clearCanvas();
  }

  // 3. 让出主线程 50 毫秒，确保浏览器有足够的时间把上面的卡片画到屏幕上
  await sleep(50);

  // 4. 在后台静默执行沉重的 PDF 解析任务 (再慢也不会卡住界面了)
  currentPdf = await pdfjsLib.getDocument(tab.url).promise;
  currentFingerprint = currentPdf.fingerprint || (currentPdf.fingerprints && currentPdf.fingerprints[0]) || fastUrlFingerprint;
  targetPageInput.max = currentPdf.numPages;

  // 5. 拿到 PDF 真实指纹后，进行二次精准校对
  if (db[currentFingerprint] && matchedFp !== currentFingerprint) {
    statusEl.textContent = `💡 精准对齐 ${currentFileName} 的记录！共 ${currentPdf.numPages} 页。`;
    clearCanvas();
    Object.keys(db[currentFingerprint].pages).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageNum => renderPageCard(pageNum, db[currentFingerprint].pages[pageNum], false, false));
  } else {
    statusEl.textContent = `✅ 文档就绪，共 ${currentPdf.numPages} 页。`;
  }

  return currentPdf;
}

chrome.tabs.onActivated.addListener(async () => { if (!isHistoryView) try { let [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (tab && tab.url && tab.url.toLowerCase().includes('.pdf') && currentPdfUrl !== tab.url) await getActivePdf(); } catch(e) {} });
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => { if (changeInfo.status === 'complete' && tab.active && tab.url.toLowerCase().includes('.pdf') && !isHistoryView) try { await getActivePdf(); } catch(e) {} });

// ================= 核心业务：总结与空白笔记 =================

// 工具函数：获取当前数据库里某一页的老数据，防止覆盖
async function getExistingPageData(pageNum) {
  if (!currentFingerprint) return { summary: '', note: '' };
  const data = await chrome.storage.local.get('pdfDatabase');
  const db = data.pdfDatabase || {};
  if (db[currentFingerprint] && db[currentFingerprint].pages[pageNum]) {
    let raw = db[currentFingerprint].pages[pageNum];
    return typeof raw === 'string' ? { summary: raw, note: '' } : raw;
  }
  return { summary: '', note: '' };
}

singleBtn.addEventListener('click', async () => {
  const inputVal = targetPageInput.value;
  if (!inputVal.trim()) return statusEl.textContent = "⚠️ 请输入要处理的页码！";
  setButtonsState(true); abortController = new AbortController();
  
  try {
    const pdf = await getActivePdf();
    const targetPages = parsePageRange(inputVal, pdf.numPages);
    const totalTasks = targetPages.length;
    if (totalTasks === 0) return statusEl.textContent = `⚠️ 页码越界！`;

    // 如果任务大于1个，展示进度条并归零
    if (totalTasks > 1) { progressWrapper.style.display = 'block'; progressBar.style.width = '0%'; }

    for (let i = 0; i < totalTasks; i++) {
      const pageNum = targetPages[i];
      if (abortController.signal.aborted) { statusEl.textContent = "⚠️ 已中断。"; break; }
      if (i > 0) await sleep(1500); 

      statusEl.textContent = `🤖 总结第 ${pageNum} 页...`;
      const page = await pdf.getPage(pageNum);
      const text = cleanPdfText((await page.getTextContent()).items.map(item => item.str).join(' '));
      const summary = await callAIApiToSummarize(text, abortController.signal);
      
      const existingData = await getExistingPageData(pageNum);
      renderPageCard(pageNum, { summary: summary, note: existingData.note }, false, true); 
      
      // 步进更新进度条
      if (totalTasks > 1) { progressBar.style.width = `${((i + 1) / totalTasks) * 100}%`; }
    }
    if (!abortController.signal.aborted) statusEl.textContent = `🎉 总结完成！`;
  } catch (error) { 
    if (error.name !== 'AbortError') statusEl.textContent = "❌ " + error.message; 
  } finally { 
    setButtonsState(false); 
    // 任务结束后，让用户看满格1秒钟，然后平滑隐藏
    setTimeout(() => { progressWrapper.style.display = 'none'; progressBar.style.width = '0%'; }, 1000);
  }
});

// 新增功能：一键生成空白笔记
noteBtn.addEventListener('click', async () => {
  const inputVal = targetPageInput.value;
  if (!inputVal.trim()) return statusEl.textContent = "⚠️ 请输入要记笔记的页码！";
  try {
    const pdf = await getActivePdf();
    const targetPages = parsePageRange(inputVal, pdf.numPages);
    if (targetPages.length === 0) return statusEl.textContent = `⚠️ 页码越界！`;

    for (const pageNum of targetPages) {
      const existingData = await getExistingPageData(pageNum);
      // 在最后传入 `true`，激活 forceRender 强制渲染开关
      renderPageCard(pageNum, existingData, false, true, true);
    }
    statusEl.textContent = `✅ 笔记卡片已生成，请直接输入。`;
  } catch (error) { statusEl.textContent = "❌ " + error.message; }
});

startBtn.addEventListener('click', async () => {
  setButtonsState(true); abortController = new AbortController();
  try {
    const pdf = await getActivePdf(); clearCanvas();
    const totalTasks = pdf.numPages;
    
    // 全局总结，必定展示进度条
    progressWrapper.style.display = 'block'; progressBar.style.width = '0%';

    for (let pageNum = 1; pageNum <= totalTasks; pageNum++) {
      if (abortController.signal.aborted) { statusEl.textContent = "⚠️ 已中断。"; break; }
      if (pageNum > 1) await sleep(1500); 
      statusEl.textContent = `🤖 总结第 ${pageNum}/${totalTasks} 页...`;
      const text = cleanPdfText((await (await pdf.getPage(pageNum)).getTextContent()).items.map(item => item.str).join(' '));
      const summary = await callAIApiToSummarize(text, abortController.signal);
      const existingData = await getExistingPageData(pageNum);
      renderPageCard(pageNum, { summary: summary, note: existingData.note }, false, true);
      
      // 步进更新进度条
      progressBar.style.width = `${(pageNum / totalTasks) * 100}%`;
    }
    if (!abortController.signal.aborted) statusEl.textContent = "🎉 全部总结完成！";
  } catch (error) { 
    if (error.name !== 'AbortError') statusEl.textContent = "❌ " + error.message; 
  } finally { 
    setButtonsState(false);
    // 任务结束后，让用户看满格1秒钟，然后平滑隐藏
    setTimeout(() => { progressWrapper.style.display = 'none'; progressBar.style.width = '0%'; }, 1000);
  }
});

stopBtn.addEventListener('click', () => { if (abortController) abortController.abort(); });

async function autoInitOnLoad() {
  if (isHistoryView) return; 
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.toLowerCase().includes('.pdf')) {
      statusEl.textContent = "⏳ 检测到 PDF，正在自动加载..."; await getActivePdf();
    }
  } catch (e) {}
}
autoInitOnLoad();