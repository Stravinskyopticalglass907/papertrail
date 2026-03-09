// background.js

// 1. 保留核心行为：允许用户点击扩展图标来呼出侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("侧边栏行为设置失败:", error));

// 2. 【大师级设定】默认在所有页面“全局禁用”侧边栏
// 这样就不会出现一打开浏览器，右边就挂着一个空白侧边栏的尴尬场面
chrome.sidePanel.setOptions({ enabled: false });

// 3. 核心工厂函数：判断 URL，精准投放侧边栏
function toggleContextAwarePanel(tabId, url) {
  if (!url) return;
  
  // 兼容网络 PDF 和本地的 file:///...pdf
  const isPdf = url.toLowerCase().includes('.pdf');
  
  if (isPdf) {
    // 如果是 PDF，特批该标签页可以打开侧边栏，并挂载我们的 html
    chrome.sidePanel.setOptions({
      tabId: tabId,
      path: 'sidepanel.html',
      enabled: true
    }).catch(err => console.error("启用侧边栏失败:", err));
  } else {
    // 如果不是 PDF，直接禁用该标签页的侧边栏
    // Chrome 会非常智能地自动把它隐藏掉
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false
    }).catch(err => console.error("禁用侧边栏失败:", err));
  }
}

// 4. 监听动作 A：用户在不同的标签页之间来回切换 (Tab 焦点改变)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    toggleContextAwarePanel(tab.id, tab.url);
  } catch (e) {
    console.warn("无法获取活动标签页信息:", e);
  }
});

// 5. 监听动作 B：当前标签页刷新了，或者输入了新的网址 (URL 改变)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只要 URL 发生了改变，或者页面加载完成，就重新做一次安检
  if (changeInfo.url || changeInfo.status === 'complete') {
    toggleContextAwarePanel(tabId, tab.url);
  }
});