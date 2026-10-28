(() => {
  const routes = { home: true, search: true, charts: true, song: true, player: true, library: true, profile: true, lyrics: true, artist: true, "my-playlist": true, queue: true };
  let api = "";
  let vietnamConnection;
  const frame = document.querySelector("#screen");
  const audio = new Audio();
  const nativePlayback = window.CineTunePlayback?.command && window.CineTunePlayback?.state ? window.CineTunePlayback : null;
  let nativePosition = 0;
  let nativeDuration = 0;
  let nativeReady = false;
  const playbackPosition = () => nativePlayback ? nativePosition : audio.currentTime;
  const playbackDuration = () => nativePlayback ? (nativeDuration || state.current?.duration || 0) : (Number.isFinite(audio.duration) ? audio.duration : state.current?.duration || 0);
  const nativeCommand = (action, value = "") => { try { nativePlayback?.command(action, String(value)); } catch {} };
  function syncNativePlayback() {
    if (!nativePlayback) return;
    let status;
    try { status = JSON.parse(nativePlayback.state()); } catch { return; }
    if (!status.id) return;
    const changed = trackId(state.current) !== status.id;
    const wasPlaying = state.playing;
    const oldError = state.playbackError;
    if (changed) {
      const track = allTracks().find((item) => trackId(item) === status.id);
      if (track) { state.current = track; state.lyricId = null; state.history = [track, ...state.history.filter((item) => trackId(item) !== status.id)].slice(0, 20); save(); }
    }
    nativeReady = Boolean(status.ready);
    nativePosition = Math.max(0, Number(status.position) || 0) / 1000;
    nativeDuration = Math.max(0, Number(status.duration) || 0) / 1000;
    state.playing = Boolean(status.playing);
    state.playbackError = status.error || "";
    state.sleepUntil = Number(status.sleepUntil) || 0;
    if (changed || wasPlaying !== state.playing || oldError !== state.playbackError) repaint();
    else syncProgress();
    syncLyrics();
  }
  function syncLyrics() {
    if (state.route !== "lyrics") return;
    const doc = frame.contentDocument;
    const index = state.lyricLines.findLastIndex((line) => line.time <= playbackPosition() * 1000);
    const active = doc?.querySelector(".lyrics .active");
    const next = doc?.querySelector(`[data-lyric-index="${index}"]`);
    if (next && next !== active) { active?.classList.remove("active"); next.classList.add("active"); next.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  const stored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const state = {
    route: "", tracks: [], chartData: null, chartHour: 23, results: [],
    releaseTracks: [], releaseLoading: false, releaseError: "", query: "",
    current: null, playing: false, loading: true, error: "", playbackError: "",
    chartMode: "chart", topSections: [], topLoading: false, topError: "",
    playlistId: "", playlistTitle: "", playlistTracks: [], playlistLoading: false,
    queue: stored("cinetune-queue", []), shuffle: localStorage.getItem("cinetune-shuffle") === "true",
    repeatMode: localStorage.getItem("cinetune-repeat") || "all", sleepUntil: 0, showSleepOptions: false,
    lyricId: null, lyricLines: [], lyricLoading: false, lyricError: "",
    favorites: new Set(stored("cinetune-favorites", [])), history: stored("cinetune-history", []),
    myPlaylists: stored("cinetune-playlists", []), selectedPlaylist: localStorage.getItem("cinetune-selected-playlist") || "",
    deletingPlaylistId: "", addingTrackId: "", artistAlias: localStorage.getItem("cinetune-artist") || "",
    artistData: null, artistTracks: [], artistLoading: false, artistError: "", artistPage: 1, artistHasMore: false
  };
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const art = (track, large = false) => { const url = track?.thumbnailM || track?.thumbnail || ""; return large ? url.replace(/\/w(?:94|240)_/, "/w600_") : url; };
  const artist = (track) => track?.artistsNames || "Nghệ sĩ";
  const officialUrl = (track) => track?.link?.startsWith("/") ? `https://zingmp3.vn${track.link}` : "https://zingmp3.vn/";
  const trackId = (track) => track?.encodeId || track?.id;
  const duration = (seconds) => `${Math.floor((Number(seconds) || 0) / 60)}:${String((Number(seconds) || 0) % 60).padStart(2, "0")}`;
  const route = () => location.hash.slice(1) === "lyrics-karaoke" ? "lyrics" : Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : "home";
  const allTracks = () => [...state.tracks, ...state.results, ...state.releaseTracks, ...state.playlistTracks, ...state.artistTracks, ...state.history, ...state.queue, ...state.myPlaylists.flatMap((list) => list.tracks)];
  const save = () => { localStorage.setItem("cinetune-favorites", JSON.stringify([...state.favorites])); localStorage.setItem("cinetune-history", JSON.stringify(state.history.slice(0, 20))); localStorage.setItem("cinetune-playlists", JSON.stringify(state.myPlaylists)); localStorage.setItem("cinetune-queue", JSON.stringify(state.queue)); };
  const selectedList = () => state.myPlaylists.find((list) => list.id === state.selectedPlaylist);
  const artistLinks = (track) => (Array.isArray(track?.artists) && track.artists.length ? track.artists : [{ name: artist(track), alias: track?.artist?.alias }]).map((person) => person.alias ? `<button class="artist-link" data-artist="${esc(person.alias)}">${esc(person.name)}</button>` : `<span>${esc(person.name)}</span>`).join('<span class="artist-separator">, </span>');
  const repaint = () => { if (frame.contentDocument) render(frame.contentDocument); };
  const go = (next) => { location.hash = Object.hasOwn(routes, next) ? next : "home"; };
  const back = () => history.length > 1 && route() !== "home" ? history.back() : go("home");

  async function get(path) {
    const response = await fetch(`${api}${path}`);
    if (!response.ok) throw new Error(`Zing MP3 error ${response.status}`);
    return await response.json();
  }
  function connectVietnam() {
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return Promise.resolve();
    if (vietnamConnection) return vietnamConnection;
    vietnamConnection = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const configResponse = await fetch(`https://raw.githubusercontent.com/vin371/MO-Cintune/main/config/android.json?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        if (!configResponse.ok) return;
        const config = await configResponse.json();
        const url = config.vietnamApiUrl;
        if (!/^https:\/\/[a-z0-9.-]+$/i.test(url || "")) return;
        const health = await fetch(`${url}/health`, { cache: "no-store", signal: controller.signal });
        if (health.ok) api = url;
      } catch (error) { /* Máy chủ tại Việt Nam có thể đang tắt; dùng máy chủ trực tuyến. */ }
      finally { clearTimeout(timeout); }
    })();
    return vietnamConnection;
  }
  async function loadTrending() {
    state.loading = true; repaint();
    try { const payload = await get("/api/chart-home"); state.tracks = payload?.data?.RTChart?.items || []; state.chartData = payload?.data?.RTChart?.chart || null; if (!state.current) state.current = state.tracks[0]; if (nativePlayback && state.queue.length === 1 && state.tracks.length > 1) { state.queue = [state.queue[0], ...state.tracks.filter((item) => trackId(item) !== trackId(state.queue[0]))]; save(); nativeCommand("updateQueue", JSON.stringify({ tracks: state.queue.map(nativeTrack), repeat: state.repeatMode })); } }
    catch (error) { state.error = "Chưa tải được danh sách bài hát. Hãy thử lại sau."; }
    finally { state.loading = false; repaint(); }
  }
  async function loadNewRelease() {
    if (state.releaseTracks.length || state.releaseLoading) return;
    state.releaseLoading = true; state.releaseError = ""; repaint();
    try { const payload = await get("/api/newrelease-chart"); if (payload?.err !== 0) throw new Error("Release unavailable"); state.releaseTracks = payload?.data?.items || []; }
    catch (error) { state.releaseError = "Chưa tải được nhạc mới. Chạm để thử lại."; }
    finally { state.releaseLoading = false; repaint(); }
  }
  async function loadTop100() {
    if (state.topSections.length || state.topLoading) return;
    state.topLoading = true; state.topError = ""; repaint();
    try { const payload = await get("/api/top100"); state.topSections = payload?.data || []; if (payload?.err !== 0) throw new Error("Top 100 unavailable"); }
    catch (error) { state.topError = "Chưa tải được Top 100. Chạm để thử lại."; }
    finally { state.topLoading = false; repaint(); }
  }
  async function openPlaylist(id) {
    state.playlistId = id; state.playlistTracks = []; state.playlistLoading = true; repaint();
    try { const payload = await get(`/api/detail-playlist?id=${encodeURIComponent(id)}`); if (payload?.err !== 0) throw new Error("Playlist unavailable"); state.playlistTitle = payload?.data?.title || "Top 100"; state.playlistTracks = payload?.data?.song?.items || []; }
    catch (error) { state.topError = "Chưa tải được danh sách này. Hãy thử lại."; }
    finally { state.playlistLoading = false; repaint(); }
  }
  async function openArtist(alias) {
    localStorage.setItem("cinetune-artist", alias);
    state.artistAlias = alias; state.artistData = null; state.artistTracks = []; state.artistError = ""; state.artistPage = 1; state.artistHasMore = false;
    go("artist"); state.artistLoading = true; repaint();
    try {
      const response = await get(`/api/artist?name=${encodeURIComponent(alias)}`);
      if (response?.err !== 0 || !response.data) throw new Error("artist unavailable");
      if (state.artistAlias !== alias) return;
      state.artistData = response.data;
      const sectionSongs = response.data.sections?.filter((section) => section.sectionType === "song").flatMap((section) => section.items || []).filter((item) => item.encodeId) || [];
      state.artistTracks = [...new Map(sectionSongs.map((item) => [trackId(item), item])).values()];
      if (response.data.id) await loadArtistSongs(1);
    } catch { if (state.artistAlias === alias) state.artistError = "Chưa tải được trang nghệ sĩ. Chạm để thử lại."; }
    finally { if (state.artistAlias === alias) { state.artistLoading = false; repaint(); } }
  }
  async function loadArtistSongs(pageNumber) {
    const id = state.artistData?.id; if (!id) return;
    state.artistLoading = true; repaint();
    try {
      const response = await get(`/api/artist-songs?id=${encodeURIComponent(id)}&page=${pageNumber}&count=50`);
      const songs = response?.data?.items || [];
      if (state.artistData?.id !== id) return;
      state.artistTracks = [...new Map([...state.artistTracks, ...songs].map((item) => [trackId(item), item])).values()];
      state.artistPage = pageNumber; state.artistHasMore = Boolean(response?.data?.hasMore);
    } catch { state.artistError = "Chưa tải thêm được bài hát."; }
    finally { state.artistLoading = false; repaint(); }
  }
  function setQueue(list, startId = "") {
    state.queue = [...list];
    if (state.shuffle && state.queue.length > 1) {
      const first = state.queue.find((track) => trackId(track) === startId) || state.queue[0];
      const rest = state.queue.filter((track) => trackId(track) !== trackId(first));
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      state.queue = [first, ...rest];
    }
    save();
    if (nativePlayback && state.queue.length) nativeCommand("updateQueue", JSON.stringify({ tracks: state.queue.map(nativeTrack), repeat: state.repeatMode }));
  }
  const nativeTrack = (track) => ({ id: trackId(track), title: track.title || "Bài hát", artist: artist(track) });
  function shuffleQueue(playNext = false) {
    const list = state.queue.length > 1 ? state.queue : state.tracks.length > 1 ? state.tracks : state.queue;
    const currentId = trackId(state.current);
    const others = [...new Map(list.filter((track) => trackId(track) !== currentId).map((track) => [trackId(track), track])).values()];
    if (!others.length) return false;
    const recent = new Set(state.history.slice(0, 12).map(trackId));
    const fresh = others.filter((track) => !recent.has(trackId(track)));
    const candidates = fresh.length ? fresh : others;
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    const remaining = others.filter((track) => trackId(track) !== trackId(next));
    for (let i = remaining.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]]; }
    state.queue = [state.current, next, ...remaining].filter(Boolean);
    save();
    if (nativePlayback) nativeCommand("updateQueue", JSON.stringify({ tracks: state.queue.map(nativeTrack), repeat: state.repeatMode }));
    if (playNext) play(trackId(next));
    return true;
  }
  function createPlaylist(name, trackIdToAdd = "") {
    const title = name.trim().slice(0, 60); if (!title) return;
    const track = allTracks().find((item) => trackId(item) === trackIdToAdd);
    const list = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: title, tracks: track ? [track] : [] };
    state.myPlaylists.unshift(list); state.addingTrackId = ""; save(); repaint();
  }
  function addToPlaylist(listId, id) {
    const list = state.myPlaylists.find((entry) => entry.id === listId);
    const track = allTracks().find((entry) => trackId(entry) === id);
    if (list && track && !list.tracks.some((entry) => trackId(entry) === id)) list.tracks.push(track);
    state.addingTrackId = ""; save(); repaint();
  }
  function advance(direction, fromEnd = false) {
    if (nativePlayback) { nativeCommand(direction > 0 ? "next" : "previous"); return; }
    const list = state.queue.length ? state.queue : state.tracks;
    if (!list.length) { state.playing = false; repaint(); return; }
    if (fromEnd && state.repeatMode === "one") { audio.currentTime = 0; audio.play().catch(() => { state.playing = false; repaint(); }); return; }
    const index = list.findIndex((track) => trackId(track) === trackId(state.current));
    if (fromEnd && state.repeatMode === "off" && index >= list.length - 1) { state.playing = false; repaint(); return; }
    play(trackId(list[(index + direction + list.length) % list.length]));
  }
  function queueForRoute() {
    if (state.route === "charts" && state.chartMode === "top100" && state.playlistId) return state.playlistTracks;
    if (state.route === "charts" && state.chartMode === "new") return state.releaseTracks;
    if (state.route === "artist") return state.artistTracks;
    if (state.route === "my-playlist") return selectedList()?.tracks || [];
    if (state.route === "search" && state.query) return state.results;
    if (state.route === "library") return state.tracks.filter((track) => state.favorites.has(trackId(track))).concat(state.history.filter((track) => !state.favorites.has(trackId(track))));
    return state.tracks;
  }
  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    localStorage.setItem("cinetune-shuffle", String(state.shuffle));
    if (state.shuffle && shuffleQueue(true)) return;
    repaint();
  }
  function setRepeatMode() {
    state.repeatMode = { all: "one", one: "off", off: "all" }[state.repeatMode] || "all";
    localStorage.setItem("cinetune-repeat", state.repeatMode);
    nativeCommand("repeat", state.repeatMode);
    repaint();
  }
  let sleepTimeout;
  function stopForSleep() {
    if (nativePlayback) return;
    if (!state.sleepUntil || Date.now() < state.sleepUntil) return;
    clearTimeout(sleepTimeout);
    state.sleepUntil = 0;
    audio.pause();
    state.playing = false;
    repaint();
  }
  function setSleepTimer(minutes) {
    clearTimeout(sleepTimeout);
    state.sleepUntil = minutes ? Date.now() + minutes * 60000 : 0;
    nativeCommand("sleep", state.sleepUntil);
    if (minutes) sleepTimeout = setTimeout(stopForSleep, minutes * 60000);
    repaint();
  }
  const sleepLabel = () => state.sleepUntil ? `${Math.max(1, Math.ceil((state.sleepUntil - Date.now()) / 60000))} phút còn lại` : "Tắt";
  let searchTimer;
  let searchRequestId = 0;
  function searchMarkup() {
    const list = state.query ? state.results : state.tracks.slice(0, 8);
    return list.length ? list.map(item).join("") : '<div class="empty">Nhập nội dung để bắt đầu tìm kiếm.</div>';
  }
  function refreshSearchResults() {
    const doc = frame.contentDocument;
    if (!doc || state.route !== "search") return repaint();
    const results = doc.querySelector("#search-results");
    const note = doc.querySelector("#search-note");
    if (!results || !note) return repaint();
    note.textContent = state.query ? `Kết quả cho “${state.query}”` : "Gợi ý nhạc thịnh hành";
    results.innerHTML = searchMarkup();
  }
  function search(query) {
    state.query = query;
    const requestId = ++searchRequestId;
    clearTimeout(searchTimer);
    if (!query.trim()) { state.results = []; refreshSearchResults(); return; }
    searchTimer = setTimeout(async () => {
      try {
        const payload = await get(`/api/search?q=${encodeURIComponent(query)}`);
        const results = payload?.data?.songs || [];
        if (requestId !== searchRequestId) return;
        state.results = results;
      }
      catch (error) { state.error = "Tìm kiếm tạm thời không khả dụng."; }
      if (requestId === searchRequestId) refreshSearchResults();
    }, 260);
  }
  async function play(id) {
    const track = allTracks().find((item) => trackId(item) === id); if (!track) return;
    state.current = track; miniDismissed = false; state.lyricId = null; state.history = [track, ...state.history.filter((item) => trackId(item) !== id)].slice(0, 20); save();
    state.playbackError = "";
    if (nativePlayback) {
      const selected = state.queue.length ? state.queue : [track];
      const list = selected.length > 1 ? selected : [track, ...state.tracks.filter((item) => trackId(item) !== id)];
      state.queue = list; save();
      nativeCommand("playQueue", JSON.stringify({ tracks: list.map(nativeTrack), startId: id, repeat: state.repeatMode }));
      nativePosition = 0; nativeDuration = track.duration || 0; nativeReady = false; state.playing = true; repaint();
      return;
    }
    try {
      const native = window.CineTuneNative;
      if (!native?.getSong) await connectVietnam();
      const source = native?.getSong ? JSON.parse(native.getSong(id)) : await get(`/api/song?id=${encodeURIComponent(id)}`);
      if (source.err !== 0 || !source.data?.["128"]) throw new Error(source.msg || "Bài hát không có nguồn phát.");
      audio.src = native?.getSong ? source.data["128"] : `${api}/api/song/stream?id=${encodeURIComponent(id)}`;
      await audio.play(); state.playing = true;
    } catch (error) { state.playing = false; state.playbackError = "Chưa phát được bài này. Bạn có thể nghe trên Zing MP3."; }
    repaint();
  }
  async function loadLyrics() {
    const id = trackId(state.current) || trackId(state.tracks[0]);
    if (!id || state.lyricId === id) return;
    state.lyricId = id; state.lyricLoading = true; state.lyricError = ""; state.lyricLines = []; repaint();
    try {
      const payload = await get(`/api/lyric?id=${encodeURIComponent(id)}`);
      if (state.lyricId !== id) return;
      if (payload.err !== 0) throw new Error(payload.msg || "Không có lời bài hát");
      state.lyricLines = (payload.data?.sentences || []).map((line) => ({ time: line.words?.[0]?.startTime || 0, text: (line.words || []).map((word) => word.data).join(" ") })).filter((line) => line.text.trim());
      if (!state.lyricLines.length) state.lyricError = "Bài hát này chưa có lời trên Zing MP3.";
    } catch (error) { state.lyricError = "Chưa tải được lời bài hát này."; }
    finally { if (state.lyricId === id) { state.lyricLoading = false; repaint(); } }
  }
  async function toggle() {
    if (nativePlayback) {
      if (!state.current) return play(trackId(state.tracks[0]));
      if (!nativeReady && !state.playing) return play(trackId(state.current));
      nativeCommand("toggle"); state.playing = !state.playing; repaint(); return;
    }
    if ((!state.current && state.tracks[0]) || (state.current && !audio.src)) return play(trackId(state.current || state.tracks[0]));
    if (audio.paused) { await audio.play(); state.playing = true; } else { audio.pause(); state.playing = false; }
    repaint();
  }
  function favorite(id) { state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id); save(); repaint(); }

  function item(track) {
    const id = trackId(track), liked = state.favorites.has(id);
    return `<article class="track"><img src="${esc(art(track))}" alt="" loading="lazy"><span class="track-info"><button class="copy" data-nav="song" data-track="${esc(id)}"><strong>${esc(track.title)}</strong></button><span class="track-artists">${artistLinks(track)}</span></span><button class="round" data-play="${esc(id)}">▶</button><button class="track-add" data-add-track="${esc(id)}" aria-label="Thêm vào playlist">＋</button><button class="heart" data-favorite="${esc(id)}">${liked ? "♥" : "♡"}</button></article>`;
  }
  function playlistPicker() {
    if (!state.addingTrackId) return "";
    const choices = state.myPlaylists.map((list) => `<button data-add-to-list="${esc(list.id)}"><strong>${esc(list.name)}</strong><span>${list.tracks.length} bài hát</span></button>`).join("");
    return `<div class="modal-backdrop" data-close-picker><section class="playlist-picker" role="dialog" aria-modal="true" aria-label="Thêm vào playlist"><div class="picker-head"><h2>Thêm vào playlist</h2><button data-close-picker aria-label="Đóng">×</button></div>${choices || '<p class="note">Bạn chưa có playlist nào.</p>'}<form data-create-playlist><label for="playlist-name">Tạo playlist mới</label><div><input id="playlist-name" name="name" maxlength="60" required placeholder="Tên playlist"><button type="submit">Tạo & thêm</button></div></form></section></div>`;
  }
  function chartVisual(compact = false) {
    const chart = state.chartData;
    if (!chart?.items) return '<div class="empty">Đang tải biểu đồ 24 giờ…</div>';
    const colors = ["#8b80ff", "#38d6ee", "#ffb45f"];
    const series = Object.entries(chart.items).slice(0, 3);
    const count = Math.min(24, series[0]?.[1]?.length || 0);
    if (!count) return '<div class="empty">Biểu đồ chưa có dữ liệu.</div>';
    const hour = Math.min(state.chartHour, count - 1);
    const high = Math.max(Number(chart.maxScore) || 0, ...series.flatMap(([, points]) => points.map((point) => Number(point.counter) || 0)), 1);
    const x = (index) => 18 + index * 304 / (count - 1);
    const y = (score) => 154 - (Number(score) || 0) / high * 132;
    const grid = [0, 1, 2, 3].map((step) => `<line x1="18" y1="${22 + step * 44}" x2="322" y2="${22 + step * 44}" stroke="#ffffff19" stroke-dasharray="3 6"/>`).join("");
    const paths = series.map(([, points], index) => `<path d="${points.slice(0, count).map((point, pointIndex) => `${pointIndex ? "L" : "M"}${x(pointIndex).toFixed(1)} ${y(point.counter).toFixed(1)}`).join(" ")}" fill="none" stroke="${colors[index]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    const dots = series.map(([, points], index) => `<circle cx="${x(hour).toFixed(1)}" cy="${y(points[hour]?.counter).toFixed(1)}" r="5" fill="${colors[index]}" stroke="#111a32" stroke-width="3"/>`).join("");
    const hotspots = Array.from({ length: count }, (_, index) => `<rect data-chart-hour="${index}" x="${(x(index) - 304 / count / 2).toFixed(1)}" y="0" width="${(304 / count + 2).toFixed(1)}" height="176" fill="transparent"/>`).join("");
    const hourLabel = `${String(series[0][1][hour]?.hour ?? chart.times?.[hour]?.hour ?? "").padStart(2, "0")}:00`;
    const axisLabel = (fraction) => `${String(series[0][1][Math.round((count - 1) * fraction)]?.hour ?? "").padStart(2, "0")}:00`;
    const legend = series.map(([id, points], index) => { const track = state.tracks.find((entry) => trackId(entry) === id); return `<button class="chart-legend" data-play="${esc(id)}"><i style="background:${colors[index]}"></i><span><strong>${esc(track?.title || `Bài hát ${index + 1}`)}</strong><small>${esc(artist(track))}</small></span><b>${new Intl.NumberFormat("vi-VN").format(points[hour]?.counter || 0)}</b></button>`; }).join("");
    return `<section class="chart-card ${compact ? "compact" : ""}"><div class="section-heading"><div><span class="eyebrow">Xu hướng trực tiếp</span><h2>Nhịp điệu 24 giờ</h2></div><span class="chart-time">${hourLabel}</span></div><svg class="trend-chart" viewBox="0 0 340 180" role="img" aria-label="Biểu đồ lượt nghe 24 giờ của ba bài hát nổi bật">${grid}<line x1="${x(hour).toFixed(1)}" y1="16" x2="${x(hour).toFixed(1)}" y2="160" stroke="#ffffff55" stroke-dasharray="4 4"/>${paths}${dots}${hotspots}</svg><div class="chart-axis"><span>${axisLabel(0)}</span><span>${axisLabel(.25)}</span><span>${axisLabel(.5)}</span><span>${axisLabel(.75)}</span><span>${axisLabel(1)}</span></div><div class="chart-legend-list">${legend}</div></section>`;
  }
  function nav() {
    return `<nav>${[["home", "⌂", "Trang chủ"], ["search", "⌕", "Tìm kiếm"], ["charts", "▥", "BXH"], ["library", "♫", "Thư viện"], ["profile", "◉", "Cá nhân"]].map(([key, icon, label]) => `<button data-nav="${key}" class="${state.route === key ? "active" : ""}"><b>${icon}</b>${label}</button>`).join("")}</nav>`;
  }
  let miniDismissed = false;
  function mini() {
    if (!state.current || miniDismissed || !["home", "search", "charts", "library", "profile"].includes(state.route) || !(nativePlayback ? nativeReady || state.playing : audio.src)) return "";
    return `<div class="mini"><button class="mini-open" data-nav="player"><img src="${esc(art(state.current))}" alt=""><span><strong>${esc(state.current.title)}</strong><small>${esc(artist(state.current))}</small></span></button><button class="mini-toggle" data-action="toggle" aria-label="${state.playing ? "Tạm dừng" : "Tiếp tục"}">${state.playing ? "Ⅱ" : "▶"}</button><button class="mini-close" data-action="dismiss" aria-label="Đóng thanh nhạc">×</button></div>`;
  }
  function page(title, body, options = {}) {
    const { backButton = false, tabs = true } = options;
    return `<style>*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#f7f8fd;font-family:Inter,system-ui,sans-serif}.app{min-height:100dvh;padding:18px 16px 150px}button{font:inherit;cursor:pointer}.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top h1{margin:0;font-size:21px;letter-spacing:-.03em}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#4169e1}.back,.round{border:0;background:#e6eeff;color:#214fc7}.back{width:40px;height:40px;border-radius:50%;font-size:24px}.hero{padding:20px;border-radius:22px;color:white;background:linear-gradient(135deg,#214fc7,#7161e3);box-shadow:0 16px 32px #214fc73b}.hero h2{font-size:26px;line-height:1.1;margin:6px 0}.hero p{font-size:14px;opacity:.84;margin:0}.head{display:flex;justify-content:space-between;align-items:end;margin:24px 0 10px}.head h2{margin:0;font-size:17px}.head span,.note{color:#747685;font-size:12px}.track{display:grid;grid-template-columns:54px 1fr 39px 32px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #e6eeff}.track img{width:54px;height:54px;object-fit:cover;border-radius:13px;background:#e6eeff}.copy{background:transparent;border:0;padding:0;text-align:left;min-width:0;color:#121c2a}.copy strong,.copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy strong{font-size:14px}.copy span{font-size:12px;color:#747685;margin-top:4px}.round{width:38px;height:38px;border-radius:50%;font-weight:800}.heart{border:0;background:transparent;color:#5846c8;font-size:21px}.empty{padding:30px 18px;border-radius:18px;background:#eef3ff;text-align:center;color:#747685}.search{width:100%;padding:15px 16px;border:0;border-radius:16px;background:#fff;box-shadow:0 4px 18px #121c2a12;font-size:15px;outline-color:#4169e1}.art{width:100%;aspect-ratio:1;object-fit:cover;border-radius:26px;box-shadow:0 20px 36px #121c2a33}.center{text-align:center;margin:22px 0}.center h2{margin:0 0 8px;font-size:25px}.center p{margin:0;color:#747685}.actions{display:flex;gap:10px}.primary,.secondary{flex:1;border:0;padding:14px;border-radius:14px;font-weight:800}.primary{background:#214fc7;color:#fff}.secondary{background:#e6eeff;color:#214fc7}.card{padding:18px;background:#fff;border-radius:18px;box-shadow:0 4px 18px #121c2a0d;margin:12px 0}.card strong{display:block;color:#214fc7;font-size:23px}.time{display:flex;justify-content:space-between;color:#747685;font-size:12px}.controls{display:flex;justify-content:center;align-items:center;gap:22px;margin:28px 0}.controls button{border:0;background:transparent;color:#214fc7;font-size:25px}.controls .main{width:68px;height:68px;border-radius:50%;background:#214fc7;color:#fff}nav{position:fixed;bottom:0;left:0;right:0;height:72px;padding-bottom:env(safe-area-inset-bottom);display:flex;background:#fffffff5;box-shadow:0 -3px 18px #121c2a12}nav button{width:20%;border:0;background:transparent;color:#747685;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:11px}nav b{font-size:22px;line-height:20px}nav .active{color:#214fc7;font-weight:800}.mini{position:fixed;bottom:82px;left:16px;right:16px;z-index:2;display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e6eeff;border-radius:18px;background:#fff;box-shadow:0 10px 30px #121c2a24;color:#121c2a;text-align:left}.mini-open{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0;border:0;background:transparent;text-align:left}.mini img{width:44px;height:44px;object-fit:cover;border-radius:12px}.mini span{min-width:0;flex:1}.mini strong,.mini small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini strong{font-size:13px}.mini small{color:#747685;font-size:11px;margin-top:3px}.mini-toggle,.mini-close{width:34px;height:34px;border:0;border-radius:50%;background:#e6eeff;color:#214fc7;font-size:18px}.mini-close{background:transparent;color:#747685;font-size:25px}.art-frame{max-width:500px;margin:0 auto;aspect-ratio:1;border-radius:24px;overflow:hidden;background:#dfe9fc;box-shadow:0 20px 36px #121c2a25}.art-frame .art{display:block;width:100%;height:100%;border-radius:0;box-shadow:none}.seek{appearance:none;width:100%;height:7px;margin:20px 0 8px;border-radius:99px;background:linear-gradient(to right,#214fc7 var(--played),#d9e3f6 var(--played));cursor:pointer}.seek::-webkit-slider-thumb{appearance:none;width:16px;height:16px;border:3px solid #fff;border-radius:50%;background:#214fc7;box-shadow:0 1px 6px #121c2a55}.seek::-moz-range-thumb{width:12px;height:12px;border:3px solid #fff;border-radius:50%;background:#214fc7}.lyrics{font-size:20px;line-height:1.8;margin:26px 4px}.lyrics p{opacity:.38}.lyrics .active{opacity:1;color:#214fc7;font-weight:800}.karaoke{padding:14px;border-radius:16px;background:#eef3ff;color:#4169e1;font-size:13px}nav{height:calc(72px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom)}.mini{bottom:calc(82px + env(safe-area-inset-bottom))}.app{padding-bottom:calc(150px + env(safe-area-inset-bottom))}.chart-tabs{display:flex;gap:8px;margin:8px 0 14px;padding:5px;border-radius:16px;background:#e6eeff}.chart-tabs button{flex:1;border:0;border-radius:12px;padding:11px 6px;background:transparent;color:#52647c;font-weight:800}.chart-tabs button.selected{background:#fff;color:#214fc7;box-shadow:0 3px 12px #121c2a12}.ranked{display:flex;align-items:center;gap:8px}.ranked .track{flex:1;min-width:0}.rank{width:28px;flex:none;text-align:center;color:#214fc7;font-size:17px}.playlist-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.playlist-card{display:flex;flex-direction:column;gap:9px;padding:8px;border:0;border-radius:16px;background:#fff;color:#121c2a;text-align:left;box-shadow:0 3px 14px #121c2a0c}.playlist-card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:11px}.playlist-card span{font-size:13px;font-weight:700;line-height:1.35}.playlist-back{border:0;background:transparent;color:#214fc7;padding:8px 0;font-weight:700}.player-tools{display:flex;gap:10px;margin:0 0 12px}.player-tools button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;padding:12px 8px;border:0;border-radius:14px;background:#e6eeff;color:#214fc7}.player-tools button.selected{background:#dce7ff}.player-tools b{font-size:22px;line-height:1}.player-tools span{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sleep-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:0 0 14px}.sleep-options button{border:0;border-radius:12px;padding:11px 2px;background:#edf1f9;color:#40506b;font-size:12px;font-weight:700}.sleep-options button.selected{background:#214fc7;color:white}</style><link rel="stylesheet" href="/cinetune/theme.css?v=6"><main class="app ${esc(state.route)}"><header class="top">${backButton ? '<button class="back" data-back>‹</button>' : ""}<div><div class="eyebrow">CineTune · Live</div><h1>${esc(title)}</h1></div></header>${body}</main>${mini()}${tabs ? nav() : ""}`;
  }
  function home() {
    const featured = state.tracks[0];
    const hero = `<section class="hero"><div class="hero-copy"><span class="eyebrow">CineTune · Nhạc Việt</span><h2>Chạm vào âm nhạc<br>đang được yêu thích.</h2><p>Giai điệu mới, bảng xếp hạng và những bài hát dành cho bạn.</p><div class="hero-actions">${featured ? `<button class="primary" data-play="${esc(trackId(featured))}">▶ Phát bài nổi bật</button>` : ""}<button class="ghost" data-nav="charts">Xem BXH ↗</button></div></div>${featured ? `<img class="hero-art" src="${esc(art(featured, true))}" alt="">` : ""}</section>`;
    const top = state.tracks.slice(0, 3).map((track, index) => `<button class="top-card" data-play="${esc(trackId(track))}"><div class="top-cover"><img src="${esc(art(track, true))}" alt=""><b>#${index + 1}</b></div><strong>${esc(track.title)}</strong><span>${esc(artist(track))}</span></button>`).join("");
    const releases = state.releaseTracks.slice(0, 6).map((track) => `<button class="release-card" data-play="${esc(trackId(track))}" data-source="new"><img src="${esc(art(track))}" alt=""><span><strong>${esc(track.title)}</strong><small>${esc(artist(track))}</small></span><b>▶</b></button>`).join("");
    const recent = state.history.slice(0, 3).map(item).join("");
    return page("Khám phá", `${hero}${state.loading ? '<div class="empty">Đang tải nhạc…</div>' : state.error ? `<div class="empty">${esc(state.error)}</div>` : `<div class="section-heading"><div><span class="eyebrow">Thịnh hành hôm nay</span><h2>Top 3 nổi bật</h2></div><button class="text-link" data-nav="charts">Xem tất cả</button></div><div class="top-grid">${top}</div>${chartVisual(true)}<div class="section-heading"><div><span class="eyebrow">Vừa lên sóng</span><h2>Nhạc mới</h2></div><button class="text-link" data-action="open-new">Xem tất cả</button></div><div class="release-grid">${releases || '<div class="empty">Đang tải nhạc mới…</div>'}</div>${recent ? `<div class="section-heading"><div><span class="eyebrow">Dành cho bạn</span><h2>Nghe gần đây</h2></div></div>${recent}` : ""}`}`);
  }
  function charts() {
    const tabs = `<div class="chart-tabs"><button data-chart-mode="chart" class="${state.chartMode === "chart" ? "selected" : ""}">#zingchart</button><button data-chart-mode="new" class="${state.chartMode === "new" ? "selected" : ""}">Nhạc mới</button><button data-chart-mode="top100" class="${state.chartMode === "top100" ? "selected" : ""}">Top 100</button></div>`;
    if (state.chartMode === "chart") {
      const list = state.loading ? '<div class="empty">Đang tải bảng xếp hạng…</div>' : state.error ? `<div class="empty">${esc(state.error)}</div>` : state.tracks.map((track, index) => { const movement = Number(track.rakingStatus) || 0; return `<div class="ranked"><span class="rank-wrap"><b class="rank">${index + 1}</b><small class="rank-change ${movement > 0 ? "up" : movement < 0 ? "down" : ""}">${movement > 0 ? `↑${movement}` : movement < 0 ? `↓${Math.abs(movement)}` : "—"}</small></span>${item(track)}</div>`; }).join("");
      return page("Bảng xếp hạng", `${tabs}${chartVisual()}<div class="section-heading"><div><span class="eyebrow">Cập nhật liên tục</span><h2>Top 100 bài hát</h2></div><button class="pill-action" data-play-all="chart">▶ Phát tất cả</button></div>${list}`);
    }
    if (state.chartMode === "new") {
      const list = state.releaseLoading ? '<div class="empty">Đang tải nhạc mới…</div>' : state.releaseError ? `<button class="empty" data-retry-new>${esc(state.releaseError)}</button>` : state.releaseTracks.map((track, index) => `<div class="ranked"><b class="rank">${index + 1}</b>${item(track)}</div>`).join("");
      return page("Nhạc mới", `${tabs}<div class="section-heading"><div><span class="eyebrow">Vừa phát hành</span><h2>BXH nhạc mới</h2></div><button class="pill-action" data-play-all="new">▶ Phát tất cả</button></div>${list}`);
    }
    if (state.playlistId) return page("Top 100", `${tabs}<button class="playlist-back" data-playlist-back>‹ Tất cả tuyển tập</button><div class="section-heading"><div><span class="eyebrow">Tuyển tập</span><h2>${esc(state.playlistTitle || "Đang tải…")}</h2></div><button class="pill-action" data-play-all="playlist">▶ Phát tất cả</button></div>${state.playlistLoading ? '<div class="empty">Đang tải bài hát…</div>' : state.topError ? `<div class="empty">${esc(state.topError)}</div>` : state.playlistTracks.map((track, index) => `<div class="ranked"><b class="rank">${index + 1}</b>${item(track)}</div>`).join("")}`);
    const groups = state.topSections.map((section) => `<section><div class="head"><h2>${esc(section.title)}</h2><span>${section.items?.length || 0} tuyển tập</span></div><div class="playlist-grid">${(section.items || []).map((playlist) => `<button class="playlist-card" data-playlist="${esc(trackId(playlist))}"><img src="${esc(art(playlist))}" alt="" loading="lazy"><span>${esc(playlist.title)}</span></button>`).join("")}</div></section>`).join("");
    return page("Top 100", `${tabs}${state.topLoading ? '<div class="empty">Đang tải Top 100…</div>' : state.topError ? `<button class="empty" data-retry-top>${esc(state.topError)}</button>` : groups}`);
  }
  function searchPage() { return page("Tìm kiếm", `<input class="search" id="query" value="${esc(state.query)}" placeholder="Tìm bài hát, nghệ sĩ hoặc thể loại" autofocus><p class="note" id="search-note">${state.query ? `Kết quả cho “${esc(state.query)}”` : "Gợi ý nhạc thịnh hành"}</p><section id="search-results">${searchMarkup()}</section>`); }
  function song() { const track = state.current || state.tracks[0]; if (!track) return page("Chi tiết bài hát", '<div class="empty">Đang tải bài hát…</div>', { backButton: true }); const id = trackId(track); return page("Chi tiết bài hát", `<div class="art-frame"><img class="art" src="${esc(art(track, true))}" alt="Bìa ${esc(track.title)}"></div><section class="center"><h2>${esc(track.title)}</h2><p class="artist-links">${artistLinks(track)}</p><p class="note">${duration(track.duration)}</p></section><div class="actions"><button class="primary" data-play="${esc(id)}">▶ Phát bài hát</button><button class="secondary" data-favorite="${esc(id)}">${state.favorites.has(id) ? "♥ Đã thích" : "♡ Yêu thích"}</button></div>`, { backButton: true }); }
  function player() {
    const track = state.current || state.tracks[0];
    if (!track) return page("Trình phát", '<div class="empty">Đang tải trình phát…</div>', { backButton: true, tabs: false });
    const id = trackId(track);
    const total = playbackDuration();
    const pct = total ? Math.min(100, playbackPosition() / total * 100) : 0;
    const list = state.queue.length ? state.queue : state.tracks;
    const index = list.findIndex((item) => trackId(item) === id);
    const upcoming = list.length > 1 ? Array.from({ length: Math.min(3, list.length - 1) }, (_, offset) => list[(index + offset + 1 + list.length) % list.length]) : [];
    const repeat = { all: ["↻", "Lặp danh sách"], one: ["↻₁", "Lặp một bài"], off: ["↻", "Không lặp"] }[state.repeatMode] || ["↻", "Lặp danh sách"];
    const sleepOptions = state.showSleepOptions ? `<div class="sleep-options">${[[0, "Tắt"], [15, "15 phút"], [30, "30 phút"], [60, "60 phút"]].map(([minutes, label]) => `<button data-sleep="${minutes}" class="${(state.sleepUntil > 0 && Math.ceil((state.sleepUntil - Date.now()) / 60000) === minutes) || (!state.sleepUntil && minutes === 0) ? "selected" : ""}">${label}</button>`).join("")}</div>` : "";
    return page("Trình phát", `<div class="art-frame"><img class="art" src="${esc(art(track, true))}" alt="Bìa ${esc(track.title)}"></div><section class="center"><h2>${esc(track.title)}</h2><p class="artist-links">${artistLinks(track)}</p></section>${state.playbackError ? `<div class="card" role="alert"><p>${esc(state.playbackError)}</p><a href="${esc(officialUrl(track))}" target="_blank" rel="noopener noreferrer">Nghe bài này trên Zing MP3 ↗</a></div>` : ""}<input class="seek" id="seek" type="range" min="0" max="1000" value="${Math.round(pct * 10)}" aria-label="Tua bài hát" style="--played:${pct}%"><div class="time"><span id="elapsed">${duration(Math.floor(playbackPosition()))}</span><span id="total">${duration(Math.floor(total || 0))}</span></div><div class="controls"><button data-action="previous" aria-label="Bài trước">‹‹</button><button class="main" data-action="toggle" aria-label="${state.playing ? "Tạm dừng" : "Phát"}">${state.playing ? "Ⅱ" : "▶"}</button><button data-action="next" aria-label="Bài tiếp">››</button></div><div class="player-tools"><button data-action="shuffle" class="${state.shuffle ? "selected" : ""}" aria-label="Phát ngẫu nhiên"><b>⤨</b><span>Ngẫu nhiên</span></button><button data-action="repeat" class="${state.repeatMode !== "off" ? "selected" : ""}" aria-label="${repeat[1]}"><b>${repeat[0]}</b><span>${repeat[1]}</span></button><button data-action="sleep-panel" class="${state.sleepUntil ? "selected" : ""}" aria-label="Hẹn giờ dừng nhạc"><b>◷</b><span id="sleep-status">Hẹn giờ · ${sleepLabel()}</span></button></div>${sleepOptions}<div class="actions"><button class="secondary" data-favorite="${esc(id)}">${state.favorites.has(id) ? "♥" : "♡"}</button></div>${upcoming.length ? `<div class="head"><h2>Phát tiếp</h2><button class="text-link" data-nav="queue">Xem hàng chờ · ${list.length} bài</button></div>${upcoming.map(item).join("")}` : ""}`, { backButton: true, tabs: false });
  }
  function library() {
    const favorites = allTracks().filter((track, index, list) => state.favorites.has(trackId(track)) && list.findIndex((entry) => trackId(entry) === trackId(track)) === index);
    const playlists = state.myPlaylists.map((list) => `<button class="personal-list" data-my-list="${esc(list.id)}"><span class="list-icon">♫</span><span><strong>${esc(list.name)}</strong><small>${list.tracks.length} bài hát</small></span><b>›</b></button>`).join("");
    return page("Thư viện", `<div class="section-heading"><div><span class="eyebrow">Bộ sưu tập</span><h2>Playlist của bạn</h2></div></div><form class="inline-create" data-create-playlist><input name="name" maxlength="60" required placeholder="Tên playlist mới"><button type="submit">＋ Tạo</button></form>${playlists || '<div class="empty">Tạo playlist để lưu các bài hát theo ý bạn.</div>'}<div class="section-heading"><div><span class="eyebrow">Đã lưu</span><h2>Bài hát yêu thích</h2></div><span>${favorites.length} bài</span></div>${favorites.length ? favorites.map(item).join("") : '<div class="empty">Chạm ♡ trên bài hát để lưu tại đây.</div>'}`);
  }
  function myPlaylist() {
    const list = selectedList(); if (!list) return page("Playlist", '<div class="empty">Playlist không còn tồn tại.</div>', { backButton: true });
    return page(list.name, `<section class="list-hero"><span class="list-icon">♫</span><div><span class="eyebrow">Playlist của bạn</span><h2>${esc(list.name)}</h2><p>${list.tracks.length} bài hát · lưu trên thiết bị</p></div></section><div class="list-actions"><button data-play-my-list="${esc(list.id)}">▶ Phát danh sách</button><button data-shuffle-my-list="${esc(list.id)}">⤨ Phát ngẫu nhiên</button><button data-delete-list="${esc(list.id)}">Xóa playlist</button></div>${state.deletingPlaylistId === list.id ? `<div class="delete-confirm"><span>Xóa playlist “${esc(list.name)}”?</span><button data-confirm-delete="${esc(list.id)}">Xóa</button><button data-cancel-delete>Hủy</button></div>` : ""}${list.tracks.length ? list.tracks.map((track, index) => `<div class="editable-track"><b>${index + 1}</b>${item(track)}<button data-move-list="${index}:-1" aria-label="Đưa lên">↑</button><button data-move-list="${index}:1" aria-label="Đưa xuống">↓</button><button data-remove-list="${esc(trackId(track))}" aria-label="Bỏ khỏi playlist">×</button></div>`).join("") : '<div class="empty">Chạm ＋ cạnh bài hát để thêm vào playlist này.</div>'}`, { backButton: true });
  }
  function queuePage() {
    const list = state.queue.length ? state.queue : state.tracks;
    return page("Hàng chờ phát", `<section class="list-hero"><span class="list-icon">≡</span><div><span class="eyebrow">Thứ tự phát</span><h2>Hàng chờ của bạn</h2><p>${list.length} bài hát · sắp xếp bằng nút lên xuống</p></div></section><div class="list-actions"><button data-action="queue-shuffle">⤨ Xáo trộn thứ tự</button><button data-action="queue-reset">↻ Đặt lại</button></div>${list.map((track, index) => `<div class="editable-track ${trackId(track) === trackId(state.current) ? "is-current" : ""}"><b>${index + 1}</b>${item(track)}<button data-move-queue="${index}:-1" aria-label="Đưa lên">↑</button><button data-move-queue="${index}:1" aria-label="Đưa xuống">↓</button></div>`).join("")}`, { backButton: true });
  }
  function artistPage() {
    const person = state.artistData;
    const name = person?.name || state.artistAlias;
    return page("Nghệ sĩ", `${person ? `<section class="artist-hero"><img src="${esc(person.thumbnailM || person.thumbnail || "")}" alt=""><div><span class="eyebrow">Nghệ sĩ</span><h2>${esc(name)}</h2><p>${state.artistTracks.length} bài hát</p></div></section>` : `<div class="empty">${state.artistLoading ? "Đang tải nghệ sĩ…" : esc(state.artistError)}</div>`}${state.artistTracks.length ? `<div class="section-heading"><div><span class="eyebrow">Khám phá</span><h2>Bài hát của ${esc(name)}</h2></div><button class="pill-action" data-play-artist>▶ Phát</button></div>${state.artistTracks.map(item).join("")}${state.artistHasMore ? '<button class="load-more" data-more-artist>Xem thêm bài hát</button>' : ""}` : ""}${state.artistError && person ? `<button class="load-more" data-more-artist>${esc(state.artistError)}</button>` : ""}`, { backButton: true });
  }
  function profile() {
    const stats = `<div class="profile-stats"><div><strong>${state.myPlaylists.length}</strong><span>Playlist</span></div><div><strong>${state.favorites.size}</strong><span>Yêu thích</span></div><div><strong>${state.history.length}</strong><span>Đã nghe</span></div></div>`;
    const recent = state.history.slice(0, 8).map(item).join("");
    return page("Cá nhân", `<section class="hero profile-hero"><div class="eyebrow">Không gian âm nhạc</div><h2>Giai điệu của bạn</h2><p>Playlist, bài đã thích và lịch sử nghe trên thiết bị này.</p></section>${stats}<div class="profile-shortcuts"><button data-nav="library"><b>♫</b><span>Playlist & yêu thích</span><i>›</i></button><button data-nav="queue"><b>≡</b><span>Hàng chờ phát</span><i>›</i></button><button data-action="sleep-panel" data-nav="player"><b>◷</b><span>Hẹn giờ nghe</span><i>›</i></button></div><div class="section-heading"><div><span class="eyebrow">Nhật ký</span><h2>Nghe gần đây</h2></div><button class="text-link" data-clear-history>Xóa</button></div>${recent || '<div class="empty">Các bài đã phát sẽ xuất hiện ở đây.</div>'}<p class="note">Dữ liệu cá nhân được lưu trên thiết bị của bạn.</p>`);
  }
  function lyrics() { const track = state.current || state.tracks[0]; const lines = state.lyricLines.map((line, index) => `<p data-lyric-index="${index}" data-time="${line.time}">${esc(line.text)}</p>`).join(""); return page("Lời bài hát", `<section class="center"><h2>${esc(track?.title || "Đang tải")}</h2><p>${esc(artist(track))}</p></section><div class="lyrics" id="lyric-lines">${state.lyricLoading ? '<p>Đang tải lời bài hát…</p>' : state.lyricError ? `<p>${esc(state.lyricError)}</p>` : lines}</div>`, { backButton: true, tabs: false }); }
  function render(doc) {
    if (!doc?.body) return;
    const view = { home, search: searchPage, charts, song, player, library, profile, lyrics, artist: artistPage, "my-playlist": myPlaylist, queue: queuePage }[state.route] || home;
    const markup = view();
    if (!doc.querySelector("#cinetune-base")) {
      const style = doc.createElement("style");
      style.id = "cinetune-base";
      style.textContent = markup.match(/^<style>([\s\S]*?)<\/style>/)?.[1] || "";
      doc.head.append(style);
      const theme = doc.createElement("link");
      theme.rel = "stylesheet";
      theme.href = "/cinetune/theme.css?v=6";
      doc.head.append(theme);
      doc.documentElement.style.background = "#0b1020";
      doc.body.style.background = "#0b1020";
    }
    doc.body.innerHTML = markup.replace(/^<style>[\s\S]*?<\/style><link[^>]*>/, "") + playlistPicker();
    doc.querySelectorAll("[data-create-playlist]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); createPlaylist(new FormData(event.target).get("name") || "", state.addingTrackId); }));
    doc.querySelector("#query")?.addEventListener("input", (event) => search(event.target.value));
    doc.querySelector("#seek")?.addEventListener("input", (event) => { const total = playbackDuration(); if (total) { const position = total * Number(event.target.value) / 1000; if (nativePlayback) { nativePosition = position; nativeCommand("seek", Math.round(position * 1000)); } else audio.currentTime = position; } syncProgress(); });
  }
  function syncProgress() { if (state.route !== "player") return; const doc = frame.contentDocument; const seek = doc?.querySelector("#seek"); const total = playbackDuration(); if (seek && total) { const played = Math.min(100, playbackPosition() / total * 100); seek.value = String(Math.round(played * 10)); seek.style.setProperty("--played", `${played}%`); } const elapsed = doc?.querySelector("#elapsed"); if (elapsed) elapsed.textContent = duration(Math.floor(playbackPosition())); const totalLabel = doc?.querySelector("#total"); if (totalLabel && total) totalLabel.textContent = duration(Math.floor(total)); const sleep = doc?.querySelector("#sleep-status"); if (sleep) sleep.textContent = `Hẹn giờ · ${sleepLabel()}`; }
  function bindSwipe(doc) {
    let start = null;
    const finish = (origin, dx, dy) => {
      if (state.route !== origin || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (origin === "player" && dx > 0) go("lyrics");
      if (origin === "lyrics" && dx < 0) go("player");
    };
    doc.addEventListener("pointerdown", (event) => {
      if (!["player", "lyrics"].includes(state.route) || !event.isPrimary || event.target.closest?.("button, input, a, [role=button]")) { start = null; return; }
      start = { x: event.clientX, y: event.clientY, id: event.pointerId, route: state.route };
    });
    doc.addEventListener("pointerup", (event) => {
      if (!start || event.pointerId !== start.id || state.route !== start.route) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const origin = start.route;
      start = null;
      finish(origin, dx, dy);
    });
    doc.addEventListener("pointercancel", () => { start = null; });
    let touchStart = null;
    doc.addEventListener("touchstart", (event) => {
      if (!["player", "lyrics"].includes(state.route) || event.touches.length !== 1 || event.target.closest?.("button, input, a, [role=button]")) { touchStart = null; return; }
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, route: state.route };
    }, { passive: true });
    doc.addEventListener("touchend", (event) => {
      if (!touchStart || event.changedTouches.length !== 1) return;
      finish(touchStart.route, event.changedTouches[0].clientX - touchStart.x, event.changedTouches[0].clientY - touchStart.y);
      touchStart = null;
    }, { passive: true });
    doc.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
  }
  function click(event) {
    const target = event.target.closest("[data-nav],[data-play],[data-play-all],[data-favorite],[data-action],[data-back],[data-chart-mode],[data-chart-hour],[data-playlist],[data-playlist-back],[data-retry-top],[data-retry-new],[data-sleep],[data-artist],[data-add-track],[data-add-to-list],[data-close-picker],[data-my-list],[data-play-my-list],[data-shuffle-my-list],[data-delete-list],[data-confirm-delete],[data-cancel-delete],[data-remove-list],[data-move-list],[data-move-queue],[data-play-artist],[data-more-artist],[data-clear-history]");
    if (!target) return;
    event.preventDefault();
    if (target.dataset.back !== undefined) return back();
    if (target.dataset.artist) return openArtist(target.dataset.artist);
    if (target.dataset.addTrack) { state.addingTrackId = target.dataset.addTrack; return repaint(); }
    if (target.dataset.closePicker !== undefined && (target === event.target || target.tagName === "BUTTON")) { state.addingTrackId = ""; return repaint(); }
    if (target.dataset.addToList) return addToPlaylist(target.dataset.addToList, state.addingTrackId);
    if (target.dataset.myList) { state.selectedPlaylist = target.dataset.myList; localStorage.setItem("cinetune-selected-playlist", state.selectedPlaylist); return go("my-playlist"); }
    if (target.dataset.playMyList || target.dataset.shuffleMyList) {
      const list = state.myPlaylists.find((entry) => entry.id === (target.dataset.playMyList || target.dataset.shuffleMyList));
      if (!list?.tracks.length) return;
      const randomStart = Boolean(target.dataset.shuffleMyList);
      if (randomStart) { state.shuffle = true; localStorage.setItem("cinetune-shuffle", "true"); }
      const recent = new Set(state.history.slice(0, 12).map(trackId));
      const fresh = list.tracks.filter((track) => !recent.has(trackId(track)));
      const candidates = fresh.length ? fresh : list.tracks;
      const start = randomStart ? candidates[Math.floor(Math.random() * candidates.length)] : list.tracks[0];
      setQueue(list.tracks, trackId(start));
      go("player"); return play(trackId(start));
    }
    if (target.dataset.deleteList) { state.deletingPlaylistId = target.dataset.deleteList; return repaint(); }
    if (target.dataset.cancelDelete !== undefined) { state.deletingPlaylistId = ""; return repaint(); }
    if (target.dataset.confirmDelete) { state.myPlaylists = state.myPlaylists.filter((entry) => entry.id !== target.dataset.confirmDelete); state.selectedPlaylist = ""; state.deletingPlaylistId = ""; localStorage.removeItem("cinetune-selected-playlist"); save(); return go("library"); }
    if (target.dataset.removeList) { const list = selectedList(); if (list) { list.tracks = list.tracks.filter((entry) => trackId(entry) !== target.dataset.removeList); save(); repaint(); } return; }
    if (target.dataset.moveList || target.dataset.moveQueue) {
      const [index, direction] = (target.dataset.moveList || target.dataset.moveQueue).split(":").map(Number);
      const list = target.dataset.moveList ? selectedList()?.tracks : state.queue;
      const next = index + direction;
      if (list && next >= 0 && next < list.length) { [list[index], list[next]] = [list[next], list[index]]; save(); if (target.dataset.moveQueue && nativePlayback) nativeCommand("updateQueue", JSON.stringify({ tracks: state.queue.map(nativeTrack), repeat: state.repeatMode })); repaint(); }
      return;
    }
    if (target.dataset.playArtist !== undefined && state.artistTracks.length) { setQueue(state.artistTracks); go("player"); return play(trackId(state.queue[0])); }
    if (target.dataset.moreArtist !== undefined) return loadArtistSongs(state.artistPage + 1);
    if (target.dataset.clearHistory !== undefined) { state.history = []; save(); return repaint(); }
    if (target.dataset.chartHour !== undefined) { state.chartHour = Number(target.dataset.chartHour); return repaint(); }
    if (target.dataset.chartMode) {
      state.chartMode = target.dataset.chartMode; state.playlistId = ""; state.topError = ""; repaint();
      if (state.chartMode === "top100") loadTop100();
      if (state.chartMode === "new") loadNewRelease();
      return;
    }
    if (target.dataset.playlist) return openPlaylist(target.dataset.playlist);
    if (target.dataset.playlistBack !== undefined) { state.playlistId = ""; state.playlistTracks = []; state.topError = ""; return repaint(); }
    if (target.dataset.retryTop !== undefined) { state.topError = ""; return loadTop100(); }
    if (target.dataset.retryNew !== undefined) { state.releaseError = ""; return loadNewRelease(); }
    if (target.dataset.sleep !== undefined) { state.showSleepOptions = false; return setSleepTimer(Number(target.dataset.sleep)); }
    if (target.dataset.playAll) {
      const list = target.dataset.playAll === "new" ? state.releaseTracks : target.dataset.playAll === "playlist" ? state.playlistTracks : state.tracks;
      if (!list.length) return;
      setQueue(list, trackId(list[0])); go("player"); return play(trackId(state.queue[0]));
    }
    if (target.dataset.nav) {
      if (target.dataset.action === "sleep-panel") state.showSleepOptions = true;
      if (target.dataset.track) {
        const track = allTracks().find((item) => trackId(item) === target.dataset.track);
        if (track) { state.current = track; state.lyricId = null; setQueue(queueForRoute(), target.dataset.track); }
      }
      return go(target.dataset.nav);
    }
    if (target.dataset.play) {
      if (state.route !== "player" && state.route !== "song" && state.route !== "queue") setQueue(target.dataset.source === "new" ? state.releaseTracks : queueForRoute(), target.dataset.play);
      go("player"); return play(target.dataset.play);
    }
    if (target.dataset.favorite) return favorite(target.dataset.favorite);
    if (target.dataset.action === "open-new") { state.chartMode = "new"; go("charts"); return loadNewRelease(); }
    if (target.dataset.action === "dismiss") { miniDismissed = true; return repaint(); }
    if (target.dataset.action === "shuffle") return toggleShuffle();
    if (target.dataset.action === "queue-shuffle") { state.shuffle = true; localStorage.setItem("cinetune-shuffle", "true"); shuffleQueue(); return repaint(); }
    if (target.dataset.action === "queue-reset") { setQueue(state.tracks); return repaint(); }
    if (target.dataset.action === "repeat") return setRepeatMode();
    if (target.dataset.action === "sleep-panel") { state.showSleepOptions = !state.showSleepOptions; return repaint(); }
    if (target.dataset.action === "toggle") return toggle();
    if (target.dataset.action === "next") return advance(1);
    if (target.dataset.action === "previous") return advance(-1);
  }
  function load() { state.route = route(); frame.setAttribute("aria-busy", "false"); repaint(); if (state.route.startsWith("lyrics")) loadLyrics(); if (state.route === "charts" && state.chartMode === "top100") loadTop100(); if (state.route === "home" || (state.route === "charts" && state.chartMode === "new")) loadNewRelease(); if (state.route === "artist" && state.artistAlias && !state.artistData && !state.artistLoading) openArtist(state.artistAlias); }
  frame.addEventListener("load", () => { frame.setAttribute("aria-busy", "false"); const doc = frame.contentDocument; render(doc); doc?.addEventListener("click", click, true); if (doc) bindSwipe(doc); });
  audio.addEventListener("play", () => { state.playing = true; repaint(); }); audio.addEventListener("pause", () => { state.playing = false; repaint(); }); audio.addEventListener("ended", () => advance(1, true));
  audio.addEventListener("timeupdate", () => { stopForSleep(); syncProgress(); syncLyrics(); });
  document.addEventListener("visibilitychange", stopForSleep);
  audio.addEventListener("loadedmetadata", syncProgress);
  window.addEventListener("hashchange", load); if (!location.hash) location.hash = "home"; else load(); frame.srcdoc = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;background:#0b1020;color:#f7f8fd}</style></head><body></body></html>'; connectVietnam(); loadTrending(); if (nativePlayback) { syncNativePlayback(); setInterval(syncNativePlayback, 700); }
})();
