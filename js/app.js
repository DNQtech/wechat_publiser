const STORAGE_KEY = 'wechat-publisher-v3-demo';
const BEIJING_TZ = 'Asia/Shanghai';

const baseDrafts = [
  { id: 'd1', title: '今日运营简报：内容选题回顾', createdAt: '2026-03-12 08:30:00' },
  { id: 'd2', title: '本周行业观察：AI 工具在公众号中的应用', createdAt: '2026-03-12 09:20:00' },
  { id: 'd3', title: '活动预热：本周直播预约提醒', createdAt: '2026-03-12 10:15:00' },
  { id: 'd4', title: '产品更新说明：自动发布策略升级', createdAt: '2026-03-12 11:40:00' }
];

const defaultState = {
  user: {
    loggedIn: false,
    nickname: '演示用户',
    membership: 'visitor',
    expireAt: null
  },
  accounts: [],
  selectedAccountId: '',
  selectedPublicName: '',
  drafts: [...baseDrafts],
  selectedDraftIds: [],
  autoPublish: {
    enabled: false,
    interval: 30,
    nextRunAt: null,
    logs: []
  },
  publishLogs: []
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? mergeState(JSON.parse(raw)) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(raw) {
  return {
    ...structuredClone(defaultState),
    ...raw,
    user: { ...structuredClone(defaultState.user), ...(raw?.user || {}) },
    autoPublish: { ...structuredClone(defaultState.autoPublish), ...(raw?.autoPublish || {}) },
    accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
    drafts: Array.isArray(raw?.drafts) && raw.drafts.length ? raw.drafts : [...baseDrafts],
    publishLogs: Array.isArray(raw?.publishLogs) ? raw.publishLogs : [],
    selectedDraftIds: Array.isArray(raw?.selectedDraftIds) ? raw.selectedDraftIds : []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function parseBeijingDateTime(value) {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return new Date(value).getTime();
  const [, year, month, day, hour, minute, second = '00'] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), Number(second));
}

function formatBeijingDateTime(value) {
  const ms = typeof value === 'number' ? value : parseBeijingDateTime(value);
  if (!Number.isFinite(ms)) return '--';
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(ms));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

function formatClock(value) {
  const ms = typeof value === 'number' ? value : parseBeijingDateTime(value);
  if (!Number.isFinite(ms)) return '--';
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.format(new Date(ms));
}

function formatRemaining(ms) {
  if (!ms) return '-';
  const diff = ms - Date.now();
  if (diff <= 0) return '已到期';
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  return `${Math.max(1, minutes)}分钟`;
}

function getMembershipMeta() {
  switch (state.user.membership) {
    case 'normal':
      return {
        label: '普通用户',
        badge: 'normal',
        title: '试用激活-普通用户',
        desc: '试用版模拟 1 天有效期，可体验添加账号、手动发布与自动发布。',
        status: '试用中',
        note: '本地试用身份',
        roleTopbar: '普通用户'
      };
    case 'vip':
      return {
        label: 'VIP',
        badge: 'vip',
        title: '付费套餐激活-VIP',
        desc: 'VIP 版模拟 30 天有效期，包含完整前端演示能力，身份徽章黄色高亮。',
        status: 'VIP 有效',
        note: '本地 VIP 身份',
        roleTopbar: 'VIP'
      };
    default:
      return {
        label: '访客',
        badge: 'visitor',
        title: '登录-访客',
        desc: '已登录但未激活订阅，仅可浏览界面与帮助信息。',
        status: '未开通',
        note: '本地访客身份',
        roleTopbar: state.user.loggedIn ? '访客' : '未登录'
      };
  }
}

function hasAccess() {
  return state.user.loggedIn && ['normal', 'vip'].includes(state.user.membership) && (!state.user.expireAt || state.user.expireAt > Date.now());
}

function requireAccess(featureName) {
  if (!state.user.loggedIn) {
    showToast(`请先到会员中心切换为“登录-访客”或更高身份，再使用${featureName}`, 'info');
    switchPage('membership');
    return false;
  }
  if (!hasAccess()) {
    showToast(`当前是访客身份，无法使用${featureName}，请先激活试用或 VIP`, 'info');
    switchPage('membership');
    return false;
  }
  return true;
}

function switchPage(page) {
  document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(node => node.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
}

function renderTopbar() {
  const meta = getMembershipMeta();
  document.getElementById('user-name').textContent = state.user.loggedIn ? state.user.nickname : '未登录';
  const role = document.getElementById('user-role');
  role.textContent = meta.roleTopbar;
  role.className = `topbar-user-role ${meta.badge}`;
  document.getElementById('user-avatar').textContent = (state.user.nickname || '微').charAt(0).toUpperCase();
}

function renderOverview() {
  const meta = getMembershipMeta();
  document.getElementById('overview-role').textContent = meta.roleTopbar;
  document.getElementById('overview-account-count').textContent = String(state.accounts.length);
  document.getElementById('overview-draft-count').textContent = String(state.drafts.length);
  document.getElementById('overview-auto-status').textContent = state.autoPublish.enabled ? '已启用' : '未启用';
}

function renderAccounts() {
  const container = document.getElementById('accounts-list');
  if (!state.accounts.length) {
    container.innerHTML = '<div class="empty-card">暂无微信账号。纯前端版支持在本地添加 mock 账号进行演示。</div>';
    renderSelectors();
    return;
  }

  container.innerHTML = state.accounts.map(account => {
    const first = (account.name || '微').charAt(0).toUpperCase();
    const tags = (account.publicAccounts || []).map(item => `<span class="tag">${item}</span>`).join('');
    return `
      <div class="account-card">
        <div class="account-main">
          <div class="account-avatar">${first}</div>
          <div>
            <div class="account-name">${escapeHtml(account.name)}</div>
            <div class="account-meta">${account.publicAccounts.length} 个公众号 · 更新 ${formatBeijingDateTime(account.updatedAt)}</div>
            <div class="account-tags">${tags}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" data-remove-account="${account.id}">删除</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-remove-account]').forEach(button => {
    button.addEventListener('click', () => {
      state.accounts = state.accounts.filter(item => item.id !== button.dataset.removeAccount);
      if (state.selectedAccountId === button.dataset.removeAccount) {
        state.selectedAccountId = state.accounts[0]?.id || '';
      }
      saveState();
      renderAll();
      showToast('已删除本地 mock 账号', 'info');
    });
  });

  renderSelectors();
}

function renderSelectors() {
  const wechatSelect = document.getElementById('wechat-select');
  const accountSelect = document.getElementById('account-select');
  wechatSelect.innerHTML = '';
  accountSelect.innerHTML = '';

  if (!state.accounts.length) {
    wechatSelect.innerHTML = '<option value="">暂无微信账号</option>';
    accountSelect.innerHTML = '<option value="">暂无公众号</option>';
    return;
  }

  if (!state.selectedAccountId || !state.accounts.some(item => item.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0].id;
  }

  state.accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.name;
    wechatSelect.appendChild(option);
  });

  wechatSelect.value = state.selectedAccountId;
  const current = state.accounts.find(item => item.id === state.selectedAccountId) || state.accounts[0];
  (current.publicAccounts || []).forEach(publicName => {
    const option = document.createElement('option');
    option.value = publicName;
    option.textContent = publicName;
    accountSelect.appendChild(option);
  });

  state.selectedPublicName = state.selectedPublicName && current.publicAccounts.includes(state.selectedPublicName)
    ? state.selectedPublicName
    : current.publicAccounts[0] || '';
  accountSelect.value = state.selectedPublicName;
  saveState();
}

function renderDrafts() {
  const list = document.getElementById('draft-list');
  if (!state.drafts.length) {
    list.innerHTML = '<div class="empty-card">暂无草稿，请点击“同步草稿”生成当日 mock 草稿。</div>';
    document.getElementById('selected-count').textContent = '0';
    return;
  }

  list.innerHTML = state.drafts.map(draft => {
    const selected = state.selectedDraftIds.includes(draft.id);
    return `
      <div class="draft-item ${selected ? 'selected' : ''}" data-draft-id="${draft.id}">
        <div class="draft-check"></div>
        <div>
          <div class="draft-title">${escapeHtml(draft.title)}</div>
          <div class="draft-meta">创建时间：${formatBeijingDateTime(draft.createdAt)} · 当天草稿</div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('selected-count').textContent = String(state.selectedDraftIds.length);

  list.querySelectorAll('[data-draft-id]').forEach(node => {
    node.addEventListener('click', () => {
      const { draftId } = node.dataset;
      if (state.selectedDraftIds.includes(draftId)) {
        state.selectedDraftIds = state.selectedDraftIds.filter(item => item !== draftId);
      } else {
        state.selectedDraftIds = [...state.selectedDraftIds, draftId];
      }
      saveState();
      renderDrafts();
    });
  });
}

function renderAutoPanel() {
  const toggle = document.getElementById('auto-toggle');
  toggle.classList.toggle('on', state.autoPublish.enabled);
  toggle.setAttribute('aria-pressed', String(state.autoPublish.enabled));
  document.getElementById('interval-input').value = state.autoPublish.interval;
  document.getElementById('next-run-info').textContent = state.autoPublish.nextRunAt
    ? `下次运行：${formatBeijingDateTime(state.autoPublish.nextRunAt)}`
    : '未配置';

  const content = document.getElementById('auto-log-content');
  if (!state.autoPublish.logs.length) {
    content.innerHTML = '<div class="log-entry">暂无自动发布日志</div>';
    return;
  }

  content.innerHTML = state.autoPublish.logs.slice(-20).reverse().map(log => (
    `<div class="log-entry"><span class="time">${formatClock(log.time)}</span>${escapeHtml(log.message)}</div>`
  )).join('');
}

function renderPublishLogs() {
  const body = document.getElementById('publish-logs-body');
  if (!state.publishLogs.length) {
    body.innerHTML = '<tr><td colspan="5" class="subtle-text">暂无发布记录</td></tr>';
    return;
  }

  body.innerHTML = [...state.publishLogs].reverse().map(log => `
    <tr>
      <td>${formatBeijingDateTime(log.time)}</td>
      <td>${escapeHtml(log.account)}</td>
      <td>${escapeHtml(log.title)}</td>
      <td><span class="badge method">${log.method === 'masssend' ? '群发' : '普通发布'}</span></td>
      <td><span class="badge ${log.status === 'success' ? 'success' : 'error'}">${log.status === 'success' ? '成功' : '失败'}</span></td>
    </tr>
  `).join('');
}

function renderMembership() {
  const meta = getMembershipMeta();
  document.getElementById('identity-badge').className = `identity-badge ${meta.badge}`;
  document.getElementById('identity-badge').textContent = meta.label;
  document.getElementById('identity-title').textContent = meta.title;
  document.getElementById('identity-desc').textContent = meta.desc;
  document.getElementById('membership-status').textContent = meta.status;
  document.getElementById('membership-expire').textContent = state.user.expireAt ? formatBeijingDateTime(state.user.expireAt) : '-';
  document.getElementById('membership-remaining').textContent = state.user.expireAt ? formatRemaining(state.user.expireAt) : '-';
  document.getElementById('membership-note').textContent = meta.note;
}

function renderAll() {
  saveState();
  renderTopbar();
  renderOverview();
  renderAccounts();
  renderDrafts();
  renderAutoPanel();
  renderPublishLogs();
  renderMembership();
}

function createMockAccount(name) {
  return {
    id: `wx_${Date.now()}`,
    name,
    updatedAt: Date.now(),
    publicAccounts: [`${name}订阅号`, `${name}运营号`]
  };
}

function mockSyncDrafts() {
  if (!requireAccess('同步草稿')) return;
  const current = state.accounts.find(item => item.id === state.selectedAccountId);
  const now = Date.now();
  state.drafts = baseDrafts.map((draft, index) => ({
    ...draft,
    id: `${draft.id}_${current?.id || 'demo'}_${index}`,
    title: `${current?.name || '演示微信'} · ${draft.title}`,
    createdAt: formatBeijingDateTime(now - index * 27 * 60000)
  }));
  state.selectedDraftIds = [];
  addAutoLog('已同步当天草稿箱 mock 数据');
  saveState();
  renderAll();
  showToast('已同步 mock 草稿箱', 'success');
}

function manualPublish() {
  if (!requireAccess('手动发布')) return;
  if (!state.selectedDraftIds.length) {
    showToast('请先选择草稿', 'info');
    return;
  }
  const currentAccount = document.getElementById('account-select').value || '未选择公众号';
  const method = document.getElementById('publish-method').value;
  const selected = state.drafts.filter(item => state.selectedDraftIds.includes(item.id));
  selected.forEach(draft => {
    state.publishLogs.push({
      time: Date.now(),
      account: currentAccount,
      title: draft.title,
      method,
      status: 'success'
    });
  });
  state.selectedDraftIds = [];
  addAutoLog(`手动发布完成，共 ${selected.length} 篇`);
  saveState();
  renderAll();
  showToast(`已发布 ${selected.length} 篇 mock 文章`, 'success');
}

function addAutoLog(message) {
  state.autoPublish.logs.push({ time: Date.now(), message });
}

function toggleAutoPublish() {
  if (!requireAccess('自动发布')) return;
  const raw = Number(document.getElementById('interval-input').value || 30);
  state.autoPublish.interval = Math.max(10, raw || 30);
  state.autoPublish.enabled = !state.autoPublish.enabled;
  state.autoPublish.nextRunAt = state.autoPublish.enabled ? Date.now() + state.autoPublish.interval * 60000 : null;
  addAutoLog(state.autoPublish.enabled
    ? `自动发布已开启，间隔 ${state.autoPublish.interval} 分钟`
    : '自动发布已停止');
  saveState();
  renderAll();
  showToast(state.autoPublish.enabled ? '自动发布已开启' : '自动发布已停止', state.autoPublish.enabled ? 'success' : 'info');
}

function runAutoPublishNow() {
  if (!requireAccess('自动发布')) return;
  const currentAccount = document.getElementById('account-select').value || '未选择公众号';
  const publishedCount = state.drafts.length;
  state.publishLogs.push(...state.drafts.map(draft => ({
    time: Date.now(),
    account: currentAccount,
    title: draft.title,
    method: 'masssend',
    status: 'success'
  })));
  state.autoPublish.nextRunAt = Date.now() + state.autoPublish.interval * 60000;
  addAutoLog(`立即执行完成，已自动发布当天草稿箱全部文章（${publishedCount} 篇）`);
  saveState();
  renderAll();
  showToast(`已自动发布 ${publishedCount} 篇 mock 文章`, 'success');
}

function clearLogs() {
  state.publishLogs = [];
  state.autoPublish.logs = [];
  saveState();
  renderAll();
  showToast('已清空本地日志', 'info');
}

function selectAllDrafts() {
  if (!state.drafts.length) return;
  const allSelected = state.selectedDraftIds.length === state.drafts.length;
  state.selectedDraftIds = allSelected ? [] : state.drafts.map(item => item.id);
  saveState();
  renderDrafts();
}

function openAccountModal() {
  if (!requireAccess('添加微信账号')) return;
  document.getElementById('account-name-input').value = '';
  document.getElementById('account-modal').classList.remove('hidden');
  document.getElementById('account-name-input').focus();
}

function closeAccountModal() {
  document.getElementById('account-modal').classList.add('hidden');
}

function saveAccount() {
  if (!requireAccess('添加微信账号')) return;
  const input = document.getElementById('account-name-input');
  const name = input.value.trim();
  if (!name) {
    showToast('请输入账号备注', 'error');
    return;
  }
  const account = createMockAccount(name);
  state.accounts.unshift(account);
  state.selectedAccountId = account.id;
  state.selectedPublicName = account.publicAccounts[0];
  saveState();
  closeAccountModal();
  renderAll();
  showToast('已添加本地 mock 账号', 'success');
}

function setMembership(type) {
  state.user.loggedIn = true;
  state.user.membership = type;
  state.user.nickname = '蔡高成';
  if (type === 'normal') {
    state.user.expireAt = Date.now() + 24 * 60 * 60 * 1000;
  } else if (type === 'vip') {
    state.user.expireAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  } else {
    state.user.expireAt = null;
  }
  saveState();
  renderAll();
  showToast(type === 'visitor' ? '已切换为登录-访客' : type === 'normal' ? '已切换为试用-普通用户' : '已切换为 VIP', 'success');
}

function resetSession() {
  state = structuredClone(defaultState);
  saveState();
  renderAll();
  switchPage('overview');
  showToast('已重置本地会话', 'info');
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => switchPage(button.dataset.page));
  });

  document.querySelectorAll('[data-jump]').forEach(button => {
    button.addEventListener('click', () => switchPage(button.dataset.jump));
  });

  document.getElementById('btn-add-account').addEventListener('click', openAccountModal);
  document.getElementById('btn-save-account').addEventListener('click', saveAccount);
  document.querySelectorAll('[data-close-modal]').forEach(node => node.addEventListener('click', closeAccountModal));
  document.getElementById('btn-sync-drafts').addEventListener('click', mockSyncDrafts);
  document.getElementById('btn-manual-publish').addEventListener('click', manualPublish);
  document.getElementById('btn-select-all').addEventListener('click', selectAllDrafts);
  document.getElementById('auto-toggle').addEventListener('click', toggleAutoPublish);
  document.getElementById('btn-run-now').addEventListener('click', runAutoPublishNow);
  document.getElementById('btn-clear-logs').addEventListener('click', clearLogs);
  document.getElementById('btn-reset-session').addEventListener('click', resetSession);

  document.getElementById('interval-input').addEventListener('change', event => {
    const value = Math.max(10, Number(event.target.value || 30));
    state.autoPublish.interval = value;
    event.target.value = value;
    saveState();
    renderAutoPanel();
  });

  document.getElementById('wechat-select').addEventListener('change', event => {
    state.selectedAccountId = event.target.value;
    state.selectedPublicName = '';
    saveState();
    renderSelectors();
  });

  document.getElementById('account-select').addEventListener('change', event => {
    state.selectedPublicName = event.target.value;
    saveState();
  });

  document.querySelectorAll('[data-membership]').forEach(button => {
    button.addEventListener('click', () => setMembership(button.dataset.membership));
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

bindEvents();
renderAll();
