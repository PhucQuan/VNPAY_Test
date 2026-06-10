const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

loadEnv();

const config = {
  port: Number(process.env.PORT || 3000),
  vnpUrl: process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  tmnCode: process.env.VNP_TMN_CODE || "DEMO_TMN_CODE",
  hashSecret: process.env.VNP_HASH_SECRET || "DEMO_HASH_SECRET",
  returnUrl: process.env.VNP_RETURN_URL || "http://localhost:3000/return",
  ipnUrl: process.env.VNP_IPN_URL || "http://localhost:3000/ipn"
};

const orders = new Map();

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function sortObject(input) {
  return Object.keys(input)
    .sort()
    .reduce((result, key) => {
      result[key] = input[key];
      return result;
    }, {});
}

function stringifyParams(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, "+")}`)
    .join("&");
}

function createSecureHash(params) {
  const sorted = sortObject(params);
  const signData = stringifyParams(sorted);
  return crypto.createHmac("sha512", config.hashSecret).update(signData, "utf8").digest("hex");
}

function verifyVnpayHash(params) {
  const receivedHash = params.vnp_SecureHash;
  const clone = { ...params };
  delete clone.vnp_SecureHash;
  delete clone.vnp_SecureHashType;
  return receivedHash && createSecureHash(clone).toLowerCase() === receivedHash.toLowerCase();
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      --ink: #101828;
      --muted: #667085;
      --line: #d9e2ec;
      --soft: #f6f8fb;
      --brand: #0b66c3;
      --brand-dark: #084b8f;
      --green: #057647;
      --red: #b42318;
      --amber: #b54708;
    }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: linear-gradient(180deg, #eef5fb 0, #f7f9fc 280px, #f7f9fc 100%);
      color: var(--ink);
    }
    main { max-width: 1080px; margin: 0 auto; padding: 28px 20px 44px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 800; letter-spacing: .2px; }
    .logo { width: 44px; height: 44px; border-radius: 8px; display: grid; place-items: center; background: #fff; border: 1px solid var(--line); color: var(--brand); box-shadow: 0 8px 24px rgba(16, 24, 40, .08); }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: #fff; border: 1px solid var(--line); color: var(--brand-dark); font-size: 13px; font-weight: 700; }
    .hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); gap: 20px; align-items: stretch; }
    .panel { background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 16px 40px rgba(16, 24, 40, .09); }
    .intro { padding: 30px; }
    h1 { margin: 0; font-size: 34px; line-height: 1.15; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    p { line-height: 1.55; }
    .lead { margin: 14px 0 0; color: var(--muted); font-size: 16px; }
    .payment-card { padding: 24px; }
    label { display: block; margin-bottom: 8px; font-weight: 700; }
    .input-wrap { position: relative; }
    input[type="number"] { width: 100%; padding: 14px 56px 14px 14px; border: 1px solid #b8c7d9; border-radius: 8px; font-size: 18px; font-weight: 700; outline: none; }
    input[type="number"]:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(11, 102, 195, .16); }
    .currency { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); font-weight: 700; }
    .actions { display: grid; gap: 10px; margin-top: 18px; }
    button, a.button {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 46px;
      border: 0;
      border-radius: 8px;
      padding: 12px 18px;
      background: var(--brand);
      color: #fff;
      font-weight: 800;
      font-size: 15px;
      text-decoration: none;
      cursor: pointer;
    }
    button:hover, a.button:hover { background: var(--brand-dark); }
    .secondary { background: #344054; }
    .secondary:hover { background: #182230; }
    .note { margin-top: 14px; padding: 12px 14px; border-radius: 8px; border: 1px solid #fedf89; background: #fffaeb; color: var(--amber); font-size: 14px; }
    .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 20px; }
    .step { padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .step-num { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; background: #e6f1fb; color: var(--brand-dark); font-weight: 800; font-size: 13px; margin-bottom: 8px; }
    .step-title { font-weight: 800; margin-bottom: 4px; }
    .step small { color: var(--muted); line-height: 1.4; display: block; }
    .result-head { padding: 24px 26px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .result-body { padding: 24px 26px 28px; }
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; font-weight: 800; font-size: 14px; }
    .status.success { background: #ecfdf3; color: var(--green); }
    .status.failed { background: #fef3f2; color: var(--red); }
    table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { border-bottom: 1px solid var(--line); padding: 13px 14px; text-align: left; vertical-align: top; word-break: break-word; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    th { width: 34%; background: #f3f6fa; color: #344054; font-size: 14px; }
    td { font-weight: 700; }
    .success { color: var(--green); }
    .failed { color: var(--red); }
    .muted { color: var(--muted); }
    @media (max-width: 820px) {
      main { padding: 18px 14px 32px; }
      .topbar, .result-head { align-items: flex-start; flex-direction: column; }
      .hero { grid-template-columns: 1fr; }
      .intro, .payment-card, .result-body, .result-head { padding: 20px; }
      h1 { font-size: 28px; }
      .steps { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 520px) {
      .steps { grid-template-columns: 1fr; }
      th, td { display: block; width: 100%; }
      th { border-bottom: 0; padding-bottom: 4px; }
      td { padding-top: 4px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div class="brand"><div class="logo">VN</div><div>VNPAY Sandbox Demo</div></div>
      <div class="badge">Merchant: ${config.tmnCode}</div>
    </div>
    ${body}
  </main>
</body>
</html>`;
}

function sendHtml(res, title, body, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(htmlPage(title, body));
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(body))));
  });
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded || req.socket.remoteAddress || "127.0.0.1").split(",")[0];
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  return ip;
}

function createPaymentUrl(amount, req) {
  const now = new Date();
  const orderId = `${Date.now()}`;
  const normalizedAmount = Math.round(Number(amount));

  orders.set(orderId, {
    orderId,
    amount: normalizedAmount,
    status: "PENDING",
    createdAt: now.toISOString()
  });

  const params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: normalizedAmount * 100,
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: getClientIp(req),
    vnp_CreateDate: formatDate(now)
  };

  const sorted = sortObject(params);
  sorted.vnp_SecureHash = createSecureHash(sorted);
  return `${config.vnpUrl}?${stringifyParams(sorted)}`;
}

function createDemoReturnUrl(amount) {
  const now = new Date();
  const orderId = `DEMO${Date.now()}`;
  const normalizedAmount = Math.round(Number(amount));

  orders.set(orderId, {
    orderId,
    amount: normalizedAmount,
    status: "PENDING",
    createdAt: now.toISOString()
  });

  const params = {
    vnp_Amount: normalizedAmount * 100,
    vnp_BankCode: "NCB",
    vnp_BankTranNo: `DEMO${Date.now()}`,
    vnp_CardType: "ATM",
    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
    vnp_PayDate: formatDate(now),
    vnp_ResponseCode: "00",
    vnp_TmnCode: config.tmnCode,
    vnp_TransactionNo: `${Math.floor(10000000 + Math.random() * 90000000)}`,
    vnp_TransactionStatus: "00",
    vnp_TxnRef: orderId
  };

  const sorted = sortObject(params);
  sorted.vnp_SecureHash = createSecureHash(sorted);
  return `/return?${stringifyParams(sorted)}`;
}

function importantRows(params) {
  const labels = {
    vnp_TxnRef: "Mã đơn hàng",
    vnp_Amount: "Số tiền",
    vnp_BankCode: "Ngân hàng thanh toán",
    vnp_TransactionNo: "Mã giao dịch VNPAY",
    vnp_PayDate: "Thời gian thanh toán",
    vnp_ResponseCode: "Mã phản hồi",
    vnp_TransactionStatus: "Trạng thái giao dịch",
    vnp_OrderInfo: "Nội dung thanh toán"
  };

  return Object.entries(labels)
    .filter(([key]) => params[key])
    .map(([key, label]) => {
      const value = key === "vnp_Amount" ? `${Number(params[key]) / 100} VND` : params[key];
      return `<tr><th>${label}</th><td>${value}</td></tr>`;
    })
    .join("");
}

function importantRowsPretty(params) {
  const labels = {
    vnp_TxnRef: "Mã đơn hàng",
    vnp_Amount: "Số tiền",
    vnp_BankCode: "Ngân hàng thanh toán",
    vnp_TransactionNo: "Mã giao dịch VNPAY",
    vnp_PayDate: "Thời gian thanh toán",
    vnp_ResponseCode: "Mã phản hồi",
    vnp_TransactionStatus: "Trạng thái giao dịch",
    vnp_OrderInfo: "Nội dung thanh toán"
  };

  return Object.entries(labels)
    .filter(([key]) => params[key])
    .map(([key, label]) => {
      const value = key === "vnp_Amount" ? `${(Number(params[key]) / 100).toLocaleString("vi-VN")} đ` : params[key];
      return `<tr><th>${label}</th><td>${value}</td></tr>`;
    })
    .join("");
}

function renderResult(params, validHash, success, statusClass, message) {
  return `
    <section class="panel">
      <div class="result-head">
        <div>
          <h1 class="${statusClass}">${message}</h1>
          <p class="lead">Hệ thống đã nhận dữ liệu trả về từ VNPAY và kiểm tra chữ ký bảo mật.</p>
        </div>
        <div class="status ${statusClass}">${success ? "ĐÃ THANH TOÁN" : "KHÔNG THÀNH CÔNG"}</div>
      </div>
      <div class="result-body">
        <p class="muted">Xác thực SecureHash: <strong>${validHash ? "Hợp lệ" : "Không hợp lệ"}</strong></p>
        <table>${importantRowsPretty(params)}</table>
        <a class="button" href="/">Tạo giao dịch mới</a>
      </div>
    </section>
  `;
}

function renderHome(usingDemoConfig) {
  return `
    <section class="hero">
      <div class="panel intro">
        <h1>Thanh toán đơn hàng qua VNPAY</h1>
        <p class="lead">Demo tích hợp Payment URL, SecureHash, Return URL và IPN webhook trên môi trường sandbox.</p>
        ${usingDemoConfig ? "<div class=\"note\">Đang dùng cấu hình placeholder. Hãy điền TmnCode và HashSecret sandbox trong file .env để thanh toán thật.</div>" : "<div class=\"note\">Đã cấu hình merchant sandbox. Có thể bấm thanh toán để chuyển sang cổng VNPAY.</div>"}
        <div class="steps">
          <div class="step"><div class="step-num">1</div><div class="step-title">Tạo đơn</div><small>Nhập số tiền và tạo yêu cầu thanh toán.</small></div>
          <div class="step"><div class="step-num">2</div><div class="step-title">Redirect</div><small>Backend ký HMAC SHA512 rồi chuyển sang VNPAY.</small></div>
          <div class="step"><div class="step-num">3</div><div class="step-title">Thẻ test</div><small>Chọn NCB và nhập OTP sandbox.</small></div>
          <div class="step"><div class="step-num">4</div><div class="step-title">Kết quả</div><small>Website xác thực hash và hiển thị dữ liệu trả về.</small></div>
        </div>
      </div>
      <div class="panel payment-card">
        <h2>Thông tin thanh toán</h2>
        <form method="post" action="/create-payment">
          <label for="amount">Số tiền thanh toán</label>
          <div class="input-wrap">
            <input id="amount" name="amount" type="number" min="10000" step="1000" value="100000" required>
            <span class="currency">VND</span>
          </div>
          <div class="actions">
            <button type="submit">Thanh toán qua VNPAY</button>
          </div>
        </form>
        <form method="post" action="/simulate-payment">
          <input name="amount" type="hidden" value="100000">
          <div class="actions">
            <button class="secondary" type="submit">Xem kết quả giả lập local</button>
          </div>
        </form>
        <p class="muted">Thẻ test NCB: 9704198526191432198, OTP: 123456.</p>
      </div>
    </section>
  `;
}

function handleReturn(req, res, url) {
  const params = Object.fromEntries(url.searchParams.entries());
  const validHash = verifyVnpayHash(params);
  const order = orders.get(params.vnp_TxnRef);
  const validMerchant = params.vnp_TmnCode === config.tmnCode;
  const validAmount = order && order.amount * 100 === Number(params.vnp_Amount);
  const success = Boolean(
    validHash &&
    validMerchant &&
    order &&
    validAmount &&
    params.vnp_ResponseCode === "00" &&
    params.vnp_TransactionStatus === "00"
  );

  if (success) {
    order.status = "PAID";
    order.vnpTransactionNo = params.vnp_TransactionNo;
  }

  const statusClass = success ? "success" : "failed";
  return sendHtml(res, "Kết quả thanh toán", renderResult(params, validHash, success, statusClass, success ? "Thanh toán thành công" : "Giao dịch thất bại"));
}

function handleIpn(res, url) {
  const params = Object.fromEntries(url.searchParams.entries());
  const validHash = verifyVnpayHash(params);
  if (!validHash) return sendJson(res, { RspCode: "97", Message: "Invalid signature" });
  if (params.vnp_TmnCode !== config.tmnCode) return sendJson(res, { RspCode: "03", Message: "Invalid merchant" });

  const order = orders.get(params.vnp_TxnRef);
  if (!order) return sendJson(res, { RspCode: "01", Message: "Order not found" });
  if (order.amount * 100 !== Number(params.vnp_Amount)) return sendJson(res, { RspCode: "04", Message: "Invalid amount" });
  if (order.status === "PAID") return sendJson(res, { RspCode: "02", Message: "Order already confirmed" });

  if (params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00") {
    order.status = "PAID";
    order.vnpTransactionNo = params.vnp_TransactionNo;
    return sendJson(res, { RspCode: "00", Message: "Confirm success" });
  }

  order.status = "FAILED";
  return sendJson(res, { RspCode: "00", Message: "Confirm failed transaction" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    const usingDemoConfig = config.tmnCode === "DEMO_TMN_CODE" || config.hashSecret === "DEMO_HASH_SECRET";
    return sendHtml(res, "Thanh toán VNPAY", renderHome(usingDemoConfig));
  }

  if (req.method === "POST" && url.pathname === "/create-payment") {
    const body = await parseBody(req);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 10000) {
      return sendHtml(res, "Lỗi", "<h1 class=\"failed\">Số tiền không hợp lệ</h1>", 400);
    }
    res.writeHead(302, { Location: createPaymentUrl(amount, req) });
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/simulate-payment") {
    const body = await parseBody(req);
    const amount = Number(body.amount || 100000);
    res.writeHead(302, { Location: createDemoReturnUrl(amount) });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/return") return handleReturn(req, res, url);
  if (req.method === "GET" && url.pathname === "/ipn") return handleIpn(res, url);

  return sendHtml(res, "404", "<h1>Không tìm thấy trang</h1>", 404);
});

server.listen(config.port, () => {
  console.log(`VNPAY demo running at http://localhost:${config.port}`);
});
