# ThicMobKai Converter

Trang web thử nghiệm để quét pack MythicMobs + ModelEngine 4 và chuyển sang đầu ra ThicMobKai-only.

## Tính năng

- Quét file `.zip` chứa mob, boss, model, skill
- Tự nhận diện ModelEngine 4 `.bbmodel`
- Dịch một phần mechanic skill MythicMobs sang lớp ThicMobKai
- Sinh `mobs.yml`, `bosses.yml`, `skills.yml` và các file tách riêng cho từng mob / boss
- Xuất gói kết quả mà không cần giữ MythicMobs trong pack đầu ra
- Hiển thị cảnh báo khi gặp mechanic chưa có luật dịch

## Cách dùng

1. Kéo thả pack `.zip` vào web
2. Bấm `Quét pack`
3. Xem báo cáo, `ThicMobKai`, `Skill map`, `Tách file`, `Sửa lỗi`
4. Tải file xuất ra để dùng trực tiếp cho ThicMobKai

## Ghi chú

- Đây là bản converter ban đầu, chưa hỗ trợ toàn bộ mechanic của MythicMobs.
- Nếu pack có mechanic chưa hỗ trợ, tool sẽ đánh dấu để nâng cấp sau.
- Pack xuất ra được thiết kế để đi theo hướng ThicMobKai thuần, không phụ thuộc MythicMobs.
