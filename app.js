const tracks = [
  { id: 1, title: "星际漫游", artist: "Neon Harbor", album: "光谱之外", quality: "24 BIT", bpm: 92, key: 0, color: 0, lyrics: [[0,"离开地面以前","Before we leave the ground"],[4,"把未完成的梦装进行囊","Pack the unfinished dreams"],[8,"穿过城市最后一束光","Through the city's final light"],[12,"我们沿着星轨流浪","We wander along the orbit"],[16,"让寂静变成一片海洋","Let silence become an ocean"],[20,"微弱心跳仍在导航","A quiet heartbeat still guides us"],[24,"所有远方 都有回响","Every distance echoes back"],[28,"今夜进入自己的轨道","Tonight, enter your own orbit"]] },
  { id: 2, title: "城市脉冲", artist: "Future Echo", album: "霓虹心跳", quality: "FLAC", bpm: 112, key: 4, color: 1, lyrics: [[0,"红灯之后 城市开始呼吸","After the red light, the city breathes"],[4,"电流沿着街道游离","Current drifts through the streets"],[8,"把脚步调成同一种频率","Set our footsteps to one frequency"],[12,"陌生眼神交换秘密","Strangers trade their secrets"],[16,"喧嚣背后藏着旋律","A melody hides behind the noise"],[20,"每扇窗都是一颗星体","Every window is a star"],[24,"我们短暂地相遇","We meet for just a moment"],[28,"又在晨光以前散去","Then fade before the dawn"]] },
  { id: 3, title: "失重花园", artist: "Lumen", album: "零号温室", quality: "SQ", bpm: 76, key: 7, color: 2, lyrics: [[0,"花朵在真空缓慢盛开","Flowers bloom slowly in the void"],[4,"没有风 也没有尘埃","No wind, no dust"],[8,"时间绕过透明的叶脉","Time bends around clear veins"],[12,"带走所有意外","Taking every accident away"],[16,"如果重力不再存在","If gravity disappears"],[20,"思念会落向哪片海","Where would longing fall"],[24,"我在失重花园等待","I wait in the weightless garden"],[28,"等你从光年之外归来","For you to return across light-years"]] },
  { id: 4, title: "午夜通信", artist: "Ø Signal", album: "无人接听", quality: "24 BIT", bpm: 100, key: 9, color: 3, lyrics: [[0,"频率调到零点以后","Tune in after midnight"],[4,"有谁在宇宙另一头","Someone waits across the universe"],[8,"发送一句没有地址的问候","Send a greeting with no address"],[12,"穿过沉默的气流","Across a silent current"],[16,"信号微弱却足够","The signal is faint but enough"],[20,"证明我们还在等候","To prove we're still waiting"],[24,"如果此刻你也抬头","If you're looking up now"],[28,"就让星光替我开口","Let starlight speak for me"]] },
  { id: 5, title: "月面低语", artist: "Mira Qi", album: "潮汐档案", quality: "FLAC", bpm: 68, key: 2, color: 4, lyrics: [[0,"海水记得月亮的名字","The sea remembers the moon"],[4,"潮汐写下银色的字","Tides write in silver"],[8,"那些来不及说的故事","The stories left untold"],[12,"在夜里重新开始","Begin again at night"],[16,"沿着光的边缘行驶","Travel along the edge of light"],[20,"把孤独折成一枚戒指","Fold loneliness into a ring"],[24,"当世界终于静止","When the world becomes still"],[28,"听见月面低声的诗","Hear a poem from the moon"]] },
  { id: 6, title: "绿色噪点", artist: "Mono Moss", album: "自然机器", quality: "SQ", bpm: 84, key: 5, color: 5, lyrics: [[0,"雨点落进旧收音机","Rain falls into an old radio"],[4,"长出一片绿色频率","Growing a green frequency"],[8,"苔藓覆盖冰冷机器","Moss covers the cold machine"],[12,"所有噪音慢慢平息","All the noise settles"],[16,"呼吸跟随树林迁徙","Breath migrates with the forest"],[20,"光线穿过清晨雾气","Light moves through morning fog"],[24,"关闭过载的思绪","Turn off the overloaded mind"],[28,"回到自然的缝隙","Return to nature's quiet gaps"]] }
];

let visibleTracks = [...tracks];
let currentIndex = 0;
let activeTrack = tracks[0];
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
  playlists: JSON.parse(localStorage.getItem('orbit-playlists') || '["夜航模式","专注频率","私人雷达"]'),
  remoteLibrary: JSON.parse(localStorage.getItem('orbit-remote-library') || '{}')
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
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

function renderWave() {
  $('#heroWave').innerHTML = Array.from({length: 26}, (_, i) => `<i style="height:${5 + ((i * 13) % 20)}px"></i>`).join('');
  $('#statBars').innerHTML = [18,26,14,34,28,43,24,37,31,46,29,40].map((h,i) => `<i class="${i>8?'active':''}" style="height:${h}px"></i>`).join('');
}

function renderPlaylists() {
  $('#playlistNav').innerHTML = state.playlists.map(name => `<button class="playlist-link" data-playlist-name="${name.replaceAll('"','&quot;')}"># ${name}</button>`).join('');
}

function getTrackById(id) { return allTracks().find(t => String(t.id) === String(id)); }

function renderTracks(list = visibleTracks) {
  const table = $('#trackTable');
  table.classList.toggle('manage-mode', isManageMode);
  table.innerHTML = list.map((track, index) => `
    <article class="track-row" data-id="${escapeHtml(track.id)}">
      <button class="track-index icon-btn row-play" data-action="play" aria-label="播放 ${escapeHtml(track.title)}">${String(currentTrack()?.id) === String(track.id) && isPlaying ? 'Ⅱ' : String(index + 1).padStart(2,'0')}</button>
      <div class="track-meta"><div class="track-cover ${track.cover ? 'has-image' : `cover-${track.color ?? index % 6}`}" ${track.cover ? `style="background-image:url('${escapeHtml(track.cover)}')"` : ''}><span>${String(index + 1).padStart(2,'0')}</span></div><div class="track-name"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div></div>
      <span class="album-name">${escapeHtml(track.album || '未知专辑')}</span>
      <span class="quality">${escapeHtml(track.quality || 'MP3')}</span>
      <span class="track-time">${formatTime(track.duration || 32)}</span>
      <div class="track-actions">
        <button class="play-track-btn" data-action="play" aria-label="播放 ${escapeHtml(track.title)}"><span>▶</span><b>播放</b></button>
        <button class="icon-btn ${state.favorites.has(String(track.id))?'active':''}" data-action="favorite" aria-label="收藏 ${escapeHtml(track.title)}">${state.favorites.has(String(track.id))?'♥':'♡'}</button>
        <button class="icon-btn download-btn" data-action="download" aria-label="下载 ${track.title}">⇣</button>
        <button class="icon-btn delete-btn" data-action="delete" aria-label="删除 ${track.title}">×</button>
      </div>
    </article>`).join('');
  $('#emptyState').hidden = list.length > 0;
  $('#libraryCount').textContent = allTracks().length;
  $('#favoriteCount').textContent = state.favorites.size;
  $('#downloadCount').textContent = state.downloads.length;
}

function currentTrack() { return activeTrack || tracks[0]; }

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

async function selectTrack(track, autoplay = true) {
  activeTrack = track;
  if (!playQueue.some(item => String(item.id) === String(track.id))) playQueue = visibleTracks.length ? visibleTracks : allTracks();
  currentIndex = Math.max(0, playQueue.findIndex(item => String(item.id) === String(track.id)));
  $('#playerTitle').textContent = track.title;
  $('#playerArtist').textContent = track.artist;
  $('#lyricTitle').textContent = track.title;
  $('#lyricArtist').textContent = `${track.artist} · ${track.album}`;
  $('#playerFavorite').textContent = state.favorites.has(String(track.id)) ? '♥' : '♡';
  $('#playerFavorite').classList.toggle('active', state.favorites.has(String(track.id)));
  $('#miniCover').className = `mini-cover cover-${track.color}`;
  $('#miniCover').innerHTML = `<span>${String(currentIndex + 1).padStart(2,'0')}</span>`;
  $('#coverLarge').className = `cover-large cover-${track.color}`;
  $('#coverLarge').innerHTML = `<span>ORBIT ${String(currentIndex + 1).padStart(2,'0')}</span>`;
  if (track.cover) {
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
  if (!audio.src) selectTrack(currentTrack(), true);
  else if (audio.paused) playAudio();
  else { audio.pause(); isPlaying = false; updatePlayState(); }
}

function updatePlayState() {
  $('#mainPlayBtn').textContent = isPlaying ? 'Ⅱ' : '▶';
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
  const id = String(track.id);
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  if (track.remote) {
    const saved = {...track}; delete saved.resolvedUrl; delete saved.lyrics;
    state.remoteLibrary[id] = saved;
  }
  saveState(); renderTracks(visibleTracks);
  $('#playerFavorite').textContent = state.favorites.has(id) ? '♥' : '♡';
  toast(state.favorites.has(id) ? `已收藏「${track.title}」` : `已取消收藏「${track.title}」`);
}

async function downloadTrack(track) {
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
  const titles = {discover:'今日精选', library:'我的曲库', favorites:'我的收藏', downloads:'下载记录'};
  $('#sectionTitle').textContent = titles[view];
  const all = allTracks();
  if (view === 'favorites') visibleTracks = all.filter(t => state.favorites.has(String(t.id)));
  else if (view === 'downloads') visibleTracks = all.filter(t => state.downloads.includes(String(t.id)));
  else if (view === 'discover') visibleTracks = [...tracks];
  else visibleTracks = all;
  playQueue = visibleTracks;
  renderTracks(visibleTracks);
  if (innerWidth < 740) $('.sidebar').classList.remove('open');
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
  $('#sectionTitle').textContent = `搜索「${keyword}」`;
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
    if (!track.remote && !track.localUrl) return toast('首页精选不可删除');
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
$('#mobileMenu').onclick = () => $('.sidebar').classList.toggle('open');
$('#uploadBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => handleImport(e.target.files);
$('#manageBtn').onclick = () => { isManageMode = !isManageMode; $('#manageBtn').textContent = isManageMode ? '完成管理' : '管理曲库'; renderTracks(); };
$('#playMixBtn').onclick = () => { visibleTracks = [...tracks]; playQueue = visibleTracks; selectTrack(tracks[0]); };
$('#randomBtn').onclick = () => selectTrack(visibleTracks[Math.floor(Math.random()*visibleTracks.length)] || tracks[0]);
$('#mainPlayBtn').onclick = togglePlay;
$('#prevBtn').onclick = () => selectTrack(playQueue[(currentIndex - 1 + playQueue.length) % playQueue.length] || activeTrack);
$('#nextBtn').onclick = () => selectTrack(playQueue[(currentIndex + 1) % playQueue.length] || activeTrack);
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
$('#playlistNav').addEventListener('click', e => { const b=e.target.closest('[data-playlist-name]'); if(b) toast(`已打开歌单「${b.dataset.playlistName}」`); });
$('#collectionGrid').addEventListener('click', e => { const card=e.target.closest('[data-playlist]'); if(card) { selectTrack(tracks[card.classList.contains('mix-purple')?3:2]); toast(`正在播放「${card.dataset.playlist}」`); } });
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('play', () => { isPlaying=true; updatePlayState(); });
audio.addEventListener('pause', () => { isPlaying=false; updatePlayState(); });
audio.addEventListener('ended', () => $('#nextBtn').click());
audio.addEventListener('error', () => {
  isPlaying = false;
  updatePlayState();
  toast('这个音频资源暂时不可用，请换一个版本');
});

renderWave(); renderPlaylists(); renderTracks(); selectTrack(tracks[0], false);
