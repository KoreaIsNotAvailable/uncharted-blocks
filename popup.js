document.getElementById('reapplyBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = '재등록 중...';
  statusEl.style.color = '#f1c40f';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (typeof window.__unchartedForceReapply === 'function') {
          return window.__unchartedForceReapply();
        }
        return '아직 스크립트가 로드되지 않았습니다. playentry.org 편집 화면인지 확인해주세요.';
      },
    });
    statusEl.textContent = result;
    statusEl.style.color = result.includes('성공') ? '#2ecc71' : '#e74c3c';
  } catch (e) {
    statusEl.textContent = '오류: ' + e.message;
    statusEl.style.color = '#e74c3c';
  }
});

// ===== 커스텀 코드 관리 =====
const SNIPPET_KEY = 'unchartedCustomSnippets';

function getSnippets(cb) {
  chrome.storage.local.get(SNIPPET_KEY, (result) => cb(result[SNIPPET_KEY] || []));
}

function saveSnippets(snippets, cb) {
  chrome.storage.local.set({ [SNIPPET_KEY]: snippets }, cb);
}

function renderSnippets(snippets) {
  const listEl = document.getElementById('snippetList');
  const emptyEl = document.getElementById('snippetEmpty');
  listEl.innerHTML = '';

  if (snippets.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  snippets.forEach((snip, idx) => {
    const li = document.createElement('li');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = snip.title;
    const delBtn = document.createElement('button');
    delBtn.textContent = '삭제';
    delBtn.addEventListener('click', () => {
      const updated = snippets.filter((_, i) => i !== idx);
      saveSnippets(updated, () => renderSnippets(updated));
    });
    li.appendChild(titleSpan);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

document.getElementById('addSnippetBtn').addEventListener('click', () => {
  const titleEl = document.getElementById('snippetTitle');
  const codeEl = document.getElementById('snippetCode');
  const title = titleEl.value.trim();
  const code = codeEl.value.trim();

  if (!title || !code) {
    alert('제목과 코드를 둘 다 입력해주세요.');
    return;
  }

  getSnippets((snippets) => {
    snippets.push({ title, code });
    saveSnippets(snippets, () => {
      renderSnippets(snippets);
      titleEl.value = '';
      codeEl.value = '';
    });
  });
});

getSnippets(renderSnippets);

// ===== Groq API 키 관리 =====
const AI_KEY_STORAGE = 'unchartedGroqApiKey';

function renderAiKeyStatus(hasKey) {
  const statusEl = document.getElementById('aiKeyStatus');
  if (hasKey) {
    statusEl.textContent = '✅ 키가 설정되어 있습니다. (보안을 위해 다시 표시되지 않아요)';
    statusEl.className = 'set';
  } else {
    statusEl.textContent = '키가 설정되지 않았습니다.';
    statusEl.className = 'unset';
  }
}

chrome.storage.local.get(AI_KEY_STORAGE, (result) => {
  renderAiKeyStatus(!!result[AI_KEY_STORAGE]);
});

document.getElementById('aiKeySaveBtn').addEventListener('click', () => {
  const input = document.getElementById('aiKeyInput');
  const key = input.value.trim();
  if (!key) {
    alert('API 키를 입력해주세요.');
    return;
  }
  chrome.storage.local.set({ [AI_KEY_STORAGE]: key }, () => {
    input.value = ''; // 저장 후 입력창도 비워서 화면에 남지 않게 함
    renderAiKeyStatus(true);
  });
});

document.getElementById('aiKeyClearBtn').addEventListener('click', () => {
  chrome.storage.local.remove(AI_KEY_STORAGE, () => {
    renderAiKeyStatus(false);
  });
});
