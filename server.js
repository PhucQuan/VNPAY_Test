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
    body { margin: 0; font-family: Arial, sans-serif; background: #f5f7fb; color: #172033; }
    main { max-width: 860px; margin: 48px auto; padding: 0 20px; }
    section { background: #fff; border: 1px solid #d9e1ec; border-radius: 8px; padding: 28px; box-shadow: 0 10px 30px rgba(16, 24, 40, .08); }
    h1 { margin: 0 0 16px; font-size: 28px; }
    label { display: block; margin-bottom: 8px; font-weight: 700; }
    input { width: 100%; padding: 12px 14px; border: 1px solid #bac7d6; border-radius: 6px; font-size: 16px; }
    button, a.button { display: inline-block; margin-top: 18px; border: 0; border-radius: 6px; padding: 12px 18px; background: #0f766e; color: #fff; font-weight: 700; text-decoration: none; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; background: #fff; }
    th, td { border: 1px solid #d9e1ec; padding: 10px 12px; text-align: left; vertical-align: top; word-break: break-word; }
    th { width: 32%; background: #eef4f8; }
    .success { color: #047857; }
    .failed { color: #b42318; }
    .muted { color: #667085; }
  </style>
</head>
<body><main><section>${body}</section></main></body>
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
  const message = success ? "Thanh toán thành công" : "Giao dịch thất bại";
  sendHtml(res, "Kết quả thanh toán", `
    <h1 class="${statusClass}">${message}</h1>
    <p class="muted">Xác thực chữ ký: ${validHash ? "Hợp lệ" : "Không hợp lệ"}</p>
    <table>${importantRows(params)}</table>
    <a class="button" href="/">Tạo giao dịch mới</a>
  `);
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
    return sendHtml(res, "Thanh toán VNPAY", `
      <h1>Demo thanh toán qua VNPAY</h1>
      ${usingDemoConfig ? "<p class=\"failed\">Bạn đang dùng cấu hình placeholder. VNPAY thật sẽ báo 'Không tìm thấy website' cho tới khi điền TmnCode và HashSecret sandbox hợp lệ trong file .env.</p>" : ""}
      <form method="post" action="/create-payment">
        <label for="amount">Số tiền thanh toán (VND)</label>
        <input id="amount" name="amount" type="number" min="10000" step="1000" value="100000" required>
        <button type="submit">Thanh toán qua VNPAY</button>
      </form>
      <form method="post" action="/simulate-payment">
        <input name="amount" type="hidden" value="100000">
        <button type="submit" style="background:#475467">Xem kết quả giả lập local</button>
      </form>
    `);
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
