# VNPAY Homework Group 2

Demo web thanh toán VNPAY sandbox bằng Node.js thuần, không cần cài package ngoài.

## Chạy local

1. Copy `.env.example` thành `.env`.
2. Điền `VNP_TMN_CODE`, `VNP_HASH_SECRET`, `VNP_RETURN_URL`.
3. Chạy:

```powershell
node server.js
```

4. Mở `http://localhost:3000`.

## Dùng với Ngrok

```powershell
ngrok http 3000
```

Sau đó lấy HTTPS URL của Ngrok, cập nhật:

```env
VNP_RETURN_URL=https://<domain-ngrok>/return
VNP_IPN_URL=https://<domain-ngrok>/ipn
```

Không commit file `.env` lên GitHub vì có `TmnCode` và `HashSecret`.

## Luồng chính

- `GET /`: form nhập số tiền và nút thanh toán.
- `POST /create-payment`: tạo Payment URL, ký HMAC SHA512 bằng `VNP_HASH_SECRET`, redirect sang VNPAY.
- `GET /return`: nhận redirect từ trình duyệt, xác thực chữ ký, hiển thị kết quả và dữ liệu trả về.
- `GET /ipn`: webhook server-to-server, xác thực chữ ký, kiểm tra đơn hàng, cập nhật trạng thái trong bộ nhớ demo.

## Ghi chú

Project dùng bộ nhớ tạm `Map` để lưu đơn hàng cho mục đích demo. Khi làm thật cần thay bằng database và chỉ cập nhật đơn khi đã kiểm tra chữ ký, số tiền, mã đơn, trạng thái hiện tại và mã phản hồi giao dịch.
