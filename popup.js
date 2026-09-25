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

// ===== 이 작품용 공유 키 =====
// storage가 아니라 지금 열려있는 엔트리 탭의 페이지(MAIN world)에 직접 주입해서
// 엔트리 변수로 저장한다 (Entry.Variable.create 사용, inject.js에 미리 노출해둔
// window.__unchartedSetSharedGroqKey / __unchartedRemoveSharedGroqKey / __unchartedGetSharedGroqKeyStatus 호출).
function renderSharedKeyStatus(hasKey) {
  const statusEl = document.getElementById('sharedKeyStatus');
  if (hasKey) {
    statusEl.textContent = '✅ 이 작품에 공유 키가 설정되어 있습니다.';
    statusEl.className = 'set';
  } else {
    statusEl.textContent = '이 작품에 공유 키가 설정되지 않았습니다.';
    statusEl.className = 'unset';
  }
}

async function refreshSharedKeyStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => (typeof window.__unchartedGetSharedGroqKeyStatus === 'function'
        ? window.__unchartedGetSharedGroqKeyStatus()
        : false),
    });
    renderSharedKeyStatus(!!result);
  } catch (e) {
    renderSharedKeyStatus(false);
  }
}
refreshSharedKeyStatus();

document.getElementById('sharedKeySaveBtn').addEventListener('click', async () => {
  const input = document.getElementById('sharedKeyInput');
  const key = input.value.trim();
  if (!key) {
    alert('공유할 API 키를 입력해주세요.');
    return;
  }
  const confirmed = confirm(
    '이 키는 작품 데이터에 저장되어, 작품을 저장·공유·게시하면 다른 사람도 볼 수 있게 됩니다.\n' +
    '완전히 숨겨지지 않으며, 프로젝트 파일을 직접 열어보면 드러날 수 있습니다.\n\n' +
    '유출되어도 괜찮은 키인 경우에만 계속 진행하세요. 계속할까요?'
  );
  if (!confirmed) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [key],
      func: (k) => {
        if (typeof window.__unchartedSetSharedGroqKey !== 'function') {
          return '아직 스크립트가 로드되지 않았습니다. playentry.org 편집 화면인지 확인해주세요.';
        }
        try {
          window.__unchartedSetSharedGroqKey(k);
          return 'ok';
        } catch (e) {
          return e.message;
        }
      },
    });
    if (result === 'ok') {
      input.value = '';
      renderSharedKeyStatus(true);
    } else {
      alert('설정 실패: ' + result);
    }
  } catch (e) {
    alert('오류: ' + e.message);
  }
});

document.getElementById('sharedKeyClearBtn').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (typeof window.__unchartedRemoveSharedGroqKey === 'function') {
          window.__unchartedRemoveSharedGroqKey();
        }
      },
    });
    renderSharedKeyStatus(false);
  } catch (e) {
    alert('오류: ' + e.message);
  }
});

// ===== 업데이트 확인 (버전 비교만, 코드는 절대 자동 실행하지 않음) =====
document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('updateStatus');
  statusEl.className = '';
  statusEl.textContent = '확인 중...';

  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const url = 'https://raw.githubusercontent.com/KoreaIsNotAvailable/uncharted-blocks/main/manifest.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('GitHub 응답 오류(' + res.status + ')');
    const remoteManifest = await res.json();
    const remoteVersion = remoteManifest.version;

    if (!remoteVersion) throw new Error('원격 버전 정보를 읽을 수 없습니다.');

    if (compareVersions(remoteVersion, currentVersion) > 0) {
      statusEl.className = 'available';
      statusEl.innerHTML = '🆕 새 버전 ' + remoteVersion + ' 이(가) 있습니다! (현재: ' + currentVersion + ')<br>' +
        '<a href="https://github.com/KoreaIsNotAvailable/uncharted-blocks" target="_blank" rel="noopener">GitHub에서 확인하기 ↗</a>';
    } else {
      statusEl.className = 'uptodate';
      statusEl.textContent = '✅ 최신 버전입니다. (v' + currentVersion + ')';
    }
  } catch (e) {
    statusEl.className = 'error';
    statusEl.textContent = '확인 실패: ' + e.message;
  }
});

// 간단한 semver 비교: a가 b보다 크면 1, 같으면 0, 작으면 -1
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
