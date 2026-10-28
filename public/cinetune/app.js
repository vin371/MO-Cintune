(() => {
  const routes = { home: "trang_ch_cinetune/code.html", search: "t_m_ki_m_cinetune/code.html", charts: "charts", song: "chi_ti_t_b_i_h_t_cinetune/code.html", player: "tr_nh_ph_t_nh_c_cinetune/code.html", library: "th_vi_n_cinetune/code.html", profile: "c_nh_n_cinetune/code.html", lyrics: "l_i_b_i_h_t_cinetune_1/code.html", "lyrics-karaoke": "l_i_b_i_h_t_cinetune_2/code.html" };
  let api = "";
  let vietnamConnection;
  const frame = document.querySelector("#screen");
  const audio = new Audio();
  const state = { route: "", tracks: [], results: [], query: "", current: null, playing: false, loading: true, error: "", playbackError: "", chartMode: "chart", topSections: [], topLoading: false, topError: "", playlistId: "", playlistTitle: "", playlistTracks: [], playlistLoading: false, queue: [], lyricId: null, lyricLines: [], lyricLoading: false, lyricError: "", favorites: new Set(JSON.parse(localStorage.getItem("cinetune-favorites") || "[]")), history: JSON.parse(localStorage.getItem("cinetune-history") || "[]") };
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const art = (track, large = false) => { const url = track?.thumbnailM || track?.thumbnail || ""; return large ? url.replace(/\/w(?:94|240)_/, "/w600_") : url; };
  const artist = (track) => track?.artistsNames || "Nghệ sĩ";
  const officialUrl = (track) => track?.link?.startsWith("/") ? `https://zingmp3.vn${track.link}` : "https://zingmp3.vn/";
  const trackId = (track) => track?.encodeId || track?.id;
  const duration = (seconds) => `${Math.floor((Number(seconds) || 0) / 60)}:${String((Number(seconds) || 0) % 60).padStart(2, "0")}`;
  const route = () => Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : "home";
  const allTracks = () => [...state.tracks, ...state.results, ...state.playlistTracks, ...state.history];
  const save = () => { localStorage.setItem("cinetune-favorites", JSON.stringify([...state.favorites])); localStorage.setItem("cinetune-history", JSON.stringify(state.history.slice(0, 20))); };
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
    try { const payload = await get("/api/chart-home"); state.tracks = payload?.data?.RTChart?.items || []; if (!state.current) state.current = state.tracks[0]; }
    catch (error) { state.error = "Chưa tải được danh sách bài hát. Hãy thử lại sau."; }
    finally { state.loading = false; repaint(); }
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
  function advance(direction) {
    const list = state.queue.length ? state.queue : state.tracks;
    if (!list.length) { state.playing = false; repaint(); return; }
    const index = list.findIndex((track) => trackId(track) === trackId(state.current));
    play(trackId(list[(index + direction + list.length) % list.length]));
  }
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
    if ((!state.current && state.tracks[0]) || (state.current && !audio.src)) return play(trackId(state.current || state.tracks[0]));
    if (audio.paused) { await audio.play(); state.playing = true; } else { audio.pause(); state.playing = false; }
    repaint();
  }
  function favorite(id) { state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id); save(); repaint(); }

  function item(track) {
    const id = trackId(track), liked = state.favorites.has(id);
    return `<article class="track"><img src="${esc(art(track))}" alt="" loading="lazy"><button class="copy" data-nav="song" data-track="${esc(id)}"><strong>${esc(track.title)}</strong><span>${esc(artist(track))}</span></button><button class="round" data-play="${esc(id)}">▶</button><button class="heart" data-favorite="${esc(id)}">${liked ? "♥" : "♡"}</button></article>`;
  }
  function nav() {
    return `<nav>${[["home", "⌂", "Trang chủ"], ["search", "⌕", "Tìm kiếm"], ["charts", "▥", "BXH"], ["library", "♫", "Thư viện"], ["profile", "◉", "Cá nhân"]].map(([key, icon, label]) => `<button data-nav="${key}" class="${state.route === key ? "active" : ""}"><b>${icon}</b>${label}</button>`).join("")}</nav>`;
  }
  let miniDismissed = false;
  function mini() {
    if (!state.current || miniDismissed || !["home", "search", "charts", "library", "profile"].includes(state.route) || !audio.src) return "";
    return `<div class="mini"><button class="mini-open" data-nav="player"><img src="${esc(art(state.current))}" alt=""><span><strong>${esc(state.current.title)}</strong><small>${esc(artist(state.current))}</small></span></button><button class="mini-toggle" data-action="toggle" aria-label="${state.playing ? "Tạm dừng" : "Tiếp tục"}">${state.playing ? "Ⅱ" : "▶"}</button><button class="mini-close" data-action="dismiss" aria-label="Đóng thanh nhạc">×</button></div>`;
  }
  function page(title, body, options = {}) {
    const { backButton = false, tabs = true } = options;
    return `<style>*{box-sizing:border-box}body{margin:0;background:#f8f9ff;color:#121c2a;font-family:Inter,system-ui,sans-serif}.app{min-height:100dvh;padding:18px 16px 150px}button{font:inherit;cursor:pointer}.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top h1{margin:0;font-size:21px;letter-spacing:-.03em}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#4169e1}.back,.round{border:0;background:#e6eeff;color:#214fc7}.back{width:40px;height:40px;border-radius:50%;font-size:24px}.hero{padding:20px;border-radius:22px;color:white;background:linear-gradient(135deg,#214fc7,#7161e3);box-shadow:0 16px 32px #214fc73b}.hero h2{font-size:26px;line-height:1.1;margin:6px 0}.hero p{font-size:14px;opacity:.84;margin:0}.head{display:flex;justify-content:space-between;align-items:end;margin:24px 0 10px}.head h2{margin:0;font-size:17px}.head span,.note{color:#747685;font-size:12px}.track{display:grid;grid-template-columns:54px 1fr 39px 32px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #e6eeff}.track img{width:54px;height:54px;object-fit:cover;border-radius:13px;background:#e6eeff}.copy{background:transparent;border:0;padding:0;text-align:left;min-width:0;color:#121c2a}.copy strong,.copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy strong{font-size:14px}.copy span{font-size:12px;color:#747685;margin-top:4px}.round{width:38px;height:38px;border-radius:50%;font-weight:800}.heart{border:0;background:transparent;color:#5846c8;font-size:21px}.empty{padding:30px 18px;border-radius:18px;background:#eef3ff;text-align:center;color:#747685}.search{width:100%;padding:15px 16px;border:0;border-radius:16px;background:#fff;box-shadow:0 4px 18px #121c2a12;font-size:15px;outline-color:#4169e1}.art{width:100%;aspect-ratio:1;object-fit:cover;border-radius:26px;box-shadow:0 20px 36px #121c2a33}.center{text-align:center;margin:22px 0}.center h2{margin:0 0 8px;font-size:25px}.center p{margin:0;color:#747685}.actions{display:flex;gap:10px}.primary,.secondary{flex:1;border:0;padding:14px;border-radius:14px;font-weight:800}.primary{background:#214fc7;color:#fff}.secondary{background:#e6eeff;color:#214fc7}.card{padding:18px;background:#fff;border-radius:18px;box-shadow:0 4px 18px #121c2a0d;margin:12px 0}.card strong{display:block;color:#214fc7;font-size:23px}.time{display:flex;justify-content:space-between;color:#747685;font-size:12px}.controls{display:flex;justify-content:center;align-items:center;gap:22px;margin:28px 0}.controls button{border:0;background:transparent;color:#214fc7;font-size:25px}.controls .main{width:68px;height:68px;border-radius:50%;background:#214fc7;color:#fff}nav{position:fixed;bottom:0;left:0;right:0;height:72px;padding-bottom:env(safe-area-inset-bottom);display:flex;background:#fffffff5;box-shadow:0 -3px 18px #121c2a12}nav button{width:20%;border:0;background:transparent;color:#747685;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:11px}nav b{font-size:22px;line-height:20px}nav .active{color:#214fc7;font-weight:800}.mini{position:fixed;bottom:82px;left:16px;right:16px;z-index:2;display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e6eeff;border-radius:18px;background:#fff;box-shadow:0 10px 30px #121c2a24;color:#121c2a;text-align:left}.mini-open{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0;border:0;background:transparent;text-align:left}.mini img{width:44px;height:44px;object-fit:cover;border-radius:12px}.mini span{min-width:0;flex:1}.mini strong,.mini small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini strong{font-size:13px}.mini small{color:#747685;font-size:11px;margin-top:3px}.mini-toggle,.mini-close{width:34px;height:34px;border:0;border-radius:50%;background:#e6eeff;color:#214fc7;font-size:18px}.mini-close{background:transparent;color:#747685;font-size:25px}.art-frame{max-width:500px;margin:0 auto;aspect-ratio:1;border-radius:24px;overflow:hidden;background:#dfe9fc;box-shadow:0 20px 36px #121c2a25}.art-frame .art{display:block;width:100%;height:100%;border-radius:0;box-shadow:none}.seek{appearance:none;width:100%;height:7px;margin:20px 0 8px;border-radius:99px;background:linear-gradient(to right,#214fc7 var(--played),#d9e3f6 var(--played));cursor:pointer}.seek::-webkit-slider-thumb{appearance:none;width:16px;height:16px;border:3px solid #fff;border-radius:50%;background:#214fc7;box-shadow:0 1px 6px #121c2a55}.seek::-moz-range-thumb{width:12px;height:12px;border:3px solid #fff;border-radius:50%;background:#214fc7}.lyrics{font-size:20px;line-height:1.8;margin:26px 4px}.lyrics p{opacity:.38}.lyrics .active{opacity:1;color:#214fc7;font-weight:800}.karaoke{padding:14px;border-radius:16px;background:#eef3ff;color:#4169e1;font-size:13px}nav{height:calc(72px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom)}.mini{bottom:calc(82px + env(safe-area-inset-bottom))}.app{padding-bottom:calc(150px + env(safe-area-inset-bottom))}.chart-tabs{display:flex;gap:8px;margin:8px 0 14px;padding:5px;border-radius:16px;background:#e6eeff}.chart-tabs button{flex:1;border:0;border-radius:12px;padding:11px 6px;background:transparent;color:#52647c;font-weight:800}.chart-tabs button.selected{background:#fff;color:#214fc7;box-shadow:0 3px 12px #121c2a12}.ranked{display:flex;align-items:center;gap:8px}.ranked .track{flex:1;min-width:0}.rank{width:28px;flex:none;text-align:center;color:#214fc7;font-size:17px}.playlist-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.playlist-card{display:flex;flex-direction:column;gap:9px;padding:8px;border:0;border-radius:16px;background:#fff;color:#121c2a;text-align:left;box-shadow:0 3px 14px #121c2a0c}.playlist-card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:11px}.playlist-card span{font-size:13px;font-weight:700;line-height:1.35}.playlist-back{border:0;background:transparent;color:#214fc7;padding:8px 0;font-weight:700}</style><main class="app"><header class="top">${backButton ? '<button class="back" data-back>‹</button>' : ""}<div><div class="eyebrow">CineTune · Live</div><h1>${esc(title)}</h1></div></header>${body}</main>${mini()}${tabs ? nav() : ""}`;
  }
  function home() { const body = state.loading ? '<div class="empty">Đang tải nhạc từ Zing MP3…</div>' : state.error ? `<div class="empty">${esc(state.error)}</div>` : state.tracks.slice(0, 12).map(item).join(""); return page("Trang chủ", `<section class="hero"><div class="eyebrow" style="color:#dce1ff">Nhạc Việt</div><h2>Khám phá nhạc mới<br>theo thời gian thực.</h2><p>Bảng xếp hạng cập nhật từ Zing MP3.</p></section><div class="head"><h2>Đang thịnh hành</h2><span>${state.tracks.length} bài hát</span></div>${body}`); }
  function charts() {
    const tabs = `<div class="chart-tabs"><button data-chart-mode="chart" class="${state.chartMode === "chart" ? "selected" : ""}">Bảng xếp hạng</button><button data-chart-mode="top100" class="${state.chartMode === "top100" ? "selected" : ""}">Top 100</button></div>`;
    if (state.chartMode === "chart") {
      const list = state.loading ? '<div class="empty">Đang tải bảng xếp hạng…</div>' : state.error ? `<div class="empty">${esc(state.error)}</div>` : state.tracks.map((track, index) => `<div class="ranked"><b class="rank">${index + 1}</b>${item(track)}</div>`).join("");
      return page("Bảng xếp hạng", `${tabs}<p class="note">100 bài hát đang được yêu thích</p>${list}`);
    }
    if (state.playlistId) return page("Top 100", `${tabs}<button class="playlist-back" data-playlist-back>‹ Tất cả tuyển tập</button><div class="head"><h2>${esc(state.playlistTitle || "Đang tải…")}</h2><span>${state.playlistTracks.length} bài</span></div>${state.playlistLoading ? '<div class="empty">Đang tải bài hát…</div>' : state.topError ? `<div class="empty">${esc(state.topError)}</div>` : state.playlistTracks.map((track, index) => `<div class="ranked"><b class="rank">${index + 1}</b>${item(track)}</div>`).join("")}`);
    const groups = state.topSections.map((section) => `<section><div class="head"><h2>${esc(section.title)}</h2><span>${section.items?.length || 0} tuyển tập</span></div><div class="playlist-grid">${(section.items || []).map((playlist) => `<button class="playlist-card" data-playlist="${esc(trackId(playlist))}"><img src="${esc(art(playlist))}" alt="" loading="lazy"><span>${esc(playlist.title)}</span></button>`).join("")}</div></section>`).join("");
    return page("Top 100", `${tabs}${state.topLoading ? '<div class="empty">Đang tải Top 100…</div>' : state.topError ? `<button class="empty" data-retry-top>${esc(state.topError)}</button>` : groups}`);
  }
  function searchPage() { return page("Tìm kiếm", `<input class="search" id="query" value="${esc(state.query)}" placeholder="Tìm bài hát, nghệ sĩ hoặc thể loại" autofocus><p class="note" id="search-note">${state.query ? `Kết quả cho “${esc(state.query)}”` : "Gợi ý nhạc thịnh hành"}</p><section id="search-results">${searchMarkup()}</section>`); }
  function song() { const track = state.current || state.tracks[0]; if (!track) return page("Chi tiết bài hát", '<div class="empty">Đang tải bài hát…</div>', { backButton: true }); const id = trackId(track); return page("Chi tiết bài hát", `<div class="art-frame"><img class="art" src="${esc(art(track, true))}" alt="Bìa ${esc(track.title)}"></div><section class="center"><h2>${esc(track.title)}</h2><p>${esc(artist(track))}</p><p class="note">${duration(track.duration)}</p></section><div class="actions"><button class="primary" data-play="${esc(id)}">▶ Phát bài hát</button><button class="secondary" data-favorite="${esc(id)}">${state.favorites.has(id) ? "♥ Đã thích" : "♡ Yêu thích"}</button></div>`, { backButton: true }); }
  function player() { const track = state.current || state.tracks[0]; if (!track) return page("Trình phát", '<div class="empty">Đang tải trình phát…</div>', { backButton: true, tabs: false }); const id = trackId(track); const total = Number.isFinite(audio.duration) ? audio.duration : track.duration; const pct = total ? Math.min(100, audio.currentTime / total * 100) : 0; return page("Trình phát", `<div class="art-frame"><img class="art" src="${esc(art(track, true))}" alt="Bìa ${esc(track.title)}"></div><section class="center"><h2>${esc(track.title)}</h2><p>${esc(artist(track))}</p></section>${state.playbackError ? `<div class="card" role="alert"><p>${esc(state.playbackError)}</p><a href="${esc(officialUrl(track))}" target="_blank" rel="noopener noreferrer">Nghe bài này trên Zing MP3 ↗</a></div>` : ""}<input class="seek" id="seek" type="range" min="0" max="1000" value="${Math.round(pct * 10)}" aria-label="Tua bài hát" style="--played:${pct}%"><div class="time"><span id="elapsed">${duration(Math.floor(audio.currentTime))}</span><span id="total">${duration(Math.floor(total || 0))}</span></div><div class="controls"><button data-action="previous">‹‹</button><button class="main" data-action="toggle">${state.playing ? "Ⅱ" : "▶"}</button><button data-action="next">››</button></div><div class="actions"><button class="secondary" data-nav="lyrics">Lời bài hát</button><button class="secondary" data-favorite="${esc(id)}">${state.favorites.has(id) ? "♥" : "♡"}</button></div>`, { backButton: true, tabs: false }); }
  function library() { const list = state.tracks.filter((track) => state.favorites.has(trackId(track))).concat(state.history.filter((track) => !state.favorites.has(trackId(track)))); return page("Thư viện", `<div class="card"><strong>${state.favorites.size}</strong> Bài hát yêu thích trên thiết bị này</div><div class="head"><h2>Đã yêu thích & nghe gần đây</h2></div>${list.length ? list.map(item).join("") : '<div class="empty">Chạm ♡ trên một bài hát để tạo thư viện của bạn.</div>'}`); }
  function profile() { return page("Cá nhân", `<section class="hero"><div class="eyebrow" style="color:#dce1ff">Âm nhạc của bạn</div><h2>Chào mừng đến CineTune</h2><p>Nhạc Việt bạn yêu thích, luôn trong tầm tay.</p></section><div class="card"><strong>${state.history.length}</strong> Bài hát trong lịch sử nghe</div><div class="card"><strong>${state.favorites.size}</strong> Bài hát đã lưu</div><p class="note">Danh sách này được lưu trên thiết bị của bạn.</p>`); }
  function lyrics(karaoke) { const track = state.current || state.tracks[0]; const lines = state.lyricLines.map((line, index) => `<p data-lyric-index="${index}" data-time="${line.time}">${esc(line.text)}</p>`).join(""); return page("Lời bài hát", `<section class="center"><h2>${esc(track?.title || "Đang tải")}</h2><p>${esc(artist(track))}</p></section>${karaoke ? '<div class="karaoke">Chế độ karaoke: dòng đang phát được làm nổi bật.</div>' : ""}<div class="lyrics" id="lyric-lines">${state.lyricLoading ? '<p>Đang tải lời bài hát…</p>' : state.lyricError ? `<p>${esc(state.lyricError)}</p>` : lines}</div><button class="secondary" data-nav="${karaoke ? "lyrics" : "lyrics-karaoke"}">${karaoke ? "Tắt karaoke" : "Bật karaoke"}</button>`, { backButton: true, tabs: false }); }
  function render(doc) { if (!doc?.body) return; const view = { home, search: searchPage, charts, song, player, library, profile, lyrics: () => lyrics(false), "lyrics-karaoke": () => lyrics(true) }[state.route]; doc.body.innerHTML = view(); doc.querySelector("#query")?.addEventListener("input", (event) => search(event.target.value)); doc.querySelector("#seek")?.addEventListener("input", (event) => { const total = Number.isFinite(audio.duration) ? audio.duration : state.current?.duration; if (total) audio.currentTime = total * Number(event.target.value) / 1000; syncProgress(); }); }
  function syncProgress() { if (state.route !== "player") return; const doc = frame.contentDocument; const seek = doc?.querySelector("#seek"); const total = Number.isFinite(audio.duration) ? audio.duration : state.current?.duration; if (seek && total) { const played = Math.min(100, audio.currentTime / total * 100); seek.value = String(Math.round(played * 10)); seek.style.setProperty("--played", `${played}%`); } const elapsed = doc?.querySelector("#elapsed"); if (elapsed) elapsed.textContent = duration(Math.floor(audio.currentTime)); const totalLabel = doc?.querySelector("#total"); if (totalLabel && total) totalLabel.textContent = duration(Math.floor(total)); }
  function click(event) { const target = event.target.closest("[data-nav],[data-play],[data-favorite],[data-action],[data-back],[data-chart-mode],[data-playlist],[data-playlist-back],[data-retry-top]"); if (!target) return; event.preventDefault(); if (target.dataset.back !== undefined) return back(); if (target.dataset.chartMode) { state.chartMode = target.dataset.chartMode; state.playlistId = ""; state.topError = ""; repaint(); if (state.chartMode === "top100") loadTop100(); return; } if (target.dataset.playlist) return openPlaylist(target.dataset.playlist); if (target.dataset.playlistBack !== undefined) { state.playlistId = ""; state.playlistTracks = []; state.topError = ""; return repaint(); } if (target.dataset.retryTop !== undefined) { state.topError = ""; return loadTop100(); } if (target.dataset.nav) { if (target.dataset.track) { const track = allTracks().find((item) => trackId(item) === target.dataset.track); if (track) { state.current = track; state.lyricId = null; } } return go(target.dataset.nav); } if (target.dataset.play) { state.queue = state.route === "charts" && state.chartMode === "top100" && state.playlistId ? state.playlistTracks : state.route === "search" && state.query ? state.results : state.tracks; go("player"); return play(target.dataset.play); } if (target.dataset.favorite) return favorite(target.dataset.favorite); if (target.dataset.action === "dismiss") { miniDismissed = true; return repaint(); } if (target.dataset.action === "toggle") return toggle(); if (target.dataset.action === "next") return advance(1); if (target.dataset.action === "previous") return advance(-1); }
  function load() { state.route = route(); frame.setAttribute("aria-busy", "false"); repaint(); if (state.route.startsWith("lyrics")) loadLyrics(); if (state.route === "charts" && state.chartMode === "top100") loadTop100(); }
  frame.addEventListener("load", () => { frame.setAttribute("aria-busy", "false"); const doc = frame.contentDocument; render(doc); doc?.addEventListener("click", click, true); });
  audio.addEventListener("play", () => { state.playing = true; repaint(); }); audio.addEventListener("pause", () => { state.playing = false; repaint(); }); audio.addEventListener("ended", () => advance(1));
  audio.addEventListener("timeupdate", () => { syncProgress(); if (!state.route.startsWith("lyrics")) return; const doc = frame.contentDocument; const index = state.lyricLines.findLastIndex((line) => line.time <= audio.currentTime * 1000); const active = doc?.querySelector(".lyrics .active"); const next = doc?.querySelector(`[data-lyric-index="${index}"]`); if (next && next !== active) { active?.classList.remove("active"); next.classList.add("active"); if (state.route === "lyrics-karaoke") next.scrollIntoView({ block: "center", behavior: "smooth" }); } });
  audio.addEventListener("loadedmetadata", syncProgress);
  window.addEventListener("hashchange", load); if (!location.hash) location.hash = "home"; else load(); frame.src = "about:blank"; connectVietnam(); loadTrending();
})();
