# CineTune CI/CD & Deployment Guide

Tài liệu hướng dẫn hệ thống CI/CD GitHub Actions, quy trình cập nhật tự động **không cần cài lại file APK**, các tính năng mới và công cụ Clean Code / Review Code.

---

## 1. Cơ chế Cập nhật Tự động (Không Cần Cài Lại File APK)

### Vì sao không cần cài lại APK mỗi khi thay đổi code?

1. **Kiến trúc Hybrid Shell:**
   - Ứng dụng Android `CineTune-Android` là một Native Shell với WebView kết nối trực tiếp đến máy chủ web tại:
     `https://cinetune-api.onrender.com/cinetune/#home`
   - Toàn bộ giao diện (UI), tính năng nghe nhạc (Play, Pause, Queue, EQ, Lyrics, Playlist, Tìm kiếm) và proxy ZingMP3 API đều nằm ở phía Web (`public/cinetune/` & `server.js`).
2. **Quy trình Live Update:**
   - Khi bạn chỉnh sửa code và push lên GitHub nhánh `main`:
     - GitHub Actions tự động kích hoạt pipeline kiểm tra chất lượng (Clean Code & Code Review).
     - Kích hoạt triển khai tự động lên Render qua Render Deploy Hook hoặc Git Sync.
     - Sau 1-2 phút, bạn chỉ cần mở lại app CineTune trên điện thoại Android là lập tức thấy giao diện và tính năng mới nhất **100% tự động mà không cần tải hoặc cài lại APK!**
3. **Khi nào mới cần build file APK mới?**
   - Chỉ khi bạn thay đổi mã nguồn Native Java trong `android/` (ví dụ: thay đổi quyền AndroidManifest, đổi Icon launcher app, hoặc nâng cấp Android SDK/Service).
   - Khi đó, workflow `android-build.yml` sẽ tự động build APK mới hoặc bạn có thể kích hoạt bằng tay (`workflow_dispatch`).

---

## 2. Hệ thống GitHub Actions CI/CD

Các workflow được thiết lập trong `.github/workflows/`:

| Workflow                 | File                                  | Mục đích & Thời điểm kích hoạt                                                                                                                       |
| :----------------------- | :------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI & Code Review**     | `.github/workflows/ci.yml`            | Chạy trên mọi `push` và `pull_request`: Kiểm tra cú pháp, Unit Tests, ESLint, Prettier và chấm điểm Clean Code Score tự động xuất ra GitHub Summary. |
| **Live Web CD**          | `.github/workflows/deploy.yml`        | Chạy khi `push` vào nhánh `main`: Kích hoạt Render Deploy Hook để cập nhật web live ngay lập tức.                                                    |
| **Native Android Build** | `.github/workflows/android-build.yml` | Chỉ chạy khi thay đổi file trong `android/**`, tạo Git Tag `v*` hoặc bấm "Run workflow" thủ công. Đính kèm APK vào GitHub Release/Artifacts.         |

### Cấu hình Render Deploy Hook (Tùy chọn để CD nhanh nhất):

1. Đăng nhập [dashboard.render.com](https://dashboard.render.com), chọn service `cinetune-api`.
2. Vào **Settings** -> cuộn xuống **Deploy Hook** -> bấm **Create Deploy Hook** và copy URL.
3. Vào GitHub Repository `vin371/MO-Cintune` -> **Settings** -> **Secrets and variables** -> **Actions**.
4. Tạo Repository Secret mới:
   - **Name:** `RENDER_DEPLOY_HOOK_URL`
   - **Value:** Dán URL Deploy Hook từ Render vào.

---

## 3. Các Tính Năng Mới Trên CineTune

CineTune đã được bổ sung hàng loạt tính năng hiện đại:

1. **Bộ Chỉnh Âm Thanh Chuyên Nghiệp (Equalizer Presets):**
   - Tích hợp Web Audio API BiquadFilter (Low, Mid, High).
   - Các chế độ: `Chuẩn (Flat)`, `Bass Boost (Tăng âm trầm cực mạnh)`, `Vocal Boost (Lọc rõ lời bài hát)`, `Pop`, `Rock`, `Acoustic`.
   - Chọn nhanh bằng nút **EQ** ngay trong màn hình Trình phát.
2. **Thanh Điều Chỉnh Âm Lượng & Mute 1 Chạm:**
   - Thanh trượt âm lượng mượt mà (0% - 100%) hiển thị phần trăm trực quan.
   - Nút bật/tắt tiếng (`🔊` / `🔉` / `🔇`) nhanh chóng và lưu trạng thái vào thiết bị.
3. **Điều Chỉnh Tốc Độ Phát Nhạc (Playback Speed):**
   - Hỗ trợ các mức tốc độ: `0.8x`, `1.0x (Chuẩn)`, `1.25x`, `1.5x`.
   - Chuyển đổi nhanh bằng nút **⚡ Speed**.
4. **Hẹn Giờ Thông Minh (Bổ sung chế độ "Hết bài"):**
   - Tùy chọn dừng nhạc ngay khi phát xong bài hát hiện tại (`Hết bài`), bên cạnh 15, 30, 60 phút.
5. **Chia Sẻ Bài Hát Thông Minh (Smart Share):**
   - Hỗ trợ Native Web Share API trên điện thoại hoặc tự động sao chép link chia sẻ vào Clipboard kèm thông báo.
6. **Hệ Thống Thông Báo Toast (Toast Notifications):**
   - Hiển thị phản hồi bóng bẩy, mượt mà khi yêu thích bài hát, hẹn giờ, chỉnh EQ, tạo playlist, sao chép link...
7. **Tìm Kiếm Thông Minh & Lịch Sử Gần Đây:**
   - Thẻ gợi ý nhanh các nghệ sĩ hot (Sơn Tùng M-TP, Vũ, HIEUTHUHAI, Đen Vâu...).
   - Lưu lịch sử tìm kiếm gần đây để tìm lại nhanh chỉ bằng 1 chạm.
8. **Giao Diện Chi Tiết Bài Hát (Song Detail Card), Thống Kê & Bộ Lọc Bên Trong:**
   - Khung chi tiết bài hát thiết kế Glassmorphism sang trọng với hiệu ứng ánh sáng nền ambient glow.
   - Thống kê thời gian thực từ Zing MP3: Lượt nghe (`🎧 1.8M`), Lượt thích (`❤️ 84.2K`), Đánh giá Zing Chart (`⭐ 4.9/5.0`).
   - Widget xếp hạng sao tương tác 5 sao (`[★ ★ ★ ★ ★]`) với hiệu ứng phát sáng vàng gold và nhận xét trực quan.
   - Bộ lọc bên trong (Inside Filter Chips): gắn thẻ tự động cho Thể loại (`🎵 V-Pop`, `🎵 Nhạc Trẻ`), Nhạc sĩ sáng tác (`✍️ ...`), Album (`💿 ...`) và Nghệ sĩ (`🎤 ...`), chạm để lọc và tìm kiếm bài hát ngay lập tức.

---

## 4. Công Cụ Clean Code & Kiểm Tra Chất Lượng Mã Nguồn

Các lệnh chạy kiểm tra cục bộ trước khi push:

```bash
# Chạy Unit Tests tự động
npm test

# Chấm điểm Clean Code & sinh báo cáo chi tiết
npm run review

# Kiểm tra quy chuẩn mã nguồn ESLint
npm run lint

# Tự động sửa lỗi linting
npm run lint:fix

# Kiểm tra định dạng Prettier
npm run format:check

# Tự động định dạng toàn bộ mã nguồn
npm run format
```
