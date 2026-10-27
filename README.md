# Tendies

Trang tĩnh xem trước wallpaper PosterBoard (file `.tendies`) và cho tải file gốc. Ảnh và file tải nằm trên Cloudflare R2. Git chỉ giữ code và `content/catalog.json`.

## Chạy local

```bash
npm install
npm run dev
```

Mở http://localhost:3000. `npm run build` chỉ build Next.js, không render wallpaper.

## Thêm wallpaper

Làm theo [AGENTS.md](AGENTS.md). `npm run publish` viết lại toàn bộ `content/catalog.json` từ file đang có trong `content/tendies`. Thiếu file cũ thì catalog mất wallpaper đó, và lần chạy không lỗi sẽ xóa object tương ứng trên R2.

Khóa R2 chỉ ở máy publish. Vercel chạy `next build` và không cần các biến này.

## Deploy

Import repo lên Vercel, framework Next.js, build command để trống. Site xuất tĩnh (`output: "export"`). Sau khi push `content/catalog.json` lên `main`, redeploy project từ nhánh đó. Trang đang chạy là https://posterboard-one.vercel.app/.

## Git

Các đường dẫn sau không được commit:

- `content/tendies/*.tendies`
- `public/tendies/`
- `public/previews/`
- `.env` và `.env.local`

File `.tendies` đã publish nằm trên R2, không nằm trên git. Cách lấy lại trước khi publish nằm trong [AGENTS.md](AGENTS.md).
