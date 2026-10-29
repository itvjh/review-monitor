# Google Business Profile review monitor

n8n (workflow, chạy mỗi ngày 1 lần lúc 09:00, múi giờ Asia/Ho_Chi_Minh) -> `collector/` (Playwright, chỉ đọc, giữ phiên đăng nhập Chrome) -> Gemini phân tích -> Supabase -> `dashboard/` (cảnh báo trên trang web cục bộ).

## Cài đặt
1. Database: dán `sql/schema.sql` vào Supabase SQL Editor (cài mới; chạy lại vẫn an toàn).
2. `.env`: `SUPABASE_URL`, `SUPABASE_KEY` (dùng key `sb_secret_...`), `GEMINI_API_KEY`. Sau đó `npm run setup:credentials` để đăng ký 2 key vào n8n.
3. Đăng nhập Google một lần: `npm run login`, đăng nhập thủ công rồi đóng cửa sổ. Mật khẩu không bao giờ lưu trong n8n.
   - Tripadvisor (tùy chọn): `npm run login -- tripadvisor`, đăng nhập trong cửa sổ Chrome thường hiện ra rồi **đóng hết cửa sổ Chrome đó**. Dùng chung profile với Google.
4. Nạp workflow và kích hoạt lịch: `npm run import:workflow` (nạp rồi **publish**, nên lịch 09:00 tự bật; không cần bật tay trong n8n). Mỗi lần nạp lại workflow cần khởi động lại n8n để lịch có hiệu lực.
5. Chạy cả hệ thống bằng **một lệnh**: `npm start` (xem mục "Khởi động hằng ngày").

## Khởi động hằng ngày (sau khi bật máy)

**Cách dễ nhất: bấm đúp file `start.bat`** trong thư mục `D:\automation` (hoặc mở terminal ở đó và chạy **một lệnh**):

```
npm start
```

Lệnh này bật collector (:3010), dashboard + hàng đợi đăng (:3020) và n8n (:5678). Dịch vụ nào đã chạy sẵn thì bỏ qua; dịch vụ nào bị sập thì tự khởi động lại sau 5 giây; nhấn Ctrl+C để dừng các dịch vụ do lệnh này bật. **Giữ cửa sổ terminal mở.**
- Lịch: workflow chạy mỗi ngày lúc **09:00**, nên máy phải bật và `npm start` phải đang chạy vào giờ đó. n8n **không chạy bù** nếu lúc 09:00 máy đang tắt: chạy `npm run crawl` để chạy workflow ngay một lần (in ra kết quả lượt chạy).
- Sau `npm run import:workflow` hoặc khi sửa `.env`, dừng (Ctrl+C) rồi `npm start` lại.
- `crawl.bat` (bấm đúp) = `npm run crawl`: chạy workflow Google ngay một lần. Tripadvisor: `npm run crawl -- tripadvisor`.
- Tripadvisor có workflow riêng, chạy **09:30** mỗi ngày (sau lượt Google 09:00, để hai lượt không tranh nhau profile Chrome).
- Tự bật cùng Windows / đúng giờ: trong Task Scheduler tạo tác vụ chạy `D:\automation\start.bat` (trigger "At log on", hoặc hằng ngày lúc 08:55; ở tab Conditions tick "Wake the computer to run this task" để máy ngủ vẫn được đánh thức). Máy đã **tắt hẳn** thì không chạy được.

Mọi lệnh chạy ở thư mục gốc `D:\automation`. PowerShell 5.1 không có `&&`: chạy từng lệnh riêng.

| Lệnh | Việc |
|---|---|
| `npm test` | chạy toàn bộ test |
| `npm run build:workflow` | sinh `workflows/google-reviews.json` và `workflows/tripadvisor-reviews.json` từ `workflows/build.js` |
| `npm run import:workflow` | import và publish cả hai workflow vào n8n |
| `npm run build:schema` | sinh lại `sql/schema.sql` từ các migration |
| `npm run build:icons` | sinh lại `dashboard/views/icons.svg` (chỉ các icon Lucide mà giao diện dùng, vài KB); chạy sau khi thêm tên icon mới vào một view |
| `npm run setup:credentials` | đăng ký key trong `.env` vào n8n |

## Cấu trúc thư mục (MVC)

```
config/env.js            đọc .env, dùng chung (nguồn cấu hình duy nhất)
config/prompts/          prompt dùng chung (reply-rules.txt: quy tắc soạn nội dung trả lời)
collector/               dịch vụ HTTP đọc Google Business Profile
  server.js              khởi động + bảng route (không có logic)
  config.js              cổng, đường dẫn, số lần retry, allow-list domain
  controllers/           nhận request, kiểm tra input, gọi model, gọi view
  models/                truy cập nguồn dữ liệu: browser, businessModel, reviewModel, selectors, errors, reviewUtils, tripadvisorModel, tripadvisorParse
  views/json.js          định dạng response HTTP
  login.js               script đăng nhập một lần (không phải một phần của server)
dashboard/               trang web cảnh báo
  server.js, routes.js   khởi động + bảng route
  controllers/           dataController, replyController (kiểm duyệt), pageController (file tĩnh)
  models/                supabase, review, run, reply, replyRules (luật thuần), gemini, httpError
  views/                 index.html + app.js (cảnh báo), replies.html + replies.js (kiểm duyệt), style.css, render.js
workflows/               workflow n8n (sinh ra, không sửa tay)
  build.js               ráp node + liên kết
  code/*.js              nội dung các Code node (có test)
  prompts/*.txt          prompt AI
  google-reviews.json, tripadvisor-reviews.json    FILE SINH RA, đừng sửa trực tiếp
sql/migrations/          nguồn sự thật của schema (0001_init.sql, ...)
sql/schema.sql           FILE SINH RA từ migrations
sql/optional/            SQL không bắt buộc (anon-policies.sql)
scripts/                 công cụ một lần (build-schema, setup-credentials)
tests/                   *.test.js, chạy bằng `npm test`
```

## Quy tắc MVC

Mỗi tầng chỉ làm đúng việc của nó. Phụ thuộc chỉ đi một chiều: `server -> routes -> controller -> model` và `controller -> view`.

- **Model** (`models/`): lấy và biến đổi dữ liệu (đọc trang Google, gọi Supabase, chuẩn hóa). Không biết gì về HTTP: không import `http`, không nhận `req`/`res`, không ghi response.
- **View** (`views/`): chỉ định dạng đầu ra (JSON, HTML, file tĩnh). Không gọi model, không có nghiệp vụ. Trình duyệt chỉ hiển thị, mọi nội dung từ dữ liệu phải gán bằng `textContent` (không dùng `innerHTML`) vì nội dung review là dữ liệu không tin cậy.
- **Controller** (`controllers/`): mỏng. Việc duy nhất: kiểm tra input -> gọi model -> chọn view. Là nơi duy nhất kiểm tra dữ liệu từ bên ngoài (body, query string, mảng `known`).
- **`server.js` / `routes.js`**: chỉ khởi động và khai báo route `"METHOD /path" -> controller`. Thêm endpoint mới = thêm một dòng vào bảng route, không thêm `if` rải rác.
- **Cấu hình** chỉ ở `config.js` (collector) và `config/env.js`. Không viết cứng cổng, đường dẫn hay key trong model.
- **Selector của Google** chỉ ở `collector/models/selectors.js`. Khi Google đổi giao diện, chỉ sửa file này.
- **Thư viện giao diện** (cài bằng `npm install`, phục vụ từ máy chủ dashboard, không dùng CDN nên chạy được offline và cho người xem trong mạng nội bộ): **Chart.js** (biểu đồ) và **Lucide** (icon, sprite SVG). Chỉ được phục vụ qua route cố định `/vendor/...` trong `dashboard/routes.js`; thêm thư viện mới = thêm một route ở đó. Giao diện sáng, bảng màu và khoảng cách nằm ở các biến CSS đầu `dashboard/views/style.css`; nhãn và màu nền tảng (Google, Tripadvisor) khai báo ở `PLATFORMS` trong `common.js`. Hộp xác nhận dùng thẻ `<dialog>` gốc của trình duyệt.
- **Một file một việc**, tên theo vai trò: `xxxController.js`, `xxxModel.js`. Hàm model trả dữ liệu thuần, lỗi nghiệp vụ ném `CodedError` (không tự trả HTTP).

Thêm một chức năng mới theo thứ tự: model -> controller -> view -> dòng route -> test.

## Trang "Nội dung trả lời đánh giá" (kiểm duyệt)

http://127.0.0.1:3020/replies. AI soạn bản nháp trả lời bằng **đúng ngôn ngữ của khách** (khách viết tiếng Nga thì trả lời tiếng Nga; review chỉ có sao thì trả lời tiếng Việt). Quy tắc soạn nằm ở `config/prompts/reply-rules.txt`, dùng chung cho workflow và nút "Tạo bản nháp / Tạo lại".
- Luồng: `chưa có nháp -> chờ duyệt -> đã duyệt -> đã đăng` (hoặc `từ chối -> đưa lại chờ duyệt`). Trạng thái nằm trên bảng `reviews` (`reply_draft`, `reply_final`, `reply_status`), luật chuyển trạng thái ở `dashboard/models/replyRules.js`.
- Người kiểm duyệt sửa trực tiếp nội dung. Hệ thống kiểm tra tự động: chặn nội dung trống/quá 4000 ký tự; cảnh báo liên kết, email, số điện thoại, lời hứa hoàn tiền/bồi thường/ưu đãi, ký tự giữ chỗ như `[tên]`.
- **Đăng lên Google**: mặc định chỉ duyệt, đăng tay (sao chép nội dung, mở trang đánh giá Google, bấm "Đã đăng lên Google (đăng tay)"). Đăng tự động chỉ chạy khi bật `REPLY_POSTING` (xem mục "Tự động đăng phản hồi").
- Review đã có phản hồi của chủ sở hữu thì không tạo bản nháp.
- **Văn phong mẫu**: AI trả lời theo khuôn câu trả lời thật của khách sạn (lời chào "Kính gửi quý khách {tên}" / "Dear Mr./Ms. {name}" -> cảm ơn đã dành thời gian đánh giá -> trân trọng phản hồi và vui mừng về trải nghiệm -> ý kiến là động lực cải thiện -> cảm ơn lần nữa, mong được đón lại -> "Trân trọng cảm ơn, Đội ngũ {Brand}" / "Thank you and best regards, {Brand} Team"), review tích cực giữ gần nguyên văn, review tiêu cực giữ khung nhưng thay phần giữa bằng lời xin lỗi và mời liên hệ trực tiếp. Toàn bộ nằm ở `config/prompts/reply-rules.txt`; **bảng tên thương hiệu dùng làm chữ ký** (`SIGNATURE BRAND`) cũng ở đó, sửa tại chỗ rồi `npm run build:workflow`, `npm run import:workflow` và khởi động lại dashboard. Bản nháp đã tạo trước đó giữ nguyên văn phong cũ cho đến khi bấm "Tạo lại bằng AI".
- Bảo vệ các thao tác ghi: chỉ nhận `POST application/json`, kiểm tra `Host` (chống DNS rebinding) và `Origin` (chống gửi chéo trang), `id` phải đúng dạng UUID, đổi trạng thái theo kiểu so sánh-rồi-ghi để hai người không ghi đè nhau.
- **Phải áp dụng migration `sql/migrations/0002_reply_moderation.sql` (dán vào Supabase SQL Editor) TRƯỚC khi import workflow mới**, vì node Save Review ghi các cột mới.

## Chia sẻ dashboard trong mạng nội bộ

- Trong `.env` đặt `DASHBOARD_HOST=0.0.0.0` (xóa dòng này để chỉ dùng trên máy của bạn). Khi khởi động, dashboard in ra địa chỉ để gửi cho đồng nghiệp, ví dụ `http://192.168.x.x:3020` (bỏ qua địa chỉ `169.254.x.x`).
- Windows Firewall phải cho phép cổng 3020 (chạy PowerShell **với quyền Administrator**, một lần): `New-NetFirewallRule -DisplayName "GBP Dashboard 3020" -Direction Inbound -Protocol TCP -LocalPort 3020 -Action Allow -Profile Private`.
- **Phân quyền không cần mật khẩu**: yêu cầu đến từ chính máy chạy dashboard là `moderator` (duyệt, từ chối, tạo bản nháp); mọi máy khác là `viewer` chỉ xem. Server quyết định bằng địa chỉ kết nối TCP và từ chối mọi `POST` của viewer (403), giao diện chỉ ẩn nút cho gọn. Nên **không đặt reverse proxy** phía trước (mọi yêu cầu sẽ trông như từ máy chủ).
- Chỉ nhận `Host` là localhost hoặc IP mạng riêng (10.x, 172.16-31.x, 192.168.x). Muốn truy cập bằng tên máy hoặc tên miền riêng: `DASHBOARD_ALLOWED_HOSTS=TEN-MAY` (phân tách bằng dấu phẩy).
- Ai trong cùng mạng cũng xem được toàn bộ review và phân tích AI, không cần đăng nhập. Không bật trên Wi-Fi khách. Cần chặn chặt hơn thì phải thêm đăng nhập.
- IP máy có thể đổi (DHCP): đặt IP cố định cho máy trong router để link không đổi.

## Tự động đăng phản hồi lên Google

Chỉ nội dung **đã duyệt** (tab "Đã duyệt") mới được đăng; đăng là bước cuối của luồng kiểm duyệt, không có đường tắt.
- `REPLY_POSTING` trong `.env` (cả collector và dashboard phải khởi động lại sau khi đổi): `off` (mặc định, không đăng) | `dry-run` (mở ô trả lời trên Google, điền nội dung, chụp ảnh rồi huỷ; **không bao giờ bấm Đăng**) | `live` (đăng thật). `REPLY_DAILY_LIMIT` (mặc định 10) là số phản hồi tối đa tự đăng mỗi ngày.
- **Hàng đợi đăng** (`dashboard/models/queue.js`, chỉ chạy khi `REPLY_POSTING=live`): bấm **Duyệt** chỉ đưa bài vào hàng đợi (tab "Đã duyệt" hiện vị trí và giờ dự kiến đăng). Worker trong dashboard đăng **từng bài một, mỗi bài cách nhau `REPLY_GAP_MINUTES` phút (mặc định 5)** để Google không thấy một loạt phản hồi tự động liên tiếp; khoảng cách tính từ lần chạm Google gần nhất, kể cả lần lỗi. Thứ tự: duyệt trước đăng trước. Trạng thái nằm trong database (migration `0003_reply_queue.sql`) nên tắt máy hay khởi động lại không mất hàng đợi. Mỗi bài thử tối đa 3 lần (lần thử được ghi trước khi chạm Google, nên không có vòng lặp thử liên tục); hết lượt thì dừng ở trạng thái lỗi và chờ bấm **Thử lại**. Ở chế độ `live` không có nút đăng tay ngay, mọi bài đi qua hàng đợi.
- **Duyệt hàng loạt**: ở tab "Chờ duyệt" tick từng bài hoặc "Chọn tất cả" rồi bấm **Duyệt hàng loạt**; nội dung dùng đúng như đang hiển thị trong ô (kể cả đã sửa). Bài có cảnh báo hoặc lỗi từ bộ kiểm duyệt tự động (liên kết, email, số điện thoại, lời hứa hoàn tiền...) **bị bỏ qua** và được liệt kê để bạn xem và duyệt riêng; tối đa 100 bài mỗi lần.
- Các lớp bảo vệ trong `collector/models/replyModel.js`: tìm thẻ review theo mã review của Google (không theo vị trí); phải khớp mã doanh nghiệp và tên người đánh giá; review đã có phản hồi thì **không đăng** (`ALREADY_REPLIED`); ô soạn phải đúng một ô và nội dung trong ô phải trùng khớp nội dung đã duyệt; sau khi bấm Đăng phải đọc lại thấy phản hồi hiển thị đúng trong thẻ đó mới coi là đã đăng; **không tự thử lại** (tránh đăng trùng); một lần một review, chạy tuần tự.
- Chống treo: mỗi lần đăng có hạn 150 giây (quá hạn thì dừng, không giữ hàng đợi của collector); yêu cầu đăng nằm chờ quá hạn (`deadline`) trong hàng đợi bị bỏ, không đăng muộn; xác nhận sau khi đăng bằng cách **tải lại trang** rồi tìm lại review (Google không tự hiện phản hồi mới trên trang đang mở; tối đa 3 lần thử). Đăng lại một review đã có phản hồi **giống hệt** bản đã duyệt được coi là thành công (tự đồng bộ trạng thái, không đăng thêm); có phản hồi **khác** thì từ chối (`ALREADY_REPLIED`). Nếu dashboard báo không nhận được phản hồi từ collector khi đang đăng thật, **kiểm tra trên Google trước khi thử lại**; review đã có phản hồi sẽ bị từ chối (`ALREADY_REPLIED`) nên không đăng trùng, và nếu đó là bản của bạn thì bấm "Đã đăng lên Google (đăng tay)" để đồng bộ trạng thái.
- Dashboard: chỉ máy chủ (moderator) mới đăng được; chặn bấm đúp; giới hạn mỗi ngày; thiếu mã review của Google thì không đăng. Nếu Google đổi giao diện, collector báo `SELECTOR_CHANGED` kèm ảnh và **không đăng**.
- Điều khoản: tự động hóa giao diện Google có rủi ro bị Google hạn chế tài khoản. Muốn an toàn tuyệt đối dùng Google Business Profile API (cần xin duyệt quyền).
- Quy trình bật: để `dry-run` vài lần và xem ảnh trong `collector/screenshots/`, rồi chuyển `live` với **một** review đầu tiên và kiểm tra trên Google.

## Tripadvisor (đọc + tự đăng phản hồi)

- **Nguồn dữ liệu: Tripadvisor Management Center** (`https://www.tripadvisor.com.vn/reviews?locationId=<mã cơ sở>&screen=allreviews`, cần đăng nhập, xem mục Cài đặt). Danh sách cơ sở lấy từ `https://www.tripadvisor.com.vn/Owners`. Danh sách ở Management Center xếp **mới nhất trước**, **đủ mọi ngôn ngữ**, 30 dòng một trang, có ngày chính xác và trạng thái phản hồi, và có cả bài chưa hiện ở trang công khai. Code: `collector/models/tripadvisorMc.js` (mở danh sách, đọc dòng, sang trang, dùng chung với phần đăng), `tripadvisorModel.js` (đọc), `tripadvisorParse.js` (phân tích thuần, có test). Route: `GET /tripadvisor/businesses`, `POST /tripadvisor/reviews` với `{limit, known}`.
- **Không có mã review, nên review được nhận diện bằng nội dung**: `review_hash` = băm của *cơ sở + tiêu đề + số sao + 60 ký tự đầu của nội dung* (`contentHash`). Dòng thu gọn chỉ hiện phần đầu nội dung (cắt bằng "…") nên khóa dừng ở 60 ký tự để dòng thu gọn, review đã mở và nội dung đã lưu cho cùng một khóa. Hai review trùng cả tiêu đề, số sao và 60 ký tự đầu chỉ được đếm một. Khi đổi từ trang công khai sang Management Center đã chạy một lần `node scripts/migrate-tripadvisor-hash.js --apply` để đổi `review_hash` cũ (giữ bản cũ trong `raw_data.old_hash`); chạy lại không hại gì.
- **Workflow riêng** `Tripadvisor Review Monitor` (id `tripadvisorReviewMonitor1`), cùng các node và cùng bảng `reviews` với Google, cột `platform = 'tripadvisor'`, chạy 09:30. `reviewsPerRun` (mặc định **5**) là số bài **mới** (chưa lưu) lấy cho **mỗi cơ sở** mỗi ngày. Workflow gửi các `review_hash` đã lưu của Tripadvisor (500 bài gần nhất); collector bỏ qua bài đã biết, đọc từng trang cho đến khi đủ 5 bài mới hoặc cả trang không còn bài mới. Vì danh sách xếp đúng theo thời gian, quy tắc dừng này chính xác. Chỉ bài mới mới được mở ra để đọc đủ nội dung. Tên người viết là **tên tài khoản** hiện ở Management Center (ví dụ "tuanminh_1996"), có thể khác tên hiển thị công khai.
- **Tự đăng phản hồi** (cùng cơ chế với Google, xem mục "Tự động đăng phản hồi"): bài Tripadvisor đã duyệt vào chung hàng đợi, đăng lần lượt, cách nhau `REPLY_GAP_MINUTES`, tính chung vào `REPLY_DAILY_LIMIT`, chỉ khi `REPLY_POSTING=live`. Code: `collector/models/tripadvisorReplyModel.js`, route `POST /tripadvisor/reply`, nhánh theo nền tảng trong `dashboard/models/publish.js`. Đăng qua **Tripadvisor Management Center** (`/reviews?locationId=<mã cơ sở>&screen=allreviews`): mở dòng review, điền ô "Your response", bấm **Gửi**. Dòng ở đó không có mã review nên được khớp bằng **tiêu đề + số sao + phần đầu nội dung** và phải là **duy nhất** (tên người viết chỉ dùng để phân biệt khi hai dòng giống hệt, vì trang quản lý có thể hiện tên tài khoản thay vì tên hiển thị, ví dụ "Phạm Tuấn Minh" hiện là "tuanminh_1996") trong 120 đánh giá mới nhất (trùng hoặc không thấy thì từ chối, không đoán). Từ chối nếu review đã có phản hồi khác; không retry khi bấm Gửi; xác nhận bằng cách tải lại trang và thấy dòng "Đã đăng phản hồi". Nếu bấm Gửi mà chưa xác nhận được thì báo lỗi, KHÔNG đăng lại: kiểm tra tay rồi bấm "Đã đăng tay". Thử không đăng thật: gọi collector với `dry_run: true` (điền ô, chụp ảnh vào `collector/screenshots/`, không bấm Gửi). Muốn tắt riêng Tripadvisor: bỏ `tripadvisor` khỏi `AUTO_PLATFORMS` trong `publish.js` (và `AUTO` trong `replies.js`).
- **Bị chặn**: nếu Tripadvisor hiện "Access is temporarily restricted" hoặc đòi xác minh, collector dừng hẳn và ghi `AUTH_REQUIRED`; không thử lại liên tục, không né phát hiện. Chrome do Playwright mở bị chặn khi **đăng nhập**, nên đăng nhập bằng Chrome thường (`npm run login -- tripadvisor`); sau đó đọc bằng collector chạy được.
- **Trạng thái phản hồi**: dòng có thể ghi "Đã đăng phản hồi" hoặc "Phản hồi đang chờ xử lý" (phản hồi vừa gửi, Tripadvisor đang kiểm duyệt); cả hai đều tính là đã phản hồi.
- **Giới hạn đã biết**: nội dung phản hồi cũ của chủ sở hữu không được đọc (chỉ biết đã phản hồi hay chưa); Tripadvisor gửi chữ Việt dạng tổ hợp nên mọi chuỗi được chuẩn hóa NFC trước khi so khớp. Đổi giao diện Management Center thì sửa `tripadvisorMc.js` (dòng là `button` chứa `svg[data-automation="bubbleRatingImage"]`; tiêu đề và đoạn trích là hai dòng chữ cuối của dòng).

## Hiệu năng và độ mượt của luồng đăng

- **Điểm nghẽn là mạng, không phải code**: mỗi lần dashboard hỏi Supabase mất khoảng 200 đến 300 ms, nên mọi thứ được thiết kế để giảm số lần hỏi. Việc đăng một phản hồi chỉ mất khoảng 12 đến 20 giây; phần lớn thời gian "chờ" trước đây là chờ trong hàng đợi.
- **Cache đọc ngắn hạn** (`dashboard/models/cache.js`): danh sách review, trạng thái lượt chạy (15 giây), số đếm và danh sách trả lời (10 giây). Các yêu cầu cùng lúc dùng chung một lần gọi. Mọi thao tác ghi của dashboard xóa cache ngay; dữ liệu do n8n ghi hiện sau tối đa một chu kỳ cache.
- **File tĩnh**: giữ trong bộ nhớ, nén gzip, có ETag (trình duyệt hỏi lại chỉ nhận 304); JSON lớn cũng được nén. Bộ icon chỉ còn vài KB thay vì 540 KB.
- **Thao tác duyệt**: thẻ biến mất ngay khi thao tác thành công, danh sách và số đếm làm mới ở nền; duyệt hàng loạt ghi 4 bài song song.
- **Hàng đợi đăng**: kiểm tra mỗi 10 giây và được đánh thức ngay sau khi duyệt, nên bài đầu tiên của một hàng đợi trống được đăng sau vài giây (khoảng cách `REPLY_GAP_MINUTES` vẫn giữ giữa các bài). **Hỏi collector trước khi dùng một lượt thử**: nếu collector đang bận (một lượt đọc đang chạy) hoặc đã tắt thì bài chỉ đợi, không bị tính lượt thử và không bị timeout. Collector báo `busy` ở `GET /health`.
- **Chỉ nên chạy lượt đọc dài (`npm run crawl`) khi hàng đợi trống**, vì collector chỉ làm một việc một lúc.

## Quy tắc chung

- **Với Google và Tripadvisor, collector chỉ đọc** (ngoại lệ duy nhất: đăng phản hồi đã duyệt lên Google và Tripadvisor, xem bên dưới): điều hướng, cuộn, đọc; click duy nhất là nút phân trang / số dòng mỗi trang. Không sửa, xóa, đổi quyền. **Ngoại lệ duy nhất là đăng một phản hồi đã duyệt** (`POST /reply`), mặc định tắt, xem "Tự động đăng phản hồi". Chỉ truy cập domain trong allow-list (`collector/config.js`).
- **Bảo mật**: không đưa key vào code, workflow hay chat; chỉ ở `.env` và credential của n8n. Key `sb_secret_` chỉ dùng phía server. Không commit `.env` và `collector/profile/` (chứa phiên đăng nhập Google).
- **Gặp CAPTCHA / 2FA / xác minh thiết bị**: dừng, ghi `AUTH_REQUIRED`, không cố vượt qua. Dashboard hiện banner đỏ; xử lý bằng `npm run login`.
- **Mã lỗi chuẩn** (collector, workflow, bảng `automation_runs`): `AUTH_REQUIRED`, `POSTING_DISABLED`, `REVIEW_NOT_FOUND`, `REPLY_MISMATCH`, `ALREADY_REPLIED`, `BUSINESS_NOT_FOUND`, `REVIEWS_PAGE_NOT_FOUND`, `BROWSER_TIMEOUT`, `SELECTOR_CHANGED`, `NETWORK_ERROR`, `AI_ERROR`, `DATABASE_ERROR`, `UNKNOWN_ERROR`. Lỗi nghiệp vụ trả HTTP 200 kèm `status`/`error_code` để workflow rẽ nhánh; chỉ input sai mới trả 400.
- **Retry**: lỗi tạm thời (timeout, mạng) được thử lại, lỗi cuối cùng (`AUTH_REQUIRED`, `SELECTOR_CHANGED`) thì không.
- **Không tin dữ liệu ngoài**: đầu ra của AI luôn qua `workflows/code/validate-ai.js` (kiểm tra enum, giới hạn số, bỏ category lạ); body request luôn qua controller kiểm tra.
- **Review trùng**: nhận diện bằng `review_hash` (UNIQUE trong DB). Hash dựa trên id review của Google, không dùng ngày tương đối ("2 ngày trước") vì giá trị đó đổi theo thời gian.
- **Chú thích** chỉ nói lý do mà code không tự nói; chỗ làm tắt có giới hạn ghi `shortcut: <giới hạn>, <khi nào nâng cấp>`.

## Workflow n8n

- Sửa `workflows/build.js`, `workflows/code/*.js` hoặc `workflows/prompts/*.txt`, rồi `npm run build:workflow` và `npm run import:workflow`. Không sửa `google-reviews.json` bằng tay (lần build sau sẽ ghi đè).
- Code node viết trong `workflows/code/` để test được: dùng các biến toàn cục của n8n (`$`, `$input`, `$json`) và có `return`. Mỗi file có test trong `tests/workflow-code.test.js`.
- Đổi model AI: trường `geminiModel` của node `Config` trong `build.js`.
- Module trả lời review (Generate Reply -> Approval -> Post Reply) đang để node tắt `Reply Module (disabled, v2)`; Version 1 không tự đăng reply.

## Database và migration

`sql/migrations/NNNN_ten.sql` là nguồn sự thật. Mỗi file phải chạy lại được (`if not exists`, `drop policy if exists`) và kết thúc bằng
`insert into schema_migrations (version) values ('NNNN_ten') on conflict do nothing;`. Không sửa migration đã áp dụng, chỉ thêm số tiếp theo.
- Nâng cấp database đang chạy: dán riêng file migration mới vào SQL Editor.
- Xem đã áp dụng đến đâu: `select * from schema_migrations order by version;`
- Cài mới: `npm run build:schema` rồi dán `sql/schema.sql`.

## Test

`npm test` chạy `tests/*.test.js` (Node built-in test runner, không cần cài thêm):
- `collector-utils`: chuẩn hóa ngày, hash review.
- `http-layers`: route và kiểm tra input của dashboard và collector (không cần trình duyệt hay mạng).
- `workflow-code`: các Code node của workflow với dữ liệu giả.

Quy tắc: logic mới (nhánh, vòng lặp, parser, tiền, bảo mật) phải có test đi kèm trước khi coi là xong. Test không gọi Google hay Supabase thật.

## Ghi chú vận hành

- Selector trong `collector/models/selectors.js` được hiệu chỉnh ngày 2026-10-23 trên giao diện tiếng Việt. Google đổi giao diện sẽ sinh `SELECTOR_CHANGED` kèm ảnh chụp ở `collector/screenshots/`.
- Dashboard hiện review có rating <= 2, `requires_attention` hoặc priority `urgent` trong 7-90 ngày, tự làm mới mỗi 60 giây, số cảnh báo hiện trên tiêu đề tab. Có bộ lọc doanh nghiệp, khoảng ngày và phản hồi (đã / chưa phản hồi). Sắp xếp mới nhất lên trước: `review_date` giảm dần, cùng ngày thì theo `collected_at` (workflow gán `collected_at` giảm dần theo thứ tự feed của Google).
- Review có bản dịch tự động của Google được tách thành hai hàng riêng ("Bản gốc" và "Bản dịch tự động của Google") ở cả hai trang. Việc tách làm ở `dashboard/models/reviewText.js` (hàm thuần, có test); dữ liệu lưu trong DB vẫn nguyên văn để AI và hash không đổi.
- AI viết `summary`, `key_points`, `suggested_action` bằng tiếng Việt; enum (`sentiment`, `priority`, `category`) giữ tiếng Anh để validate, dashboard tự hiển thị nhãn tiếng Việt. Prompt ở `workflows/prompts/review-analysis.txt`.
- Key Gemini đang ở gói Free; quota theo từng model (xem ai.dev/rate-limit): `gemini-3.5-flash-lite` 15 request/phút và 500 request/ngày (đang dùng), `gemini-3.6-flash`/`gemini-3.8-flash` chỉ 5 request/phút và 20 request/ngày (không dùng). Node `AI Pace` chờ `aiDelaySeconds` (mặc định 5 giây) giữa các lần gọi AI. Review gặp lỗi 429 không bị lưu và sẽ được phân tích lại ở lần chạy sau (báo `AI_ERROR`).
- **Mỗi lần chạy chỉ đọc `reviewsPerRun` review mới nhất (mặc định 30, tính chung cho tất cả doanh nghiệp)** từ node `Config`. Review đã có trong database bị bỏ qua (kiểm tra `review_hash`), nên không bị lưu trùng. Nếu giữa hai lần chạy có nhiều hơn 5 review mới thì phần dư sẽ bị bỏ sót: tăng `reviewsPerRun` (ví dụ 10-20) nếu cần. Lấp đầy dữ liệu lần đầu: tạm đặt `reviewsPerRun` = 100, chạy tay một lần, rồi đặt lại 5.
