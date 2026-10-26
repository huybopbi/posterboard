# Tendies

Trang tĩnh xem trước wallpaper PosterBoard (file `.tendies`) và cho tải file gốc. Ảnh và file tải nằm trên Cloudflare R2. Git chỉ giữ code và `content/catalog.json`.

## Chạy local

```bash
npm install
npm run dev
```

Mở http://localhost:3000. `npm run build` chỉ build Next.js, không render wallpaper.

## Thêm wallpaper

1. Tạo bucket R2 lớp Standard và gắn domain public.
2. Copy `.env.example` thành `.env.local`:

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE=https://files.example.com
```

`R2_PUBLIC_BASE` là origin https, không có path.

3. Bỏ file `.tendies` vào `content/tendies`.
4. Chạy `npm run publish`.

Script render vài wallpaper cùng lúc (trên máy này là 2), rồi upload lên R2 và ghi lại catalog. Máy nhiều nhân hơn sẽ tự tăng, tối đa 4. Muốn chỉnh thì đặt `PUBLISH_CONCURRENCY`. File trùng `sourceSha256` thì bỏ qua. Upload xong toàn bộ thì script xóa `public/previews` và `public/tendies`.

5. Commit `content/catalog.json` và push `main`.

Khóa R2 chỉ ở máy publish. Vercel chạy `next build` và không cần các biến này.

Object key:

- `originals/<id>/<sha12>/<tên file>` với `Content-Disposition: attachment`
- `previews/<id>/<sha12>/poster.jpg`, `bg.webp`, `fg.webp`, và các frame chuyển

Catalog lưu `assetBase` cùng đường dẫn tương đối. Trang ghép hai phần đó thành URL.

## Deploy

Import repo lên Vercel, framework Next.js, build command để trống. Site xuất tĩnh (`output: "export"`).

Catalog hiện vẫn trỏ `/previews` và `/tendies` cho đến lần publish đầu. Trước đó bản deploy không có ảnh.

## Git

Các đường dẫn sau không được commit:

- `content/tendies/*.tendies`
- `public/tendies/`
- `public/previews/`
- `.env` và `.env.local`

Ba file gốc cũ vẫn nằm trong commit `b6bc945`. Sau khi pull bản đã gỡ binary, lấy lại file để publish bằng:

```bash
git restore --source=b6bc945 --worktree -- content/tendies
```
