// 页面加载完毕后，尝试读取已保存的 API Key
document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get('apiKey');
  if (data.apiKey) {
    document.getElementById('apiKey').value = data.apiKey;
  }
});

// 点击保存按钮
document.getElementById('saveBtn').addEventListener('click', async () => {
  const apiKeyInput = document.getElementById('apiKey').value.trim();
  const statusEl = document.getElementById('status');
  
  if (!apiKeyInput) {
    statusEl.textContent = '❌ API Key 不能为空！';
    statusEl.style.color = '#dc3545';
    return;
  }

  // 保存到 Chrome 本地存储
  await chrome.storage.local.set({ apiKey: apiKeyInput });
  
  statusEl.textContent = '✅ 保存成功！你可以关闭此页面并使用侧边栏了。';
  statusEl.style.color = '#34a853';
  
  // 3秒后清除提示文本
  setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
});