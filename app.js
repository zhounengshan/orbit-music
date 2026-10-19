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
let searchSerial = 0;
const audio = document.querySelector('#audio');
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  favorites: new Set(JSON.parse(localStorage.getItem('orbit-favorites') || '[]').map(String)),
  downloads: JSON.parse(localStorage.getItem('orbit-downloads') || '[]').map(String),
  playlists: JSON.parse(localStorage.getItem('orbit-playlists') || '[]'),
  remoteLibrary: JSON.parse(localStorage.getItem('orbit-remote-library') || '{}')
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const allTracks = () => {
  const byId = new Map();
  [...tracks, ...Object.values(state.remoteLibrary), ...searchTracks, ...localTracks].forEach(track => byId.set(String(track.id), track));
  return [...byId.values()];
};

function saveState() {
  localStorage.setItem('orbit-favorites', JSON.stringify([...state.favorites]));
  localStorage.setItem('orbit-downloads', JSON.stringify(state.downloads));
  localStorage.setItem('orbit-playlists', JSON.stringify(state.playlists));
  localStorage.setItem('orbit-remote-library', JSON.stringify(state.remoteLibrary));
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
    ? state.playlists.map(name => `<button class="playlist-link" data-playlist-name="${name.replaceAll('"','&quot;')}">${escapeHtml(name)}</button>`).join('')
    : '<p class="playlist-empty">还没有歌单</p>';
}

function getTrackById(id) { return allTracks().find(t => String(t.id) === String(id)); }

function renderTracks(list = visibleTracks) {
  const table = $('#trackTable');
  table.classList.toggle('manage-mode', isManageMode);
  table.innerHTML = list.map((track, index) => `
    <article class="track-row" data-id="${escapeHtml(track.id)}">
      <button class="track-index icon-btn row-play" data-action="play" aria-label="播放 ${escapeHtml(track.title)}">${String(currentTrack()?.id) === String(track.id) && isPlaying ? icon('pause') : String(index + 1).padStart(2,'0')}</button>
      <div class="track-meta"><div class="track-cover ${track.cover ? 'has-image' : `cover-${track.color ?? index % 6}`}" ${track.cover ? `style="background-image:url('${escapeHtml(track.cover)}')"` : ''}>${track.cover ? '' : `<span>${String(index + 1).padStart(2,'0')}</span>`}</div><div class="track-name"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div></div>
      <span class="album-name">${escapeHtml(track.album || '未知专辑')}</span>
      <span class="quality">${escapeHtml(track.quality || 'MP3')}</span>
      <span class="track-time">${formatTime(track.duration || 32)}</span>
      <div class="track-actions">
        <button class="play-track-btn" data-action="play" aria-label="播放 ${escapeHtml(track.title)}">${icon('play')}<b>播放</b></button>
        <button class="icon-btn ${state.favorites.has(String(track.id))?'active':''}" data-action="favorite" aria-label="收藏 ${escapeHtml(track.title)}">${icon('heart')}</button>
        <button class="icon-btn download-btn" data-action="download" aria-label="下载 ${track.title}">${icon('download')}</button>
        <button class="icon-btn delete-btn" data-action="delete" aria-label="删除 ${track.title}">${icon('close')}</button>
      </div>
    </article>`).join('');
  $('#emptyState').hidden = list.length > 0;
  $('#libraryCount').textContent = allTracks().length;
  $('#favoriteCount').textContent = state.favorites.size;
  $('#downloadCount').textContent = state.downloads.length;
}

function currentTrack() { return activeTrack; }

const API_ORIGIN = 'https://orbit-music-private.zhou1992.chatgpt.site';

function apiUrl(path, params = {}) {
  const url = new URL(path, API_ORIGIN);
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

async function selectTrack(track, autoplay = true) {
  activeTrack = track;
  updateAlbumHero(track);
  if (!playQueue.some(item => String(item.id) === String(track.id))) playQueue = visibleTracks.length ? visibleTracks : allTracks();
  currentIndex = Math.max(0, playQueue.findIndex(item => String(item.id) === String(track.id)));
  $('#playerTitle').textContent = track.title;
  $('#playerArtist').textContent = track.artist;
  $('#lyricTitle').textContent = track.title;
  $('#lyricArtist').textContent = `${track.artist} · ${track.album}`;
  $('#playerFavorite').innerHTML = icon('heart');
  $('#playerFavorite').classList.toggle('active', state.favorites.has(String(track.id)));
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
  const serial = ++searchSerial;
  try {
    if (track.remote) {
      $('#playerArtist').textContent = '正在解析音频与歌词…';
      await refreshRemoteTrack(track);
      if (serial !== searchSerial) return;
      const playInfo = track.minfo?.find(item => item.format === 'mp3' && String(item.bitrate) === '320') || track.minfo?.find(item => item.format === 'mp3') || track.minfo?.[0];
      if (!playInfo) throw new Error('这首歌没有可用的播放音质');
      const params = {platform: track.platform, songid: track.sourceId, format: playInfo.format, bitrate: playInfo.bitrate, time: track.time, sign: track.sign};
      track.resolvedUrl ||= apiUrl('/api/stream', params).href;
      audio.src = track.resolvedUrl;
      audio.volume = Number($('#volume').value) / 100;
      if (autoplay) playAudio();
      const lyricResult = track.lyrics?.length ? {data:''} : await api('/api/lyric', params).catch(() => ({data:''}));
      if (serial !== searchSerial) return;
      if (lyricResult.data) track.lyrics = parseLrc(lyricResult.data);
      if (!track.lyrics?.length) track.lyrics = [[0, '暂无时间轴歌词', '']];
      $('#playerArtist').textContent = track.artist;
      renderLyrics(track);
    } else {
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
  audio.play().then(() => { isPlaying = true; updatePlayState(); }).catch(() => toast('播放未能启动，请点击底部播放按钮重试'));
}

function togglePlay() {
  if (!audio.src && !currentTrack()) return toast('先搜索并选择一首歌曲');
  if (!audio.src) selectTrack(currentTrack(), true);
  else if (audio.paused) playAudio();
  else { audio.pause(); isPlaying = false; updatePlayState(); }
}

function updatePlayState() {
  $('#mainPlayBtn').innerHTML = icon(isPlaying ? 'pause' : 'play');
  $('#mainPlayBtn').setAttribute('aria-label', isPlaying ? '暂停' : '播放');
  renderTracks(visibleTracks);
}

function updateProgress() {
  const duration = audio.duration || 32;
  $('#currentTime').textContent = formatTime(audio.currentTime);
  $('#duration').textContent = formatTime(duration);
  $('#progress').value = duration ? (audio.currentTime / duration) * 100 : 0;
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
  if (track.remote) {
    const saved = {...track}; delete saved.resolvedUrl; delete saved.lyrics;
    state.remoteLibrary[id] = saved;
  }
  saveState(); renderTracks(visibleTracks);
  $('#playerFavorite').innerHTML = icon('heart');
  toast(state.favorites.has(id) ? `已收藏「${track.title}」` : `已取消收藏「${track.title}」`);
}

async function downloadTrack(track) {
  if (!track) return toast('请先选择一首歌曲');
  try {
    let url, extension = 'wav';
    if (track.remote) {
      toast('正在获取下载地址…');
      const info = track.minfo?.find(item => item.format === 'flac') || track.minfo?.find(item => String(item.bitrate) === '320') || track.minfo?.[0];
      if (!info) throw new Error('没有可用的下载音质');
      const result = await api('/api/url', {platform:track.platform, songid:track.sourceId, format:info.format, bitrate:info.bitrate, time:track.time, sign:track.sign});
      url = result.data?.url; extension = info.format || 'mp3';
      const saved = {...track}; delete saved.resolvedUrl; delete saved.lyrics; state.remoteLibrary[String(track.id)] = saved;
    } else {
      url = track.localUrl || getSynthUrl(track); extension = track.localUrl ? 'mp3' : 'wav';
    }
    const a = document.createElement('a');
    a.href = url; a.download = `${track.artist} - ${track.title}.${extension}`; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    if (!state.downloads.includes(String(track.id))) state.downloads.unshift(String(track.id));
    saveState(); renderTracks(visibleTracks); toast(`已打开下载：${track.title}`);
  } catch (error) { toast(error.message || '下载地址获取失败'); }
}

function showView(view) {
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === view));
  const titles = {discover:'搜索音乐', library:'我的曲库', favorites:'我的收藏', downloads:'下载记录'};
  const subtitles = {discover:'输入歌曲、艺人或专辑名称，结果会显示在这里。', library:'收藏和导入的音乐都会保存在这里。', favorites:'你标记喜欢的歌曲。', downloads:'曾经下载过的歌曲。'};
  $('#sectionTitle').textContent = titles[view];
  $('#sectionSubtitle').textContent = subtitles[view];
  const all = allTracks();
  if (view === 'favorites') visibleTracks = all.filter(t => state.favorites.has(String(t.id)));
  else if (view === 'downloads') visibleTracks = all.filter(t => state.downloads.includes(String(t.id)));
  else if (view === 'discover') visibleTracks = searchTracks;
  else visibleTracks = all;
  playQueue = visibleTracks;
  renderTracks(visibleTracks);
  if (innerWidth < 740) closeSidebar();
}

function closeSidebar() {
  $('.sidebar').classList.remove('open');
  document.body.classList.remove('menu-open');
}

function toggleSidebar() {
  const opening = !$('.sidebar').classList.contains('open');
  $('.sidebar').classList.toggle('open', opening);
  document.body.classList.toggle('menu-open', opening);
}

function handleImport(files) {
  [...files].forEach((file, index) => localTracks.push({ id: `local:${Date.now()+index}`, title: file.name.replace(/\.[^.]+$/, ''), artist: '本地导入', album: '私人曲库', quality: file.name.split('.').pop().toUpperCase(), color: (index+2)%6, localUrl: URL.createObjectURL(file) }));
  visibleTracks = allTracks(); playQueue = visibleTracks; renderTracks(); toast(`已导入 ${files.length} 首本地歌曲`);
}

function normalizeRemote(item, fallbackPlatform, index) {
  const platform = item._platform || fallbackPlatform || 'kuwo';
  const minfo = Array.isArray(item.minfo) ? item.minfo : [];
  const best = minfo.find(x => x.format === 'flac') || minfo.find(x => String(x.bitrate) === '320') || minfo[0];
  return {id:`${platform}:${item.id}`, sourceId:String(item.id), platform, remote:true, title:item.name||'未知歌曲', artist:item.artist||'未知艺人', album:item.album_name||'未知专辑', cover:item.pic_url||'', duration:Number(item.duration)||0, quality:best?.format==='flac'?'FLAC':best?.bitrate?`${best.bitrate}K`:'MP3', minfo, time:item.time, sign:item.sign, color:index%6};
}

async function runSearch() {
  const keyword = $('#searchInput').value.trim();
  if (!keyword) return showView('discover');
  const serial = ++searchSerial;
  const platform = $('#sourceSelect').value;
  document.body.classList.add('results-active');
  $('#sectionTitle').textContent = `搜索「${keyword}」`;
  $('#sectionSubtitle').textContent = innerWidth < 740 ? '点按播放按钮开始播放。' : '选择播放按钮，或双击歌曲所在行开始播放。';
  $('#trackTable').innerHTML = '<div class="search-loading"><i></i><span>正在连接音乐源…</span></div>';
  $('#emptyState').hidden = true;
  try {
    const result = await api('/api/search', {keyword, platform, page:1, size:20});
    if (serial !== searchSerial) return;
    searchTracks = (result.data?.list || []).map((item, index) => normalizeRemote(item, platform === 'all' ? item._platform : platform, index));
    visibleTracks = searchTracks; playQueue = searchTracks; renderTracks();
    toast(`找到 ${result.data?.total ?? searchTracks.length} 条结果`);
  } catch (error) {
    if (serial !== searchSerial) return;
    visibleTracks = []; renderTracks(); $('#emptyState p').textContent = error.message || '搜索服务暂时不可用'; toast(error.message || '搜索失败');
  }
}

$('#trackTable').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  const track = getTrackById(btn.closest('.track-row').dataset.id); if (!track) return;
  if (btn.dataset.action === 'play') selectTrack(track);
  if (btn.dataset.action === 'favorite') toggleFavorite(track);
  if (btn.dataset.action === 'download') downloadTrack(track);
  if (btn.dataset.action === 'delete') {
    const id = String(track.id);
    if (!track.remote && !track.localUrl) return toast('这首歌曲不能删除');
    localTracks = localTracks.filter(t => String(t.id) !== id); visibleTracks = visibleTracks.filter(t => String(t.id) !== id);
    delete state.remoteLibrary[id]; state.favorites.delete(id); state.downloads = state.downloads.filter(item => item !== id);
    saveState(); renderTracks(); toast(`已从曲库移除「${track.title}」`);
  }
});

$('#trackTable').addEventListener('dblclick', e => {
  if (e.target.closest('button')) return;
  const row = e.target.closest('.track-row');
  if (!row) return;
  const track = getTrackById(row.dataset.id);
  if (track) selectTrack(track);
});

$('#searchBtn').onclick = runSearch;
$('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); } });
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
$('#mobileMenu').onclick = toggleSidebar;
$('#sidebarScrim').onclick = closeSidebar;
$('#uploadBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => handleImport(e.target.files);
$('#manageBtn').onclick = () => { isManageMode = !isManageMode; $('#manageBtn').textContent = isManageMode ? '完成管理' : '管理曲库'; renderTracks(); };
$('#mainPlayBtn').onclick = togglePlay;
$('#prevBtn').onclick = () => playQueue.length ? selectTrack(playQueue[(currentIndex - 1 + playQueue.length) % playQueue.length]) : toast('播放队列还是空的');
$('#nextBtn').onclick = () => playQueue.length ? selectTrack(playQueue[(currentIndex + 1) % playQueue.length]) : toast('播放队列还是空的');
$('#playerFavorite').onclick = () => toggleFavorite(currentTrack());
$('#downloadCurrent').onclick = () => downloadTrack(currentTrack());
$('#lyricsBtn').onclick = () => $('#lyricsPanel').classList.add('open');
$('#closeLyrics').onclick = () => $('#lyricsPanel').classList.remove('open');
$('#lyricModeBtn').onclick = () => { lyricTranslation = !lyricTranslation; $('#lyricsPanel').classList.toggle('hide-translation', !lyricTranslation); $('#lyricModeBtn').textContent = `译文 · ${lyricTranslation?'开':'关'}`; };
$('#volume').oninput = e => audio.volume = Number(e.target.value)/100;
$('#progress').oninput = e => { if (audio.duration) audio.currentTime = audio.duration * Number(e.target.value)/100; };
$('#repeatBtn').onclick = e => { audio.loop = !audio.loop; e.currentTarget.classList.toggle('active', audio.loop); toast(audio.loop?'单曲循环已开启':'单曲循环已关闭'); };
$('#shuffleBtn').onclick = e => { e.currentTarget.classList.toggle('active'); toast(e.currentTarget.classList.contains('active')?'随机播放已开启':'随机播放已关闭'); };
$('#queueBtn').onclick = () => toast(`播放队列 · ${playQueue.length} 首`);
$('#sortBtn').onclick = () => { visibleTracks.reverse(); playQueue = visibleTracks; renderTracks(); toast('歌曲顺序已切换'); };
$('#createPlaylistBtn').onclick = () => { $('#playlistModal').hidden = false; setTimeout(() => $('#playlistName').focus(), 50); };
$('[data-close-modal]').onclick = () => $('#playlistModal').hidden = true;
$('#savePlaylistBtn').onclick = () => { const name=$('#playlistName').value.trim(); if(!name) return toast('请先输入歌单名称'); state.playlists.push(name); saveState(); renderPlaylists(); $('#playlistModal').hidden=true; $('#playlistName').value=''; toast(`歌单「${name}」已创建`); };
$('#playlistNav').addEventListener('click', e => { const b=e.target.closest('[data-playlist-name]'); if(b) { toast(`已打开歌单「${b.dataset.playlistName}」`); closeSidebar(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('play', () => { isPlaying=true; updatePlayState(); });
audio.addEventListener('pause', () => { isPlaying=false; updatePlayState(); });
audio.addEventListener('ended', () => $('#nextBtn').click());
audio.addEventListener('error', () => {
  isPlaying = false;
  updatePlayState();
  toast('这个音频资源暂时不可用，请换一个版本');
});

function updateAlbumHero(track) {
  if (!track) return;
  const cover = track.cover || './assets/orbit-cover-v2.jpg';
  $('#heroCover').src = cover;
  $('#heroCover').alt = `${track.title} 封面`;
  $('#heroTitle').textContent = track.title;
  $('#heroArtist').textContent = `${track.artist} · ${track.album || '未知专辑'}`;
  $('#heroSearchFocus').textContent = '换一首歌';
}

function initAlbumHero() {
  const hero = $('.album-hero');
  const syncMotion = () => hero?.classList.toggle('is-playing', !audio.paused);
  $('#heroSearchFocus')?.addEventListener('click', () => {
    $('#searchInput').focus();
    $('#searchInput').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center'});
  });
  audio.addEventListener('play', syncMotion);
  audio.addEventListener('pause', syncMotion);
  syncMotion();
}

renderPlaylists(); renderTracks(); initAlbumHero();
