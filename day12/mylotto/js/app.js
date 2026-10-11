(function () {
  'use strict';

  const MAX_NUMBER = 45;
  const PICK_COUNT = 6;
  const SET_COUNT = 5;
  const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];
  const MAX_FIXED = 5;
  const MAX_EXCLUDED = MAX_NUMBER - PICK_COUNT; // 39
  const MAX_HISTORY = 20;
  const STORAGE_KEY = 'lotto.history.v1';

  const state = {
    fixed: new Set(),
    excluded: new Set(),
    current: null,
    history: []
  };

  const el = {};
  let toast = null;

  // ---------- 초기화 ----------
  function init() {
    el.fixedGrid = document.getElementById('fixedGrid');
    el.excludedGrid = document.getElementById('excludedGrid');
    el.fixedCount = document.getElementById('fixedCount');
    el.excludedCount = document.getElementById('excludedCount');
    el.fixedMsg = document.getElementById('fixedMsg');
    el.excludedMsg = document.getElementById('excludedMsg');
    el.generateBtn = document.getElementById('generateBtn');
    el.result = document.getElementById('result');
    el.copyAllBtn = document.getElementById('copyAllBtn');
    el.history = document.getElementById('history');
    el.historyCount = document.getElementById('historyCount');
    el.clearHistoryBtn = document.getElementById('clearHistoryBtn');
    el.toast = document.getElementById('toast');
    el.toastBody = document.getElementById('toastBody');

    buildGrid(el.fixedGrid, 'fixed');
    buildGrid(el.excludedGrid, 'excluded');

    el.fixedGrid.addEventListener('click', onGridClick);
    el.excludedGrid.addEventListener('click', onGridClick);
    document.querySelectorAll('[data-action="clear"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearPicker(btn.dataset.type);
      });
    });
    el.generateBtn.addEventListener('click', generateAll);
    el.result.addEventListener('click', onResultClick);
    el.copyAllBtn.addEventListener('click', function () {
      if (state.current) copyText(formatSets(state.current));
    });
    el.history.addEventListener('click', onHistoryClick);
    el.clearHistoryBtn.addEventListener('click', clearHistory);

    if (window.bootstrap && el.toast) {
      toast = new bootstrap.Toast(el.toast, { delay: 2000 });
    }

    state.history = loadHistory();
    renderPicker();
    renderResult();
    renderHistory();
  }

  // ---------- 선택판 ----------
  function buildGrid(grid, type) {
    const label = type === 'fixed' ? '고정수' : '제외수';
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= MAX_NUMBER; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'num-btn';
      btn.textContent = n;
      btn.dataset.number = n;
      btn.setAttribute('aria-label', label + ' ' + n);
      btn.setAttribute('aria-pressed', 'false');
      frag.appendChild(btn);
    }
    grid.appendChild(frag);
  }

  function onGridClick(e) {
    const btn = e.target.closest('.num-btn');
    if (!btn || btn.disabled) return;
    const type = e.currentTarget.dataset.type;
    toggleNumber(type, Number(btn.dataset.number));
  }

  function toggleNumber(type, n) {
    const target = type === 'fixed' ? state.fixed : state.excluded;
    const other = type === 'fixed' ? state.excluded : state.fixed;
    const max = type === 'fixed' ? MAX_FIXED : MAX_EXCLUDED;

    setPickerMsg(type, '');
    if (other.has(n)) return;

    if (target.has(n)) {
      target.delete(n);
    } else if (target.size >= max) {
      setPickerMsg(type, type === 'fixed'
        ? '고정수는 최대 5개까지 고를 수 있어요.'
        : '제외수는 최대 39개까지 고를 수 있어요.');
      return;
    } else {
      target.add(n);
    }
    renderPicker();
  }

  function clearPicker(type) {
    (type === 'fixed' ? state.fixed : state.excluded).clear();
    setPickerMsg(type, '');
    renderPicker();
  }

  function setPickerMsg(type, msg) {
    (type === 'fixed' ? el.fixedMsg : el.excludedMsg).textContent = msg;
  }

  function renderPicker() {
    paintGrid(el.fixedGrid, state.fixed, state.excluded, 'fixed', '제외수로 선택됨');
    paintGrid(el.excludedGrid, state.excluded, state.fixed, 'excluded', '고정수로 선택됨');
    el.fixedCount.textContent = state.fixed.size;
    el.excludedCount.textContent = state.excluded.size;
  }

  function paintGrid(grid, own, other, cls, disabledTitle) {
    grid.querySelectorAll('.num-btn').forEach(function (btn) {
      const n = Number(btn.dataset.number);
      const selected = own.has(n);
      const blocked = other.has(n);
      btn.classList.toggle(cls, selected);
      btn.disabled = blocked;
      btn.setAttribute('aria-pressed', String(selected));
      if (blocked) {
        btn.title = disabledTitle;
      } else {
        btn.removeAttribute('title');
      }
    });
  }

  // ---------- 번호 생성 ----------
  function randomInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      // 모듈로 편향을 피하기 위해 범위를 벗어나는 값은 다시 뽑는다
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / max) * max;
      do {
        window.crypto.getRandomValues(buf);
      } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function generateSet(fixed, excluded) {
    const pool = [];
    for (let n = 1; n <= MAX_NUMBER; n++) {
      if (!fixed.has(n) && !excluded.has(n)) pool.push(n);
    }
    const picked = Array.from(fixed);
    while (picked.length < PICK_COUNT) {
      picked.push(pool.splice(randomInt(pool.length), 1)[0]);
    }
    return picked.sort(sortAsc);
  }

  function generateAll() {
    const sets = [];
    for (let i = 0; i < SET_COUNT; i++) {
      sets.push(generateSet(state.fixed, state.excluded));
    }
    const now = new Date();
    const item = {
      id: String(now.getTime()),
      createdAt: now.toISOString(),
      fixed: Array.from(state.fixed).sort(sortAsc),
      excluded: Array.from(state.excluded).sort(sortAsc),
      type: state.fixed.size > 0 ? '반자동' : '자동',
      sets: sets
    };

    state.current = item;
    state.history.unshift(item);
    if (state.history.length > MAX_HISTORY) {
      state.history.length = MAX_HISTORY;
    }
    saveHistory();
    renderResult(true);
    renderHistory();
  }

  function sortAsc(a, b) {
    return a - b;
  }

  // ---------- 렌더링 ----------
  function getBallClass(n) {
    if (n <= 10) return 'ball-yellow';
    if (n <= 20) return 'ball-blue';
    if (n <= 30) return 'ball-red';
    if (n <= 40) return 'ball-gray';
    return 'ball-green';
  }

  function ballHTML(n, isFixed, size, animate, delay) {
    const classes = ['ball', getBallClass(n)];
    if (size === 'sm') classes.push('ball-sm');
    if (isFixed) classes.push('is-fixed');
    if (animate) classes.push('pop');
    const style = animate ? ' style="animation-delay:' + delay + 's"' : '';
    const label = isFixed ? n + ' (고정수)' : String(n);
    return '<span class="' + classes.join(' ') + '"' + style + ' aria-label="' + label + '">' + n + '</span>';
  }

  function ballsHTML(set, fixed, size, animate, rowIndex) {
    return set.map(function (n, i) {
      return ballHTML(n, fixed.indexOf(n) !== -1, size, animate, (rowIndex * PICK_COUNT + i) * 0.02);
    }).join('');
  }

  function renderResult(animate) {
    const item = state.current;
    el.copyAllBtn.disabled = !item;
    if (!item) {
      el.result.innerHTML = '<p class="empty-msg text-secondary small mb-0">번호 생성 버튼을 눌러보세요.</p>';
      return;
    }
    const badgeCls = item.type === '반자동' ? 'text-bg-primary' : 'text-bg-secondary';
    el.result.innerHTML = item.sets.map(function (set, i) {
      return '<div class="set-row">' +
        '<span class="set-label">' + SET_LABELS[i] + '</span>' +
        '<div class="set-balls">' + ballsHTML(set, item.fixed, 'md', animate, i) + '</div>' +
        '<div class="set-meta">' +
          '<span class="badge ' + badgeCls + '">' + item.type + '</span>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy-set" data-index="' + i + '" aria-label="' + SET_LABELS[i] + '세트 복사">' +
            '<i class="bi bi-clipboard"></i>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderHistory() {
    el.historyCount.textContent = state.history.length;
    if (state.history.length === 0) {
      el.history.innerHTML = '<p class="empty-msg text-secondary small mb-0">번호를 생성하면 여기에 기록이 쌓입니다.</p>';
      return;
    }
    el.history.innerHTML = state.history.map(function (item, idx) {
      const sets = item.sets.map(function (set, i) {
        return '<div class="set-row">' +
          '<span class="set-label small">' + SET_LABELS[i] + '</span>' +
          '<div class="set-balls">' + ballsHTML(set, item.fixed, 'sm', false, 0) + '</div>' +
        '</div>';
      }).join('');
      return '<details class="history-item"' + (idx === 0 ? ' open' : '') + '>' +
        '<summary>' +
          '<i class="bi bi-chevron-right text-secondary"></i>' +
          '<span class="fw-semibold">' + formatTime(item.createdAt) + '</span>' +
          '<span class="text-secondary small">고정 ' + item.fixed.length + ' · 제외 ' + item.excluded.length + '</span>' +
          '<span class="history-actions">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy-history" data-id="' + item.id + '" aria-label="이 기록 복사">' +
              '<i class="bi bi-clipboard"></i>' +
            '</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-history" data-id="' + item.id + '" aria-label="이 기록 삭제">' +
              '<i class="bi bi-x-lg"></i>' +
            '</button>' +
          '</span>' +
        '</summary>' +
        '<div class="history-sets">' + sets + '</div>' +
      '</details>';
    }).join('');
  }

  // ---------- 이벤트 위임 ----------
  function onResultClick(e) {
    const btn = e.target.closest('[data-action="copy-set"]');
    if (!btn || !state.current) return;
    const i = Number(btn.dataset.index);
    copyText(formatSet(SET_LABELS[i], state.current.sets[i]));
  }

  function onHistoryClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    // summary 안 버튼을 눌러도 접기/펼치기가 되지 않도록
    e.preventDefault();
    const id = btn.dataset.id;
    if (btn.dataset.action === 'copy-history') {
      const item = state.history.find(function (h) { return h.id === id; });
      if (item) copyText(formatSets(item));
    } else if (btn.dataset.action === 'delete-history') {
      deleteHistory(id);
    }
  }

  // ---------- 기록 / 저장 ----------
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(isValidItem).slice(0, MAX_HISTORY);
    } catch (err) {
      return [];
    }
  }

  function isValidItem(item) {
    return item && typeof item.id === 'string' &&
      Array.isArray(item.sets) && item.sets.length === SET_COUNT &&
      Array.isArray(item.fixed) && Array.isArray(item.excluded);
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    } catch (err) {
      // 저장소를 쓸 수 없어도 메모리 기록으로 계속 동작한다
    }
  }

  function deleteHistory(id) {
    state.history = state.history.filter(function (h) { return h.id !== id; });
    saveHistory();
    renderHistory();
  }

  function clearHistory() {
    if (state.history.length === 0) return;
    if (!confirm('생성 기록을 모두 삭제할까요?')) return;
    state.history = [];
    saveHistory();
    renderHistory();
  }

  // ---------- 복사 ----------
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatSet(label, set) {
    return label + ': ' + set.map(pad2).join(' ');
  }

  function formatSets(item) {
    const lines = ['[로또 번호] ' + formatDateTime(item.createdAt)];
    item.sets.forEach(function (set, i) {
      lines.push(formatSet(SET_LABELS[i], set) + ' (' + item.type + ')');
    });
    return lines.join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast('복사했어요.'); })
        .catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    showToast(ok ? '복사했어요.' : '복사하지 못했어요. 다시 시도해 주세요.');
  }

  function showToast(message) {
    el.toastBody.textContent = message;
    if (toast) toast.show();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
