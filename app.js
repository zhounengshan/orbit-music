const tracks = [];

let visibleTracks = [...tracks];
let currentIndex = 0;
let activeTrack = null;
let playQueue = [...tracks];
let isPlaying = false;
let isManageMode = false;
let lyricTranslation = true;
let audioUrls = new Map();
let localTracks = [];
let searchTracks = [];
let webdavTracks = [];
let webdavEntries = [];
let webdavToken = sessionStorage.getItem('orbit-webdav-token') || '';
let webdavCurrentPath = '/';
let activeView = 'discover';
let searchSerial = 0;
let activePlaylistName = null;
let searchPage = 1;
let searchTotal = 0;
let searchKeyword = '';
let searchPlatform = 'all';
let searchLoadingMore = false;
let searchHasMore = false;
let searchFetchedCount = 0;
let artistFilter = '';
let homeFeatureTrack = null;
let homeArtworkLoaded = false;
let searchHistory = JSON.parse(localStorage.getItem('orbit-search-history') || '[]');
const lyricColors = [{name:'暖白',value:'#ffffff'},{name:'珊瑚橙',value:'#ff8a68'},{name:'薄荷绿',value:'#91ead5'},{name:'浅紫',value:'#c9b5ff'}];
let lyricColorIndex = Math.max(0, lyricColors.findIndex(color => color.name === localStorage.getItem('orbit-lyric-color')));
let selectionSerial = 0;
let shuffleEnabled = false;
let unshuffledQueue = [];
let playbackSession = null;
let downloadRenderTimer = 0;
const audio = document.querySelector('#audio');
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  favorites: new Set(JSON.parse(localStorage.getItem('orbit-favorites') || '[]').map(String)),
  downloads: JSON.parse(localStorage.getItem('orbit-downloads') || '[]').map(String),
  playlists: JSON.parse(localStorage.getItem('orbit-playlists') || '[]'),
  playlistTracks: JSON.parse(localStorage.getItem('orbit-playlist-tracks') || '{}'),
  remoteLibrary: JSON.parse(localStorage.getItem('orbit-remote-library') || '{}'),
  downloadRecords: JSON.parse(localStorage.getItem('orbit-download-records') || '{}'),
  cloudConfig: JSON.parse(localStorage.getItem('orbit-cloud-config') || '{}')
};

state.downloads.forEach(id => {
  state.downloadRecords[String(id)] ||= {status:'completed', progress:100, legacy:true, completedAt:0};
});

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const allTracks = () => {
  const byId = new Map();
  [...tracks, ...Object.values(state.remoteLibrary), ...searchTracks, ...localTracks, ...webdavTracks].forEach(track => byId.set(String(track.id), track));
  return [...byId.values()];
};
const libraryTracks = () => {
  const byId = new Map();
  [...tracks, ...localTracks].forEach(track => byId.set(String(track.id), track));
  state.downloads.forEach(id => {
    const track = state.remoteLibrary[String(id)];
    const record = state.downloadRecords[String(id)];
    if (track && (!record || record.status === 'completed')) byId.set(String(track.id), track);
  });
  return [...byId.values()];
};

function persistedTrack(track) {
  const saved = {...track};
  delete saved.resolvedUrl;
  delete saved.lyrics;
  delete saved.localUrl;
  return saved;
}

function saveState() {
  localStorage.setItem('orbit-favorites', JSON.stringify([...state.favorites]));
  localStorage.setItem('orbit-downloads', JSON.stringify(state.downloads));
  localStorage.setItem('orbit-playlists', JSON.stringify(state.playlists));
  localStorage.setItem('orbit-playlist-tracks', JSON.stringify(state.playlistTracks));
  localStorage.setItem('orbit-remote-library', JSON.stringify(state.remoteLibrary));
  localStorage.setItem('orbit-download-records', JSON.stringify(state.downloadRecords));
  localStorage.setItem('orbit-cloud-config', JSON.stringify(state.cloudConfig || {}));
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1900);
}

function formatTime(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(Math.floor(n % 60)).padStart(2,'0')}`;
}

function renderPlaylists() {
  $('#playlistNav').innerHTML = state.playlists.length
    ? state.playlists.map(name => `<div class="playlist-item"><button class="playlist-link" data-playlist-name="${name.replaceAll('"','&quot;')}">${escapeHtml(name)}<span>${(state.playlistTracks[name] || []).length}</span></button><button class="playlist-add" data-add-playlist="${name.replaceAll('"','&quot;')}" aria-label="将当前歌曲加入 ${escapeHtml(name)}">+</button></div>`).join('')
    : '<p class="playlist-empty">还没有歌单</p>';
}

function getTrackById(id) { return allTracks().find(t => String(t.id) === String(id)); }

function downloadStatus(id) {
  const record = state.downloadRecords[String(id)];
  if (!record) return '';
  if (record.status === 'preparing') return '正在准备下载';
  if (record.status === 'downloading') return `下载中 ${Math.max(0, Math.min(100, Math.round(record.progress || 0)))}%`;
  if (record.status === 'completed') return record.size ? `已下载 · ${(record.size / 1024 / 1024).toFixed(1)} MB` : '已下载';
  if (record.status === 'failed') return '下载失败 · 点下载重试';
  return '';
}

function downloadActionContent(track) {
  const record = state.downloadRecords[String(track.id)];
  if (record?.status === 'downloading' || record?.status === 'preparing') return '<span class="download-spinner" aria-hidden="true"></span>';
  if (record?.status === 'completed') return icon('check');
  return icon('download');
}

function renderTracks(list = visibleTracks) {
  const table = $('#trackTable');
  table.classList.toggle('manage-mode', isManageMode);
  table.innerHTML = list.map((track, index) => `
    <article class="track-row ${String(currentTrack()?.id) === String(track.id) ? 'is-current' : ''}" data-id="${escapeHtml(track.id)}">
      <button class="track-index icon-btn row-play" data-action="play" aria-label="播放 ${escapeHtml(track.title)}">${String(currentTrack()?.id) === String(track.id) && isPlaying ? icon('pause') : String(index + 1).padStart(2,'0')}</button>
      <div class="track-meta"><div class="track-cover ${track.cover ? 'has-image' : `cover-${track.color ?? index % 6}`}" ${track.cover ? `style="background-image:url('${escapeHtml(track.cover)}')"` : ''}>${track.cover ? '' : `<span>${String(index + 1).padStart(2,'0')}</span>`}</div><div class="track-name"><strong>${escapeHtml(track.title)}</strong>${track.remote ? `<button class="artist-link" data-action="artist" aria-label="查看歌手 ${escapeHtml(track.artist)} 的歌曲">${escapeHtml(track.artist)}</button>` : `<span>${escapeHtml(track.artist)}</span>`}${downloadStatus(track.id) ? `<small class="download-status status-${escapeHtml(state.downloadRecords[String(track.id)]?.status)}">${escapeHtml(downloadStatus(track.id))}</small>` : ''}</div></div>
      <span class="album-name">${escapeHtml(track.album || '未知专辑')}</span>
      <span class="quality">${escapeHtml(track.quality || 'MP3')}</span>
      <span class="track-time">${formatTime(track.duration || 32)}</span>
      <div class="track-actions">
        <button class="play-track-btn" data-action="play" aria-label="播放 ${escapeHtml(track.title)}">${icon('play')}<b>播放</b></button>
        <button class="icon-btn ${state.favorites.has(String(track.id))?'active':''}" data-action="favorite" aria-label="收藏 ${escapeHtml(track.title)}">${icon('heart')}</button>
        <button class="icon-btn queue-add-btn" data-action="queue" aria-label="将 ${escapeHtml(track.title)} 加入播放队列">${icon('plus')}</button>
        <button class="icon-btn download-btn ${state.downloadRecords[String(track.id)]?.status || ''}" data-action="download" aria-label="下载 ${escapeHtml(track.title)}">${downloadActionContent(track)}</button>
        <button class="icon-btn delete-btn" data-action="delete" aria-label="删除 ${track.title}">${icon('close')}</button>
      </div>
    </article>`).join('');
  $('#emptyState').hidden = list.length > 0;
  $('#libraryCount').textContent = libraryTracks().length;
  $('#favoriteCount').textContent = state.favorites.size;
  $('#downloadCount').textContent = state.downloads.length;
}

function updateSearchPagination() {
  const pagination = $('#searchPagination');
  const button = $('#loadMoreBtn');
  pagination.hidden = (!searchTracks.length && !artistFilter) || !searchHasMore;
  button.disabled = searchLoadingMore;
  button.textContent = searchLoadingMore ? '正在加载…' : '加载更多';
  $('#searchProgress').textContent = artistFilter ? `已找到 ${searchTracks.length} 首${searchHasMore ? ' · 可继续加载' : ''}` : searchTotal ? `已显示 ${searchTracks.length} / ${searchTotal} 首` : `已显示 ${searchTracks.length} 首`;
}

function currentTrack() { return activeTrack; }

const LOCAL_API_ORIGIN = new URL('./', window.location.href);
const REMOTE_API_ORIGIN = new URL('https://www.wuhaoxuesheng.cn/suiwoting/');
const IS_NATIVE_APP = location.protocol === 'suiwoting:';

function apiUrl(path, params = {}) {
  const cleanPath = String(path).replace(/^\/+/, '');
  // WebDAV credentials stay inside the native app. Public music APIs can be
  // called directly (the server enables CORS), avoiding a custom-scheme
  // response path that some iOS/WebKit versions translate into HTTP 502.
  const origin = cleanPath.startsWith('api/webdav/') ? LOCAL_API_ORIGIN : REMOTE_API_ORIGIN;
  const url = new URL(cleanPath, origin);
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== null && url.searchParams.set(key, value));
  return url;
}

async function api(path, params) {
  const url = apiUrl(path, params);
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code !== 0) throw new Error(body.msg || `请求失败（${response.status}）`);
  return body;
}

async function apiPost(path, payload) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(payload || {})
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code !== 0) throw new Error(body.msg || `请求失败（${response.status}）`);
  return body;
}

const WEBDAV_AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg', 'opus']);

function cloudPassword() {
  return localStorage.getItem('orbit-cloud-password') || sessionStorage.getItem('orbit-cloud-password') || '';
}

function parentCloudPath(value) {
  const parts = String(value || '/').split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}` || '/';
}

function webdavTrack(entry, index) {
  const extension = entry.name.split('.').pop().toLowerCase();
  const folder = parentCloudPath(entry.path).split('/').filter(Boolean).pop() || '我的网盘';
  return {
    id:`webdav:${entry.path}`,
    webdav:true,
    title:entry.name.replace(/\.[^.]+$/, ''),
    artist:'网盘音乐',
    album:folder,
    quality:extension.toUpperCase(),
    duration:0,
    size:entry.size,
    webdavPath:entry.path,
    color:index % 6
  };
}

function renderCloudDirectory() {
  const directories = webdavEntries.filter(entry => entry.isDirectory);
  const audioEntries = webdavEntries.filter(entry => !entry.isDirectory && WEBDAV_AUDIO_EXTENSIONS.has(entry.name.split('.').pop().toLowerCase()));
  webdavTracks = audioEntries.map(webdavTrack);
  visibleTracks = webdavTracks;
  $('#cloudPath').textContent = webdavCurrentPath;
  $('#cloudBackBtn').disabled = webdavCurrentPath === '/';
  $('#cloudDirectories').innerHTML = directories.length
    ? directories.map(entry => `<button class="cloud-folder" data-cloud-path="${escapeHtml(entry.path)}"><svg class="icon"><use href="#icon-folder"/></svg><span>${escapeHtml(entry.name)}</span><b>›</b></button>`).join('')
    : '';
  $('#cloudSetup').hidden = true;
  $('#cloudBrowser').hidden = false;
  $('#cloudStatus').textContent = '已连';
  $('.table-head').hidden = false;
  renderTracks(webdavTracks);
  $('#emptyState').hidden = directories.length > 0 || webdavTracks.length > 0;
  if (!$('#emptyState').hidden) {
    $('#emptyState h2').textContent = '这个目录没有音乐';
    $('#emptyState p').textContent = '请选择其他目录，支持 MP3、FLAC、M4A、AAC、WAV、OGG 和 OPUS。';
  }
}

function renderCloudDisconnected(message = '') {
  webdavTracks = [];
  webdavEntries = [];
  $('#cloudSetup').hidden = false;
  $('#cloudBrowser').hidden = true;
  $('#cloudStatus').textContent = '未连';
  $('#trackTable').innerHTML = '';
  $('.table-head').hidden = true;
  $('#emptyState').hidden = true;
  if (message) toast(message);
}

async function loadCloudDirectory(itemPath = webdavCurrentPath) {
  if (!webdavToken) return renderCloudDisconnected();
  $('#cloudDirectories').innerHTML = '<div class="cloud-loading"><span class="download-spinner"></span>正在读取网盘目录…</div>';
  $('#trackTable').innerHTML = '';
  $('#emptyState').hidden = true;
  try {
    const result = await api('/api/webdav/list', {token:webdavToken, path:itemPath});
    webdavCurrentPath = result.data?.path || '/';
    webdavEntries = result.data?.entries || [];
    renderCloudDirectory();
  } catch (error) {
    if (/过期|授权/.test(error.message || '')) {
      webdavToken = '';
      sessionStorage.removeItem('orbit-webdav-token');
      renderCloudDisconnected(error.message);
      return;
    }
    $('#cloudDirectories').innerHTML = `<div class="cloud-error">${escapeHtml(error.message || '网盘目录读取失败')}</div>`;
  }
}

function openCloudModal() {
  if (!IS_NATIVE_APP) return toast('网盘连接请在 iPhone App 中使用');
  const config = state.cloudConfig || {};
  $('#cloudBaseUrl').value = config.baseUrl || '';
  $('#cloudUsername').value = config.username || '';
  $('#cloudRootPath').value = config.path || '/';
  $('#cloudPassword').value = cloudPassword();
  $('#cloudRemember').checked = Boolean(localStorage.getItem('orbit-cloud-password'));
  $('#disconnectCloudBtn').hidden = !webdavToken;
  $('#cloudModal').hidden = false;
  setTimeout(() => (config.baseUrl ? $('#cloudPassword') : $('#cloudBaseUrl')).focus(), 50);
}

async function connectCloud(event) {
  event?.preventDefault();
  if (!IS_NATIVE_APP) return toast('浏览器版暂不支持网盘连接');
  const baseUrl = $('#cloudBaseUrl').value.trim();
  const username = $('#cloudUsername').value.trim();
  const password = $('#cloudPassword').value;
  const path = $('#cloudRootPath').value.trim() || '/';
  const remember = $('#cloudRemember').checked;
  const button = $('#connectCloudBtn');
  button.disabled = true;
  button.textContent = '正在连接…';
  try {
    const result = await apiPost('/api/webdav/connect', {baseUrl, username, password, path});
    webdavToken = result.data.token;
    webdavCurrentPath = result.data.path || '/';
    webdavEntries = result.data.entries || [];
    sessionStorage.setItem('orbit-webdav-token', webdavToken);
    state.cloudConfig = {baseUrl, username, path};
    saveState();
    sessionStorage.setItem('orbit-cloud-password', password);
    if (remember) localStorage.setItem('orbit-cloud-password', password);
    else localStorage.removeItem('orbit-cloud-password');
    $('#cloudModal').hidden = true;
    renderCloudDirectory();
    toast('网盘连接成功');
  } catch (error) {
    toast(error.message || '网盘连接失败');
  } finally {
    button.disabled = false;
    button.textContent = '连接并浏览';
  }
}

async function disconnectCloud() {
  const token = webdavToken;
  webdavToken = '';
  sessionStorage.removeItem('orbit-webdav-token');
  sessionStorage.removeItem('orbit-cloud-password');
  localStorage.removeItem('orbit-cloud-password');
  if (token) apiPost('/api/webdav/disconnect', {token}).catch(() => {});
  $('#cloudModal').hidden = true;
  renderCloudDisconnected('已断开网盘');
}

function parseLrc(text) {
  const output = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const times = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const words = line.replace(/\[[^\]]+\]/g, '').trim();
    if (!words || !times.length) return;
    times.forEach(match => output.push([Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`), words, '']));
  });
  return output.sort((a, b) => a[0] - b[0]);
}

function uniqueTracks(list) {
  const seen = new Set();
  return list.filter(track => track && !seen.has(String(track.id)) && seen.add(String(track.id)));
}

function shuffleTracks(list, keepTrack = currentTrack()) {
  const pool = uniqueTracks(list).filter(track => String(track.id) !== String(keepTrack?.id));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }
  return keepTrack ? [keepTrack, ...pool] : pool;
}

function setPlayQueue(list, preserveCurrent = true) {
  const next = uniqueTracks(list);
  unshuffledQueue = [...next];
  playQueue = shuffleEnabled ? shuffleTracks(next, preserveCurrent ? currentTrack() : null) : next;
  currentIndex = Math.max(0, playQueue.findIndex(track => String(track.id) === String(currentTrack()?.id)));
  renderQueue();
}

function addToQueue(track, playNext = false) {
  if (!track) return;
  const id = String(track.id);
  playQueue = playQueue.filter(item => String(item.id) !== id);
  const insertAt = playNext && currentTrack() ? Math.max(0, currentIndex + 1) : playQueue.length;
  playQueue.splice(insertAt, 0, track);
  unshuffledQueue = [...playQueue];
  if (track.remote || track.webdav) state.remoteLibrary[id] = persistedTrack(track);
  saveState();
  renderQueue();
  toast(playNext ? '已设为下一首' : '已加入播放队列');
}

function renderQueue() {
  const list = $('#queueList');
  if (!list) return;
  $('#queueSummary').textContent = `${playQueue.length} 首歌曲${shuffleEnabled ? ' · 随机' : ''}`;
  $('#queueEmpty').hidden = playQueue.length > 0;
  list.innerHTML = playQueue.map((track, index) => `
    <article class="queue-row ${String(track.id) === String(currentTrack()?.id) ? 'is-current' : ''}" data-queue-index="${index}">
      <div class="queue-cover ${track.cover ? 'has-image' : `cover-${track.color ?? index % 6}`}" ${track.cover ? `style="background-image:url('${escapeHtml(track.cover)}')"` : ''}></div>
      <button class="queue-track" data-queue-action="play"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></button>
      <div class="queue-row-actions">
        <button data-queue-action="up" aria-label="向上移动" ${index === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button>
        <button data-queue-action="down" aria-label="向下移动" ${index === playQueue.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button>
        <button data-queue-action="remove" aria-label="从队列移除"><svg class="icon"><use href="#icon-close"/></svg></button>
      </div>
    </article>`).join('');
}

function openQueue() {
  if ($('#lyricsPanel').classList.contains('open')) closeLyrics(false);
  renderQueue();
  setPrimaryUIInert(true);
  $('#queuePanel').inert = false;
  $('#queuePanel').setAttribute('aria-hidden', 'false');
  $('#queuePanel').classList.add('open');
  $('#queueScrim').classList.add('open');
  $('#queueBtn').setAttribute('aria-expanded', 'true');
  $('#queueGrabber').focus();
}

function closeQueue() {
  $('#queuePanel').classList.remove('open');
  $('#queueScrim').classList.remove('open');
  $('#queuePanel').setAttribute('aria-hidden', 'true');
  $('#queuePanel').inert = true;
  $('#queueBtn').setAttribute('aria-expanded', 'false');
  setPrimaryUIInert(false);
  $('#queueBtn').focus();
}

let queueSwipe = null;
$('#queuePanel').addEventListener('pointerdown', event => {
  if (!event.target.closest('.queue-grabber, .queue-head') || event.target.closest('button:not(.queue-grabber)')) return;
  queueSwipe = {y:event.clientY, x:event.clientX, at:Date.now()};
}, {passive:true});
$('#queuePanel').addEventListener('pointerup', event => {
  if (!queueSwipe) return;
  const dy = event.clientY - queueSwipe.y;
  const dx = event.clientX - queueSwipe.x;
  const quick = Date.now() - queueSwipe.at < 900;
  queueSwipe = null;
  if (quick && dy > 65 && dy > Math.abs(dx) * 1.2) closeQueue();
}, {passive:true});
$('#queuePanel').addEventListener('pointercancel', () => { queueSwipe = null; }, {passive:true});

async function refreshRemoteTrack(track) {
  const signedAt = Number(track.time) || 0;
  const signatureIsFresh = track.sign && signedAt && Math.abs(Date.now() / 1000 - signedAt) < 240;
  const isPersistedFavorite = state.remoteLibrary[String(track.id)] === track;
  if (!isPersistedFavorite && signatureIsFresh && Array.isArray(track.minfo) && track.minfo.length) return track;

  const result = await api('/api/search', {keyword: track.title, platform: track.platform, page: 1, size: 20});
  const items = result.data?.list || [];
  const match = items.find(item => String(item.id) === String(track.sourceId)) || items[0];
  if (!match) throw new Error('收藏歌曲已失效，请重新搜索后收藏');

  const fresh = normalizeRemote(match, track.platform, track.color || 0);
  Object.assign(track, fresh, {id: track.id, resolvedUrl: ''});
  const id = String(track.id);
  if (state.remoteLibrary[id]) {
    const saved = {...track};
    delete saved.resolvedUrl;
    delete saved.lyrics;
    state.remoteLibrary[id] = saved;
    saveState();
  }
  return track;
}

function orderedMediaInfo(track) {
  const rank = item => item.format === 'mp3' && String(item.bitrate) === '320' ? 0
    : item.format === 'mp3' ? 1
      : item.format === 'flac' ? 2 : 3;
  return [...(track.minfo || [])]
    .sort((a, b) => rank(a) - rank(b))
    .filter((item, index, list) => list.findIndex(other => `${other.format}:${other.bitrate}` === `${item.format}:${item.bitrate}`) === index);
}

function playbackCandidates(track, label = '') {
  return orderedMediaInfo(track).map(info => ({
    label: label || `${track.platform === 'wyy' ? '网易云' : '酷我'} ${String(info.format || 'mp3').toUpperCase()}${info.bitrate ? ` ${info.bitrate}K` : ''}`,
    platform: track.platform,
    sourceId: track.sourceId,
    format: info.format,
    bitrate: info.bitrate,
    time: track.time,
    sign: track.sign
  }));
}

function usePlaybackCandidate(candidate, autoplay = true) {
  if (!candidate) return false;
  const params = {platform:candidate.platform, songid:candidate.sourceId, format:candidate.format, bitrate:candidate.bitrate, time:candidate.time, sign:candidate.sign};
  audio.src = apiUrl('/api/stream', params).href;
  audio.volume = Number($('#volume').value) / 100;
  if (autoplay) playAudio();
  return true;
}

async function loadAlternateCandidates(track) {
  const platforms = ['kuwo', 'wyy'].filter(platform => platform !== track.platform);
  for (const platform of platforms) {
    try {
      const result = await api('/api/search', {keyword:`${track.title} ${track.artist}`, platform, page:1, size:20});
      const items = result.data?.list || [];
      const normalizedArtist = String(track.artist || '').replace(/\s+/g, '').toLowerCase();
      const normalizedTitle = String(track.title || '').replace(/\s+/g, '').toLowerCase();
      const item = items.find(candidate => String(candidate.artist || '').replace(/\s+/g, '').toLowerCase().includes(normalizedArtist))
        || items.find(candidate => String(candidate.name || '').replace(/\s+/g, '').toLowerCase().includes(normalizedTitle))
        || items[0];
      if (!item) continue;
      const alternate = normalizeRemote(item, platform, track.color || 0);
      await refreshRemoteTrack(alternate);
      const candidates = playbackCandidates(alternate, `${platform === 'wyy' ? '网易云' : '酷我'}备用源`);
      if (candidates.length) return candidates;
    } catch (_) {
      // Try the next supported platform.
    }
  }
  return [];
}

async function recoverPlayback() {
  if (!activeTrack?.remote || !playbackSession || playbackSession.recovering || playbackSession.trackId !== String(activeTrack.id)) return;
  playbackSession.recovering = true;
  try {
    let nextIndex = playbackSession.index + 1;
    if (nextIndex >= playbackSession.candidates.length && !playbackSession.alternateLoaded) {
      playbackSession.alternateLoaded = true;
      toast('当前音源不可用，正在自动换源…');
      const alternates = await loadAlternateCandidates(activeTrack);
      playbackSession.candidates.push(...alternates);
    }
    nextIndex = playbackSession.index + 1;
    if (nextIndex < playbackSession.candidates.length) {
      playbackSession.index = nextIndex;
      const next = playbackSession.candidates[nextIndex];
      toast(`正在尝试：${next.label}`);
      usePlaybackCandidate(next, true);
      return;
    }
    isPlaying = false;
    updatePlayState();
    toast('所有可用音源均播放失败，请稍后重试或选择其他版本');
  } finally {
    playbackSession.recovering = false;
  }
}

async function selectTrack(track, autoplay = true) {
  if (track.webdav && !webdavToken) {
    showView('cloud');
    openCloudModal();
    return toast('请先重新连接网盘');
  }
  activeTrack = track;
  renderHomeFeature();
  updateAlbumHero(track);
  if (!playQueue.some(item => String(item.id) === String(track.id))) {
    const source = visibleTracks.length ? visibleTracks : allTracks();
    playQueue = uniqueTracks([track, ...source]);
    unshuffledQueue = [...playQueue];
  }
  currentIndex = Math.max(0, playQueue.findIndex(item => String(item.id) === String(track.id)));
  renderQueue();
  $('#playerTitle').textContent = track.title;
  $('#playerArtist').textContent = track.artist;
  $('#lyricTitle').textContent = track.title;
  $('#lyricArtistLink').textContent = track.artist;
  $('#lyricArtistLink').disabled = !track.remote;
  $('#lyricAlbum').textContent = ` · ${track.album}`;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || '随我听',
      artwork: track.cover
        ? [{src: track.cover}]
        : [{src: new URL('./assets/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png'}]
    });
  }
  syncCurrentFavorite();
  $('#miniCover').className = `mini-cover cover-${track.color}`;
  $('#miniCover').innerHTML = `<span>${String(currentIndex + 1).padStart(2,'0')}</span>`;
  $('#coverLarge').className = `cover-large cover-${track.color}`;
  $('#coverLarge').innerHTML = `<span>ORBIT ${String(currentIndex + 1).padStart(2,'0')}</span>`;
  if (track.cover) {
    $('#miniCover').innerHTML = '';
    $('#coverLarge').innerHTML = '';
    $('#miniCover').style.backgroundImage = `url('${track.cover}')`;
    $('#miniCover').style.backgroundSize = 'cover';
    $('#coverLarge').style.backgroundImage = `url('${track.cover}')`;
    $('#coverLarge').style.backgroundSize = 'cover';
    $('#coverLarge').style.backgroundPosition = 'center';
  } else {
    $('#miniCover').style.backgroundImage = '';
    $('#coverLarge').style.backgroundImage = '';
  }
  renderLyrics(track);
  const serial = ++selectionSerial;
  try {
    if (track.webdav) {
      playbackSession = null;
      audio.src = apiUrl('/api/webdav/stream', {token:webdavToken, path:track.webdavPath}).href;
      audio.volume = Number($('#volume').value) / 100;
      if (autoplay) playAudio();
      const lyricPath = track.webdavPath.replace(/\.[^.]+$/, '.lrc');
      const lyricResponse = await fetch(apiUrl('/api/webdav/text', {token:webdavToken, path:lyricPath})).catch(() => null);
      if (serial !== selectionSerial) return;
      if (lyricResponse?.ok) track.lyrics = parseLrc(await lyricResponse.text());
      if (!track.lyrics?.length) track.lyrics = [[0, '未找到同名 LRC 歌词', '']];
      renderLyrics(track);
    } else if (track.remote) {
      $('#playerArtist').textContent = '正在解析音频与歌词…';
      await refreshRemoteTrack(track);
      if (serial !== selectionSerial) return;
      const candidates = playbackCandidates(track);
      if (!candidates.length) throw new Error('这首歌没有可用的播放音质');
      playbackSession = {trackId:String(track.id), candidates, index:0, alternateLoaded:false, recovering:false};
      usePlaybackCandidate(candidates[0], autoplay);
      const params = {platform: track.platform, songid: track.sourceId, format:candidates[0].format, bitrate:candidates[0].bitrate, time:track.time, sign:track.sign};
      const lyricResult = track.lyrics?.length ? {data:''} : await api('/api/lyric', params).catch(() => ({data:''}));
      if (serial !== selectionSerial) return;
      if (lyricResult.data) track.lyrics = parseLrc(lyricResult.data);
      if (!track.lyrics?.length) track.lyrics = [[0, '暂无时间轴歌词', '']];
      $('#playerArtist').textContent = track.artist;
      renderLyrics(track);
    } else {
      playbackSession = null;
      audio.src = track.localUrl || getSynthUrl(track);
      audio.volume = Number($('#volume').value) / 100;
      if (autoplay) playAudio();
    }
    renderTracks(visibleTracks);
  } catch (error) {
    $('#playerArtist').textContent = track.artist;
    toast(error.message || '播放地址解析失败');
  }
}

function renderLyrics(track) {
  const lines = track.lyrics || [[0,"正在获取同步歌词…",""]];
  $('#lyricsScroll').innerHTML = lines.map(([time, text, translation], i) => `<p class="lyric-line ${i===0?'active':''}" data-time="${time}">${escapeHtml(text)}${translation ? `<span class="translation">${escapeHtml(translation)}</span>` : ''}</p>`).join('');
}

function playAudio() {
  audio.play().then(() => { isPlaying = true; updatePlayState(); }).catch(() => {
    if (audio.error && currentTrack()?.remote) recoverPlayback();
    else toast('播放未能启动，请点击底部播放按钮重试');
  });
}

function togglePlay() {
  if (!audio.src && !currentTrack()) return toast('先搜索并选择一首歌曲');
  if (!audio.src) selectTrack(currentTrack(), true);
  else if (audio.paused) playAudio();
  else { audio.pause(); isPlaying = false; updatePlayState(); }
}

function updatePlayState() {
  document.body.classList.toggle('is-playing', isPlaying);
  $('#mainPlayBtn').innerHTML = icon(isPlaying ? 'pause' : 'play');
  $('#mainPlayBtn').setAttribute('aria-label', isPlaying ? '暂停' : '播放');
  $('#expandedPlay').innerHTML = icon(isPlaying ? 'pause' : 'play');
  $('#expandedPlay').setAttribute('aria-label', isPlaying ? '暂停' : '播放');
  renderTracks(visibleTracks);
}

function updateProgress() {
  const duration = audio.duration || 32;
  $('#currentTime').textContent = formatTime(audio.currentTime);
  $('#duration').textContent = formatTime(duration);
  $('#progress').value = duration ? (audio.currentTime / duration) * 100 : 0;
  $('#expandedProgress').value = $('#progress').value;
  $('#expandedCurrentTime').textContent = $('#currentTime').textContent;
  $('#expandedDuration').textContent = $('#duration').textContent;
  $('#progress').style.setProperty('--progress', `${$('#progress').value}%`);
  $('#expandedProgress').style.setProperty('--progress', `${$('#progress').value}%`);
  const lines = $$('.lyric-line');
  let active = lines[0];
  lines.forEach(line => { if (Number(line.dataset.time) <= audio.currentTime) active = line; });
  if (active && !active.classList.contains('active')) {
    lines.forEach(line => line.classList.remove('active'));
    active.classList.add('active');
    active.scrollIntoView({block: 'center', behavior: 'smooth'});
  }
}

function getSynthUrl(track) {
  if (audioUrls.has(track.id)) return audioUrls.get(track.id);
  const sampleRate = 16000, duration = 32, samples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (o, s) => [...s].forEach((c, i) => view.setUint8(o+i, c.charCodeAt(0)));
  write(0,'RIFF'); view.setUint32(4,36+samples*2,true); write(8,'WAVE'); write(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); write(36,'data'); view.setUint32(40,samples*2,true);
  const root = 110 * Math.pow(2, track.key / 12), progression = [1, 1.5, 1.25, 1.333];
  for (let i=0; i<samples; i++) {
    const t=i/sampleRate, beat=t*track.bpm/60, chord=progression[Math.floor(t/4)%progression.length];
    const pad = Math.sin(2*Math.PI*root*chord*t)*.18 + Math.sin(2*Math.PI*root*chord*1.5*t)*.1;
    const arp = Math.sin(2*Math.PI*root*2*progression[Math.floor(beat*2)%4]*t)*(.08 + .06*Math.sin(Math.PI*(beat%1)));
    const kick = Math.sin(2*Math.PI*(55-25*(beat%1))*t)*Math.exp(-7*(beat%1))*.16;
    const fade = Math.min(1,t/1,(duration-t)/1);
    view.setInt16(44+i*2, Math.max(-1,Math.min(1,(pad+arp+kick)*fade))*32767, true);
  }
  const url = URL.createObjectURL(new Blob([buffer], {type:'audio/wav'}));
  audioUrls.set(track.id, url);
  return url;
}

function toggleFavorite(track) {
  if (!track) return toast('请先选择一首歌曲');
  const id = String(track.id);
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  if (track.remote || track.webdav) {
    const saved = {...track}; delete saved.resolvedUrl; delete saved.lyrics;
    state.remoteLibrary[id] = saved;
  }
  saveState(); renderTracks(visibleTracks);
  syncCurrentFavorite();
  renderHomeFeature();
  toast(state.favorites.has(id) ? '已加入收藏' : '已取消收藏');
}

function syncCurrentFavorite() {
  const selected = !!currentTrack() && state.favorites.has(String(currentTrack().id));
  for (const selector of ['#playerFavorite', '#lyricsFavorite']) {
    const button = $(selector);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', selected ? '取消收藏当前歌曲' : '收藏当前歌曲');
  }
}

async function downloadTrack(track) {
  if (!track) return toast('请先选择一首歌曲');
  if (track.webdav && !webdavToken) return toast('请先重新连接网盘');
  const id = String(track.id);
  if (['preparing', 'downloading'].includes(state.downloadRecords[id]?.status)) return toast('这首歌正在下载');
  try {
    let url, extension = 'wav';
    state.downloadRecords[id] = {status:'preparing', progress:0, startedAt:Date.now(), title:track.title, artist:track.artist};
    if (!state.downloads.includes(id)) state.downloads.unshift(id);
    if (track.remote || track.webdav) state.remoteLibrary[id] = persistedTrack(track);
    saveState(); renderTracks(visibleTracks); toast('正在准备下载…');
    if (track.webdav) {
      extension = track.webdavPath.split('.').pop().toLowerCase() || 'mp3';
      url = apiUrl('/api/webdav/stream', {token:webdavToken, path:track.webdavPath}).href;
    } else if (track.remote) {
      await refreshRemoteTrack(track);
      const info = track.minfo?.find(item => item.format === 'flac') || track.minfo?.find(item => String(item.bitrate) === '320') || track.minfo?.[0];
      if (!info) throw new Error('没有可用的下载音质');
      extension = info.format || 'mp3';
      const filename = `${track.artist} - ${track.title}.${extension}`;
      url = apiUrl('/api/download', {platform:track.platform, songid:track.sourceId, format:info.format, bitrate:info.bitrate, time:track.time, sign:track.sign, filename}).href;
    } else {
      url = track.localUrl || getSynthUrl(track); extension = track.localUrl ? 'mp3' : 'wav';
    }

    const filename = `${track.artist} - ${track.title}.${extension}`;
    state.downloadRecords[id] = {...state.downloadRecords[id], status:'downloading', progress:0, filename};
    saveState(); renderTracks(visibleTracks);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载失败（${response.status}）`);
    const total = Number(response.headers.get('content-length')) || 0;
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      let lastPaint = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        const now = Date.now();
        const progress = total ? Math.min(99, received / total * 100) : Math.min(95, Number(state.downloadRecords[id].progress || 0) + 1);
        state.downloadRecords[id] = {...state.downloadRecords[id], status:'downloading', progress, received, total};
        if (now - lastPaint > 250) {
          lastPaint = now;
          clearTimeout(downloadRenderTimer);
          downloadRenderTimer = setTimeout(() => renderTracks(visibleTracks), 0);
        }
      }
      blob = new Blob(chunks, {type:response.headers.get('content-type') || 'application/octet-stream'});
    } else {
      blob = await response.blob();
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    state.downloadRecords[id] = {...state.downloadRecords[id], status:'completed', progress:100, size:blob.size, completedAt:Date.now(), error:''};
    saveState(); renderTracks(visibleTracks); toast(`下载完成：${track.title}`);
  } catch (error) {
    state.downloadRecords[id] = {...state.downloadRecords[id], status:'failed', progress:0, error:error.message || '下载失败'};
    saveState(); renderTracks(visibleTracks); toast(`${error.message || '下载失败'}，点下载按钮可重试`);
  }
}

function showView(view) {
  searchSerial += 1;
  if (view === 'discover') {
    searchKeyword = '';
    searchTracks = [];
    searchHasMore = false;
    searchFetchedCount = 0;
    artistFilter = '';
    searchLoadingMore = false;
    $('#searchInput').value = '';
    document.body.classList.remove('results-active');
    renderHomeFeature();
  }
  activeView = view;
  document.body.dataset.view = view;
  activePlaylistName = null;
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  $$('.mobile-nav-btn').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  const titles = {discover:'今天听什么', library:'我的曲库', favorites:'我的收藏', cloud:'我的网盘', downloads:'下载记录'};
  const subtitles = {discover:'从喜欢的风格开始。', library:'本地导入和已经下载的音乐。', favorites:'你标记喜欢的歌曲。', cloud:'浏览 AList 或 WebDAV 网盘里的音乐。', downloads:'查看下载进度、失败项目和已完成文件。'};
  $('#sectionTitle').textContent = titles[view];
  $('#sectionSubtitle').textContent = subtitles[view];
  $('#homeDiscovery').hidden = view !== 'discover' || !!searchKeyword && searchTracks.length > 0;
  $('#cloudPanel').hidden = view !== 'cloud';
  $('.view-actions').hidden = view === 'cloud';
  if (view === 'cloud') {
    $('#searchPagination').hidden = true;
    if (!IS_NATIVE_APP) {
      renderCloudDisconnected();
      $('#cloudSetup strong').textContent = '网盘请在 iPhone App 中使用';
      $('#cloudSetup p').textContent = '浏览器版支持搜索、播放、收藏和歌单；网盘连接需要 App 内的本地安全组件。';
      $('#openCloudSettings').hidden = true;
    }
    else if (!webdavToken) renderCloudDisconnected();
    else if (webdavEntries.length) renderCloudDirectory();
    else loadCloudDirectory();
    if (innerWidth <= 980) closeSidebar();
    return;
  }
  $('.table-head').hidden = false;
  const all = allTracks();
  if (view === 'favorites') visibleTracks = all.filter(t => state.favorites.has(String(t.id)));
  else if (view === 'downloads') visibleTracks = all.filter(t => state.downloads.includes(String(t.id)));
  else if (view === 'discover') visibleTracks = searchTracks;
  else visibleTracks = libraryTracks();
  renderTracks(visibleTracks);
  const emptyStates = {
    discover:['从一首歌开始', '搜索想听的歌曲，或从设备导入音频。', '开始搜索'],
    library:['曲库还是空的', '导入本地音乐，或下载歌曲后会显示在这里。', '导入本地音乐'],
    favorites:['还没有收藏', '点按歌曲旁的心形按钮，喜欢的音乐会保存在这里。', '去搜索音乐'],
    downloads:['还没有下载', '下载完成的音乐会保存在这里，方便离线播放。', '去搜索音乐']
  };
  const emptyCopy = emptyStates[view] || emptyStates.discover;
  $('#emptyState h2').textContent = emptyCopy[0];
  $('#emptyState p').textContent = emptyCopy[1];
  $('#emptyActionBtn').textContent = emptyCopy[2];
  $('#searchPagination').hidden = view !== 'discover' || !searchHasMore;
  if (view === 'discover' && !searchKeyword) { $('#homeDiscovery').hidden = false; $('#emptyState').hidden = true; }
  if (innerWidth <= 980) closeSidebar();
}

function setPrimaryUIInert(value) {
  ['.main', '.player', '.mobile-nav'].forEach(selector => {
    const element = $(selector);
    if (element) element.inert = value;
  });
}

function closeSidebar() {
  const wasOpen = $('.sidebar').classList.contains('open');
  $('.sidebar').classList.remove('open');
  document.body.classList.remove('menu-open');
  $('#mobileMenu').setAttribute('aria-expanded', 'false');
  if (innerWidth <= 980) $('.sidebar').inert = true;
  setPrimaryUIInert(false);
  if (wasOpen && innerWidth <= 980) requestAnimationFrame(() => $('#mobileMenu').focus());
}

function toggleSidebar() {
  const opening = !$('.sidebar').classList.contains('open');
  $('.sidebar').classList.toggle('open', opening);
  document.body.classList.toggle('menu-open', opening);
  $('#mobileMenu').setAttribute('aria-expanded', String(opening));
  $('.sidebar').inert = !opening;
  setPrimaryUIInert(opening);
  if (opening) $('.sidebar .nav-item').focus();
}

function syncSidebarA11y() {
  if (innerWidth > 980) $('.sidebar').inert = false;
  else if (!$('.sidebar').classList.contains('open')) $('.sidebar').inert = true;
}

function openLyrics() {
  const panel = $('#lyricsPanel');
  if (panel.classList.contains('open')) return;
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('open');
  document.body.classList.add('lyrics-open');
  if (innerWidth <= 700) { $('#player').inert = true; $('.mobile-nav').inert = true; }
  $('#lyricsBtn').setAttribute('aria-expanded', 'true');
  $('#closeLyrics').focus();
}

function closeLyrics(restoreFocus = true) {
  const panel = $('#lyricsPanel');
  if (!panel.classList.contains('open')) return;
  panel.classList.remove('open');
  document.body.classList.remove('lyrics-open');
  $('#player').inert = false;
  $('.mobile-nav').inert = false;
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  $('#lyricsBtn').setAttribute('aria-expanded', 'false');
  if (restoreFocus) (innerWidth <= 700 ? $('.now-copy') : $('#lyricsBtn')).focus();
}

let lyricsGesture = null;
$('#lyricsPanel').addEventListener('pointerdown', event => {
  lyricsGesture = {x:event.clientX, y:event.clientY, at:Date.now()};
}, {passive:true});
$('#lyricsPanel').addEventListener('pointerup', event => {
  if (!lyricsGesture) return;
  const dx = event.clientX - lyricsGesture.x;
  const dy = event.clientY - lyricsGesture.y;
  const quickEnough = Date.now() - lyricsGesture.at < 900;
  const swipeDown = dy > 72 && Math.abs(dy) > Math.abs(dx) * 1.15;
  const edgeBack = lyricsGesture.x <= 30 && dx > 72 && Math.abs(dx) > Math.abs(dy) * 1.15;
  lyricsGesture = null;
  if (quickEnough && (swipeDown || edgeBack)) closeLyrics();
}, {passive:true});
$('#lyricsPanel').addEventListener('pointercancel', () => { lyricsGesture = null; }, {passive:true});
$('#lyricsPanel').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeLyrics();
});

function handleImport(files) {
  [...files].forEach((file, index) => localTracks.push({ id: `local:${Date.now()+index}`, title: file.name.replace(/\.[^.]+$/, ''), artist: '本地导入', album: '私人曲库', quality: file.name.split('.').pop().toUpperCase(), color: (index+2)%6, localUrl: URL.createObjectURL(file) }));
  visibleTracks = allTracks(); setPlayQueue(visibleTracks); renderTracks(); toast(`已导入 ${files.length} 首本地歌曲`);
}

function normalizeRemote(item, fallbackPlatform, index) {
  const platform = item._platform || fallbackPlatform || 'kuwo';
  const minfo = Array.isArray(item.minfo) ? item.minfo : [];
  const best = minfo.find(x => x.format === 'flac') || minfo.find(x => String(x.bitrate) === '320') || minfo[0];
  return {id:`${platform}:${item.id}`, sourceId:String(item.id), platform, remote:true, title:item.name||'未知歌曲', artist:item.artist||'未知艺人', album:item.album_name||'未知专辑', cover:item.pic_url||'', duration:Number(item.duration)||0, quality:best?.format==='flac'?'FLAC':best?.bitrate?`${best.bitrate}K`:'MP3', minfo, time:item.time, sign:item.sign, color:index%6};
}

function favoriteWithArtwork() {
  return [...state.favorites].map(id => state.remoteLibrary[id] || getTrackById(id)).find(track => track?.cover) || null;
}

function renderHomeFeature() {
  const track = currentTrack() || favoriteWithArtwork() || homeFeatureTrack;
  const label = currentTrack() ? '继续聆听' : track ? '从喜欢开始' : '为你开启';
  $('#homeFeatureLabel').textContent = label;
  $('#homeFeatureTitle').textContent = track?.title || '好音乐，从这里开始。';
  $('#homeFeatureArtist').textContent = track?.artist || '选一首喜欢的歌，马上开听';
  $('#homeFeatureCover').src = track?.cover || './assets/icon-512.png';
  $('#homeFeature').classList.toggle('has-cover', !!track?.cover);
  $('#homeFeature').setAttribute('aria-label', track ? `${label}：${track.title}` : '开始聆听流行音乐');
  const favorite = favoriteWithArtwork();
  const lovedImage = $('.category-loved .category-art');
  if (favorite?.cover) {
    lovedImage.src = favorite.cover;
    lovedImage.parentElement.classList.add('has-art');
  } else {
    lovedImage.removeAttribute('src');
    lovedImage.parentElement.classList.remove('has-art');
  }
}

$('#homeFeatureCover').addEventListener('error', event => {
  if (!event.currentTarget.src.endsWith('/assets/icon-512.png')) event.currentTarget.src = './assets/icon-512.png';
});

async function loadHomeArtwork() {
  if (homeArtworkLoaded) return;
  homeArtworkLoaded = true;
  const categories = [
    {selector:'.category-pop', keyword:'流行歌曲'},
    {selector:'.category-classic', keyword:'经典老歌'},
    {selector:'.category-dj', keyword:'DJ热曲'},
    {selector:'.category-children', keyword:'快乐儿歌'},
    {selector:'.category-red', keyword:'红歌'}
  ];
  await Promise.allSettled(categories.map(async ({selector, keyword}) => {
    const result = await api('/api/search', {keyword, platform:'all', page:1, size:8});
    const item = (result.data?.list || []).find(song => song.pic_url);
    if (!item) return;
    const track = normalizeRemote(item, item._platform, 0);
    const button = $(selector);
    const artwork = button.querySelector('.category-art');
    artwork.src = track.cover;
    artwork.addEventListener('load', () => button.classList.add('has-art'), {once:true});
    artwork.addEventListener('error', () => button.classList.remove('has-art'), {once:true});
    if (selector === '.category-pop' && !homeFeatureTrack) {
      homeFeatureTrack = track;
      renderHomeFeature();
    }
  }));
}

function renderSearchHistory() {
  $('#searchHistory').hidden = !searchHistory.length;
  $('#historyChips').innerHTML = searchHistory.map(item => `<button type="button" data-search-history="${escapeHtml(item)}">${icon('search')}<span>${escapeHtml(item)}</span></button>`).join('');
}

function matchesArtist(track, name) {
  const target = String(name).replace(/\s+/g, '').toLowerCase();
  return String(track.artist || '').replace(/\s+/g, '').toLowerCase().includes(target);
}

function searchArtist(name) {
  const artist = String(name || '').trim();
  if (!artist || artist === '未知艺人' || artist === '本地导入' || artist === '网盘音乐') return toast('这首歌没有可搜索的歌手信息');
  if ($('#lyricsPanel').classList.contains('open')) closeLyrics(false);
  $('#searchInput').value = artist;
  $('.content').scrollTop = 0;
  runSearch({artist});
}

async function runSearch(options = {}) {
  const keyword = $('#searchInput').value.trim();
  if (!keyword) return showView('discover');
  const serial = ++searchSerial;
  activeView = 'discover';
  document.body.dataset.view = 'discover';
  $$('.mobile-nav-btn,.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'discover'));
  const platform = $('#sourceSelect').value;
  searchPage = 1;
  searchTotal = 0;
  searchFetchedCount = 0;
  artistFilter = typeof options.artist === 'string' ? options.artist.trim() : '';
  $('#emptyState h2').textContent = artistFilter ? '暂未找到这位歌手的歌曲' : '没有找到相关歌曲';
  $('#emptyState p').textContent = artistFilter ? '可以加载更多结果，或换个歌手名字试试。' : '换个关键词再试试。';
  $('#emptyActionBtn').textContent = '返回首页';
  searchKeyword = keyword;
  searchHistory = [keyword, ...searchHistory.filter(item => item !== keyword)].slice(0, 12);
  localStorage.setItem('orbit-search-history', JSON.stringify(searchHistory));
  renderSearchHistory();
  $('#homeDiscovery').hidden = true;
  searchPlatform = platform;
  searchLoadingMore = false;
  searchHasMore = false;
  $('#searchPagination').hidden = true;
  document.body.classList.add('results-active');
  $('#sectionTitle').textContent = artistFilter ? `歌手 · ${artistFilter}` : `搜索「${keyword}」`;
  $('#sectionSubtitle').textContent = artistFilter ? '这位歌手的歌曲，继续下滑可加载更多。' : innerWidth < 740 ? '点按播放按钮开始播放。' : '选择播放按钮，或双击歌曲所在行开始播放。';
  $('#trackTable').innerHTML = '<div class="search-loading"><i></i><span>正在连接音乐源…</span></div>';
  $('#emptyState').hidden = true;
  try {
    const result = await api('/api/search', {keyword, platform, page:1, size:20});
    if (serial !== searchSerial) return;
    const rawTracks = result.data?.list || [];
    searchFetchedCount = rawTracks.length;
    searchTracks = rawTracks.map((item, index) => normalizeRemote(item, platform === 'all' ? item._platform : platform, index)).filter(track => !artistFilter || matchesArtist(track, artistFilter));
    searchTotal = Number(result.data?.total) || rawTracks.length;
    searchHasMore = rawTracks.length > 0 && searchFetchedCount < searchTotal;
    visibleTracks = searchTracks;
    if (!activeTrack) setPlayQueue(searchTracks, false);
    renderTracks();
    updateSearchPagination();
    toast(artistFilter ? `找到 ${searchTracks.length} 首歌手作品` : `找到 ${searchTotal} 条结果`);
  } catch (error) {
    if (serial !== searchSerial) return;
    visibleTracks = []; renderTracks(); $('#emptyState p').textContent = error.message || '搜索服务暂时不可用'; toast(error.message || '搜索失败');
  }
}

async function loadMoreSearch() {
  if (searchLoadingMore || !searchHasMore || !searchKeyword) return;
  searchLoadingMore = true;
  updateSearchPagination();
  const serial = searchSerial;
  try {
    const nextPage = searchPage + 1;
    const result = await api('/api/search', {keyword:searchKeyword, platform:searchPlatform, page:nextPage, size:20});
    if (serial !== searchSerial) return;
    const rawTracks = result.data?.list || [];
    searchFetchedCount += rawTracks.length;
    const incoming = rawTracks.map((item, index) => normalizeRemote(item, searchPlatform === 'all' ? item._platform : searchPlatform, searchTracks.length + index)).filter(track => !artistFilter || matchesArtist(track, artistFilter));
    const merged = new Map(searchTracks.map(track => [String(track.id), track]));
    incoming.forEach(track => merged.set(String(track.id), track));
    searchTracks = [...merged.values()];
    searchPage = nextPage;
    searchTotal = Number(result.data?.total) || searchTotal || searchTracks.length;
    searchHasMore = rawTracks.length > 0 && searchFetchedCount < searchTotal;
    visibleTracks = searchTracks;
    if (!activeTrack) setPlayQueue(searchTracks);
    renderTracks();
    toast(searchHasMore ? `已加载 ${searchTracks.length} 首` : `已显示全部 ${searchTracks.length} 首`);
  } catch (error) {
    toast(error.message || '更多歌曲加载失败');
  } finally {
    searchLoadingMore = false;
    updateSearchPagination();
  }
}

$('#trackTable').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  const track = getTrackById(btn.closest('.track-row').dataset.id); if (!track) return;
  if (btn.dataset.action === 'play') selectTrack(track);
  if (btn.dataset.action === 'artist') searchArtist(track.artist);
  if (btn.dataset.action === 'favorite') toggleFavorite(track);
  if (btn.dataset.action === 'queue') addToQueue(track);
  if (btn.dataset.action === 'download') downloadTrack(track);
  if (btn.dataset.action === 'delete') {
    const id = String(track.id);
    if (activePlaylistName) {
      state.playlistTracks[activePlaylistName] = (state.playlistTracks[activePlaylistName] || []).filter(item => item !== id);
      visibleTracks = visibleTracks.filter(item => String(item.id) !== id);
      setPlayQueue(visibleTracks);
      saveState(); renderPlaylists(); renderTracks(); toast(`已从歌单「${activePlaylistName}」移除`); return;
    }
    if (!track.remote && !track.localUrl) return toast('这首歌曲不能删除');
    localTracks = localTracks.filter(t => String(t.id) !== id); visibleTracks = visibleTracks.filter(t => String(t.id) !== id);
    delete state.remoteLibrary[id]; delete state.downloadRecords[id]; state.favorites.delete(id); state.downloads = state.downloads.filter(item => item !== id);
    saveState(); renderTracks(); toast(`已从曲库移除「${track.title}」`);
  }
});

$('#trackTable').addEventListener('dblclick', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action && action !== 'play') return;
  const row = e.target.closest('.track-row');
  if (!row) return;
  e.preventDefault();
  const track = getTrackById(row.dataset.id);
  if (track) selectTrack(track);
});

let touchStart = null;
let lastTouchTap = {id:'', at:0};

$('#trackTable').addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || e.target.closest('[data-action]')) return;
  const row = e.target.closest('.track-row');
  touchStart = row ? {id:row.dataset.id, x:e.clientX, y:e.clientY} : null;
}, {passive:true});

$('#trackTable').addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse' || e.target.closest('[data-action]') || !touchStart) return;
  const row = e.target.closest('.track-row');
  const moved = Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y);
  const id = row?.dataset.id;
  touchStart = null;
  if (!id || moved > 12) { lastTouchTap = {id:'', at:0}; return; }
  const now = Date.now();
  if (lastTouchTap.id === id && now - lastTouchTap.at <= 420) {
    e.preventDefault();
    lastTouchTap = {id:'', at:0};
    const track = getTrackById(id);
    if (track) selectTrack(track);
    return;
  }
  lastTouchTap = {id, at:now};
}, {passive:false});

$('#trackTable').addEventListener('pointercancel', () => {
  touchStart = null;
  lastTouchTap = {id:'', at:0};
}, {passive:true});

$('#searchBtn').onclick = runSearch;
$('#homeFeature').onclick = () => {
  const track = currentTrack() || favoriteWithArtwork() || homeFeatureTrack;
  if (!track) { $('#searchInput').value = '流行音乐'; runSearch(); return; }
  if (currentTrack() && String(track.id) === String(currentTrack().id)) openLyrics();
  else selectTrack(track);
};
$$('.category-card').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.category === 'favorites') return showView('favorites');
  $('#searchInput').value = button.dataset.category;
  runSearch();
}));
$('#historyChips').addEventListener('click', event => {
  const button = event.target.closest('[data-search-history]');
  if (!button) return;
  $('#searchInput').value = button.dataset.searchHistory;
  runSearch();
});
$('#clearSearchHistory').onclick = () => {
  searchHistory = [];
  localStorage.removeItem('orbit-search-history');
  renderSearchHistory();
};
$('#emptyActionBtn').onclick = () => {
  if (activeView === 'library') return $('#fileInput').click();
  showView('discover');
  requestAnimationFrame(() => $('#searchInput').focus());
};
$('#loadMoreBtn').onclick = loadMoreSearch;
$('.content').addEventListener('scroll', e => {
  const el = e.currentTarget;
  if (!$('#searchPagination').hidden && el.scrollHeight - el.scrollTop - el.clientHeight < 260) loadMoreSearch();
}, {passive:true});
$('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); } });
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
$$('.mobile-nav-btn').forEach(btn => btn.addEventListener('click', () => {
  if ($('#lyricsPanel').classList.contains('open')) closeLyrics(false);
  showView(btn.dataset.view);
}));
$('#openCloudSettings').onclick = openCloudModal;
$('#cloudSettingsBtn').onclick = openCloudModal;
$('#closeCloudModal').onclick = () => { $('#cloudModal').hidden = true; };
$('#cloudForm').addEventListener('submit', connectCloud);
$('#disconnectCloudBtn').onclick = disconnectCloud;
$('#cloudRefreshBtn').onclick = () => loadCloudDirectory(webdavCurrentPath);
$('#cloudBackBtn').onclick = () => loadCloudDirectory(parentCloudPath(webdavCurrentPath));
$('#cloudDirectories').addEventListener('click', event => {
  const folder = event.target.closest('[data-cloud-path]');
  if (folder) loadCloudDirectory(folder.dataset.cloudPath);
});
$('#mobileMenu').onclick = toggleSidebar;
$('#sidebarScrim').onclick = closeSidebar;
$('#uploadBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => handleImport(e.target.files);
$('#manageBtn').onclick = () => { isManageMode = !isManageMode; $('#manageBtn').textContent = isManageMode ? '完成管理' : '管理曲库'; renderTracks(); };
$('#mainPlayBtn').onclick = togglePlay;
$('#prevBtn').onclick = () => {
  if (!playQueue.length) return toast('播放队列还是空的');
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  selectTrack(playQueue[(currentIndex - 1 + playQueue.length) % playQueue.length]);
};
$('#nextBtn').onclick = () => playQueue.length ? selectTrack(playQueue[(currentIndex + 1) % playQueue.length]) : toast('播放队列还是空的');
$('#playerFavorite').onclick = () => toggleFavorite(currentTrack());
$('#lyricsFavorite').onclick = () => toggleFavorite(currentTrack());
$('#lyricArtistLink').onclick = () => searchArtist(currentTrack()?.artist);
$('#downloadCurrent').onclick = () => downloadTrack(currentTrack());
$('#lyricsBtn').onclick = () => $('#lyricsPanel').classList.contains('open') ? closeLyrics() : openLyrics();
$('.now-copy').onclick = () => currentTrack() ? openLyrics() : toast('先播放一首歌');
$('.now-copy').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    currentTrack() ? openLyrics() : toast('先播放一首歌');
  }
});
$('#closeLyrics').onclick = closeLyrics;
$('#lyricModeBtn').onclick = () => { lyricTranslation = !lyricTranslation; $('#lyricsPanel').classList.toggle('hide-translation', !lyricTranslation); $('#lyricModeBtn').textContent = `译文 · ${lyricTranslation?'开':'关'}`; };
$('#expandedPrev').onclick = () => $('#prevBtn').click();
$('#expandedNext').onclick = () => $('#nextBtn').click();
$('#expandedPlay').onclick = () => $('#mainPlayBtn').click();
$('#expandedRepeat').onclick = () => $('#repeatBtn').click();
$('#expandedProgress').oninput = event => {
  if (audio.duration) audio.currentTime = audio.duration * Number(event.target.value) / 100;
  updateProgress();
};
function applyLyricColor() {
  const choice = lyricColors[lyricColorIndex];
  document.documentElement.style.setProperty('--lyric-active', choice.value);
  $('#lyricColorHint').textContent = `歌词颜色：${choice.name}`;
  $('#lyricColorBtn').style.color = choice.value;
}
$('#lyricColorBtn').onclick = () => {
  lyricColorIndex = (lyricColorIndex + 1) % lyricColors.length;
  localStorage.setItem('orbit-lyric-color', lyricColors[lyricColorIndex].name);
  applyLyricColor();
};
$('#volume').oninput = e => audio.volume = Number(e.target.value)/100;
$('#progress').oninput = e => { if (audio.duration) audio.currentTime = audio.duration * Number(e.target.value)/100; };
$('#repeatBtn').onclick = e => { audio.loop = !audio.loop; e.currentTarget.classList.toggle('active', audio.loop); $('#expandedRepeat').classList.toggle('active', audio.loop); $('#expandedRepeat').setAttribute('aria-pressed', String(audio.loop)); toast(audio.loop?'单曲循环已开启':'单曲循环已关闭'); };
$('#shuffleBtn').onclick = e => {
  shuffleEnabled = !shuffleEnabled;
  e.currentTarget.classList.toggle('active', shuffleEnabled);
  e.currentTarget.setAttribute('aria-pressed', String(shuffleEnabled));
  if (shuffleEnabled) {
    unshuffledQueue = [...playQueue];
    playQueue = shuffleTracks(playQueue);
  } else {
    const current = currentTrack();
    playQueue = uniqueTracks(unshuffledQueue);
    if (current && !playQueue.some(track => String(track.id) === String(current.id))) playQueue.unshift(current);
  }
  currentIndex = Math.max(0, playQueue.findIndex(track => String(track.id) === String(currentTrack()?.id)));
  renderQueue();
  toast(shuffleEnabled ? '随机播放已开启，队列顺序已打乱' : '随机播放已关闭，已恢复原顺序');
};
$('#queueBtn').onclick = () => $('#queuePanel').classList.contains('open') ? closeQueue() : openQueue();
$('#closeQueueBtn').onclick = closeQueue;
$('#queueGrabber').onclick = closeQueue;
$('#queueScrim').onclick = closeQueue;
$('#clearQueueBtn').onclick = () => { playQueue = []; unshuffledQueue = []; currentIndex = 0; renderQueue(); toast('播放队列已清空'); };
$('#queueList').addEventListener('click', event => {
  const button = event.target.closest('[data-queue-action]');
  const row = event.target.closest('[data-queue-index]');
  if (!button || !row) return;
  const index = Number(row.dataset.queueIndex);
  const action = button.dataset.queueAction;
  if (action === 'play') { selectTrack(playQueue[index]); closeQueue(); return; }
  if (action === 'remove') {
    const [removed] = playQueue.splice(index, 1);
    unshuffledQueue = unshuffledQueue.filter(track => String(track.id) !== String(removed?.id));
  }
  if (action === 'up' && index > 0) [playQueue[index - 1], playQueue[index]] = [playQueue[index], playQueue[index - 1]];
  if (action === 'down' && index < playQueue.length - 1) [playQueue[index + 1], playQueue[index]] = [playQueue[index], playQueue[index + 1]];
  currentIndex = Math.max(0, playQueue.findIndex(track => String(track.id) === String(currentTrack()?.id)));
  if (!shuffleEnabled) unshuffledQueue = [...playQueue];
  renderQueue();
});
$('#sortBtn').onclick = () => { visibleTracks.reverse(); setPlayQueue(visibleTracks); renderTracks(); toast('歌曲顺序已切换'); };
$('#createPlaylistBtn').onclick = () => { $('#playlistModal').hidden = false; setTimeout(() => $('#playlistName').focus(), 50); };
$('[data-close-modal]').onclick = () => { $('#playlistModal').hidden = true; $('#createPlaylistBtn').focus(); };
$('#savePlaylistBtn').onclick = () => { const name=$('#playlistName').value.trim(); if(!name) return toast('请先输入歌单名称'); if(state.playlists.includes(name)) return toast('已经有同名歌单'); state.playlists.push(name); state.playlistTracks[name] ||= []; saveState(); renderPlaylists(); $('#playlistModal').hidden=true; $('#playlistName').value=''; $('#createPlaylistBtn').focus(); toast(`歌单「${name}」已创建`); };
$('#playlistModal').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const focusable = $$(`#playlistModal button, #playlistModal input`).filter(el => !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$('#playlistNav').addEventListener('click', e => {
  const add = e.target.closest('[data-add-playlist]');
  if (add) {
    const track = currentTrack();
    if (!track) return toast('请先播放或选择一首歌曲');
    const name = add.dataset.addPlaylist;
    const ids = state.playlistTracks[name] ||= [];
    const id = String(track.id);
    if (!ids.includes(id)) ids.push(id);
    if (track.remote) { const saved = {...track}; delete saved.resolvedUrl; delete saved.lyrics; state.remoteLibrary[id] = saved; }
    saveState(); renderPlaylists(); toast(`已加入歌单「${name}」`); return;
  }
  const open = e.target.closest('[data-playlist-name]');
  if (open) {
    const name = open.dataset.playlistName;
    activePlaylistName = name;
    visibleTracks = (state.playlistTracks[name] || []).map(getTrackById).filter(Boolean);
    setPlayQueue(visibleTracks);
    $('#sectionTitle').textContent = name;
    $('#sectionSubtitle').textContent = visibleTracks.length ? `${visibleTracks.length} 首歌曲` : '播放一首歌后，点击歌单旁的 + 即可加入。';
    $$('.nav-item').forEach(x => x.classList.remove('active'));
    $('#searchPagination').hidden = true;
    renderTracks(visibleTracks); closeSidebar();
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('#cloudModal').hidden === false) { $('#cloudModal').hidden = true; return; }
  if ($('#playlistModal').hidden === false) { $('#playlistModal').hidden = true; $('#createPlaylistBtn').focus(); return; }
  if ($('#queuePanel').classList.contains('open')) { closeQueue(); return; }
  if ($('#lyricsPanel').classList.contains('open')) { closeLyrics(); return; }
  closeSidebar();
});
window.addEventListener('resize', syncSidebarA11y);
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('play', () => { isPlaying=true; updatePlayState(); });
audio.addEventListener('pause', () => { isPlaying=false; updatePlayState(); });
audio.addEventListener('ended', () => $('#nextBtn').click());
audio.addEventListener('error', () => {
  if (currentTrack()?.remote && playbackSession) recoverPlayback();
  else {
    isPlaying = false;
    updatePlayState();
    toast('这个音频资源暂时不可用');
  }
});

function updateAlbumHero(track) {
  const palettes = [
    ['#f66543', '#a93045'],
    ['#7f70ff', '#284e9e'],
    ['#25b9a5', '#18566c'],
    ['#f09b43', '#8e432d'],
    ['#df5fa8', '#653477'],
    ['#6fa8ff', '#2c3e80']
  ];
  const palette = palettes[Math.abs(Number(track?.color) || 0) % palettes.length];
  document.documentElement.style.setProperty('--now-a', palette[0]);
  document.documentElement.style.setProperty('--now-b', palette[1]);
  return track;
}

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', playAudio);
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => $('#prevBtn').click());
  navigator.mediaSession.setActionHandler('nexttrack', () => $('#nextBtn').click());
  navigator.mediaSession.setActionHandler('seekto', details => {
    if (audio.duration && Number.isFinite(details.seekTime)) {
      audio.currentTime = Math.min(audio.duration, Math.max(0, details.seekTime));
    }
  });
}

if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

$('#cloudStatus').textContent = webdavToken ? '已连' : '未连';
document.body.dataset.view = activeView;
renderPlaylists(); renderTracks(); renderQueue(); renderSearchHistory(); applyLyricColor(); syncSidebarA11y(); showView('discover'); loadHomeArtwork();
