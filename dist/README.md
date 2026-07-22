# ThicMobKai Docs Site

Trang web giới thiệu chính thức cho ThicMobKai.

## Mục tiêu

- Giới thiệu toàn bộ hệ thống mob, boss, dungeon, danh hiệu và rương boss
- Chia thông tin thành nhiều trang để dễ đọc
- Cho admin biết file YAML nào dùng để chỉnh gì
- Tóm tắt các hook quan trọng như ModelEngine 4, DiscordSRV, PlaceholderAPI và ServerBoardKai

## Chạy local

```bash
npm install
npm run build
```

Sau đó mở `index.html` hoặc phục vụ thư mục `dist/`.

## Cấu trúc

- `index.html`: giao diện site
- `styles.css`: giao diện và layout
- `app.js`: chuyển trang bằng hash
- `build.mjs`: copy site sang `dist/`

## Ghi chú

- Repo này đã bỏ toàn bộ converter web cũ.
- Web hiện tại chỉ còn mục tài liệu / hướng dẫn / giới thiệu plugin.
