# Thêm hình nền

Quy trình này dành cho agent thêm file `.tendies` vào gallery. Đọc hết trước khi chạy `npm run publish`.

Git giữ code, `content/catalog.json` và `content/duplicates.json`. Ảnh xem trước và file gốc nằm trên Cloudflare R2. Thư mục `content/tendies` chỉ là nguồn để render, và git bỏ qua các file `.tendies` trong đó.

Chỉ push lên `main`. Không tạo nhánh, không mở pull request.

## Trước khi publish

`scripts/build-previews.mjs` đọc mọi file `.tendies` trong `content/tendies`, rồi ghi đè cả `content/catalog.json` bằng kết quả của những file đó.

- File có `fileName` và `sourceSha256` trùng catalog thì được giữ nguyên, không render lại.
- File có trên đĩa nhưng không còn trong catalog thì bị render và upload.
- File có trong catalog nhưng không có trên đĩa thì bị xóa khỏi catalog. Nếu cả lần chạy không có file nào lỗi, script còn xóa prefix tương ứng trên R2.

`PUBLISH_ONLY` chỉ chọn file nào được render lại. Nó không giữ những file vắng mặt trên đĩa.

Một file `.tendies` có thể chứa nhiều bundle `.wallpaper`. Script tạo một mục catalog cho mỗi bundle có chữ `iphone` trong đường dẫn. Không có bundle iPhone thì nó dùng mọi bundle tìm được. Tên trên thẻ là tên file, bỏ đuôi `.tendies`, nên nhiều thẻ có thể cùng một nhãn. `id` là slug của tên file; bundle sau trong cùng file được `id` dạng `slug-2`, `slug-3`.

## Việc không được commit

- `content/tendies/*.tendies`
- `public/tendies/`
- `public/previews/`
- `.env`, `.env.local`, và mọi khóa R2

Không in `R2_ACCESS_KEY_ID` hay `R2_SECRET_ACCESS_KEY` ra log, commit, hoặc câu trả lời.

## 1. Cài công cụ

```bash
npm install
```

`ffmpeg` cần cho wallpaper video. Không có ffmpeg thì bundle video không có poster video. HEIC được đổi sang PNG bằng `heic-convert` trước khi `sharp` đọc, không cần cài thêm libheif.

## 2. Kiểm tra `.env.local`

Copy từ `.env.example` nếu máy chưa có file. Điền năm biến:

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE=
```

`R2_PUBLIC_BASE` phải là origin `https`, không user, không query, pathname chỉ là `/`. Giá trị đang dùng là `assetBase` trong `content/catalog.json`. Giữ nguyên origin đó. Đừng đổi sang hostname khác khi người dùng chưa gắn domain cho bucket.

Script tự đọc `.env.local`. Biến đã có trong môi trường thì không bị file đè.

## 3. Lấy đủ file đang có trong catalog

Clone mới không có `content/tendies`. Tải từng tên file đúng một lần từ khóa `download` trong catalog. Asset hiện nằm ở custom domain `cdn.digitalshops.cc` (R2 nick mới); nên gửi User-Agent `Mozilla/5.0` khi tải.

```bash
node --input-type=module << 'JS'
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const catalog = JSON.parse(await readFile("content/catalog.json", "utf8"));
const dir = "content/tendies";
await mkdir(dir, { recursive: true });
const files = new Map();
for (const item of catalog.items) {
  if (!files.has(item.fileName)) files.set(item.fileName, item.download);
}
let done = 0;
for (const [fileName, key] of files) {
  const dest = path.join(dir, fileName);
  try {
    await access(dest);
    done += 1;
    continue;
  } catch {}
  const url = `${catalog.assetBase.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} ${fileName}`);
  await writeFile(dest, Buffer.from(await response.arrayBuffer()));
  done += 1;
  console.log(`${done}/${files.size} ${fileName}`);
}
JS
```

Rồi đối chiếu. `missing` phải là 0 trước khi publish thật:

```bash
node --input-type=module << 'JS'
import { readdir, readFile } from "fs/promises";
const catalog = JSON.parse(await readFile("content/catalog.json", "utf8"));
const onDisk = new Set(await readdir("content/tendies"));
const names = [...new Set(catalog.items.map((item) => item.fileName))];
const missing = names.filter((name) => !onDisk.has(name));
console.log({ items: catalog.items.length, files: names.length, onDisk: onDisk.size, missing: missing.length });
if (missing.length) {
  console.log(missing.join("\n"));
  process.exit(1);
}
JS
```

## 4. Thêm file mới

Copy file `.tendies` vào `content/tendies`. Giữ nguyên tên file, kể cả dấu cách và chữ không phải ASCII. Tên đó trở thành `fileName` và nhãn trên thẻ.

## 5. Render thử

Lần này không upload và không sửa catalog. Poster nằm ở `/tmp/preview-check/<id>.jpg`.

```bash
PUBLISH_DRY=1 PUBLISH_ONLY="TenFile.tendies" npm run publish
```

Nhiều file thì cách nhau bằng dấu phẩy. Khoảng trắng quanh dấu phẩy được bỏ qua. Mở poster và xem có đúng cảnh hay không.

Poster phẳng hoặc gần như một màu thì script ném `empty poster for <file> (<id>)` và giữ dòng catalog cũ của file đó. Đừng upload một poster trống để thay ảnh đang có.

`PUBLISH_CONCURRENCY=1` khi file có nhiều ảnh HEIC. Mặc định script tự chọn từ 1 đến 4 tiến trình.

## 6. Publish

Chạy lại bước đối chiếu ở mục 3. `missing` vẫn phải là 0.

```bash
npm run publish
```

Chỉ render file mới hoặc file đổi nội dung:

```bash
PUBLISH_ONLY="TenFile.tendies" npm run publish
```

Log kết thúc có dòng `catalog: <số> wallpaper(s), uploaded <số>, ffmpeg yes|no`.

Sau khi chạy, kiểm tra:

- Số mục mới bằng số mục cũ cộng số bundle mới. Số mục giảm nghĩa là có file cũ không nằm trên đĩa.
- Mỗi `fileName` cũ vẫn còn ít nhất một mục.
- `assetBase` không đổi.
- Poster mới trong catalog mở được. Request tới `cdn.digitalshops.cc` nên dùng User-Agent `Mozilla/5.0`.

File lỗi in `failed <tên file>`. Dòng catalog cũ của riêng file đó được giữ. `failed > 0` thì script không xóa prefix cũ trên R2, nhưng catalog vẫn bị ghi lại nếu có file khác upload thành công. Vì vậy thư mục local vẫn phải đủ file trước khi chạy.

File không đổi được log `<tên> unchanged`. Preview mới dùng hậu tố `-r3` trong object key, ví dụ `previews/<id>/<sha12>-r3/poster.jpg`. Mục không render lại giữ key sẵn có, có thể là `-r2` hoặc không có hậu tố. `Cache-Control` của object là một năm và immutable. Muốn trình duyệt bỏ preview cũ thì phải để script ghi key mới, đừng sửa tay đường dẫn trong catalog.

Upload xong, script xóa `public/previews` và `public/tendies` nếu không còn đường dẫn local. Để nguyên như vậy.

## 7. Ảnh giống hệt nhau

Gallery bỏ qua `id` nằm trong `content/duplicates.json`. Không có nút bật tắt. Giá trị là `id` được giữ lại.

Chỉ thêm một dòng khi poster mới giống hệt một poster đang hiện: cùng byte, hoặc lệch màu trung bình gần như bằng không và không có điểm ảnh lệch lớn. Giữ thẻ đã có, ghi `id` mới làm khóa.

Không thêm vào file này khi hai ảnh khác màu, khác cảnh, hoặc chỉ gần giống nhau. Desert, Lake, các màu iPhone 15, và các mùa khác nhau là những bộ phải giữ nhiều thẻ.

## 8. Thể loại

Gallery có thanh lọc theo thể loại. Dữ liệu nằm ở `content/categories.json`, không nằm trong `content/catalog.json`, vì `npm run publish` ghi đè cả catalog.

- `categories` là danh sách `id` và nhãn tiếng Việt: anime, game, movie, device, music, vehicle, abstract, nature, meme, other.
- `items` ánh xạ `id` của mục catalog sang mảng `id` thể loại. Một mục có thể thuộc nhiều thể loại, ví dụ skin Minecraft kiểu anime là `["game", "anime"]`.
- Mục chưa có trong `items` tự rơi vào `other` khi tải trang, nên publish mà quên thêm dòng thì trang vẫn chạy.

Sau mỗi lần publish, thêm dòng cho các `id` mới vào `content/categories.json`. Không chắc thể loại nào thì ghi `["other"]`. Bundle phụ `slug-2`, `slug-3` cần dòng riêng.

## 9. Commit và đưa lên web

```bash
git add content/catalog.json
git add content/duplicates.json   # chỉ khi file này đổi
git add content/categories.json   # khi có mục mới cần thể loại
git commit -m "Add <tên wallpaper> to the catalog."
git push origin main
```

Đừng commit file `.tendies`, preview, hoặc `.env.local`. Đừng force-push `main`.

Vercel chỉ chạy `next build`. Nó không đọc R2 và không chạy publish. Redeploy project từ `main` thì https://posterboard-one.vercel.app/ mới hiện wallpaper mới.

Kiểm tra local bằng `npm run dev`. Tìm đúng tên file mới, mở preview, và tải file `.tendies`. Số wallpaper trên đầu trang là số mục catalog sau khi đã bỏ các `id` trong `content/duplicates.json`.
