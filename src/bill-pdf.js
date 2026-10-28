import { RECEIPT_DEFAULTS, thaiBahtText } from "./receipt-template.js";
// Render Thai text with the browser's font engine, then package the page as an A4 PDF.
// This needs no external PDF service, API key, or additional runtime package.
const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const currency = (value) =>
  Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function thaiDate(value) {
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime())
    ? String(value || "-")
    : date.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export function renderBillCanvas(
  bill,
  settings,
  canvas = document.createElement("canvas"),
  signature = null,
  documentType = bill.paid ? "receipt" : "bill",
) {
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw Error("เบราว์เซอร์นี้ไม่รองรับการสร้าง PDF");
  const details = { ...RECEIPT_DEFAULTS, ...settings };
  const isReceipt = documentType === "receipt";
  const left = 90,
    right = 1150;
  const ink = "#293b32",
    muted = "#67756d",
    green = "#426b51";
  function text(
    value,
    x,
    y,
    { size = 25, bold = false, color = ink, align = "left", maxWidth = 1060 } = {},
  ) {
    const string = String(value ?? "-");
    context.textAlign = align;
    context.textBaseline = "alphabetic";
    context.fillStyle = color;
    while (size > 12) {
      context.font = `${bold ? "700" : "400"} ${size}px "Noto Sans Thai", Tahoma, sans-serif`;
      if (context.measureText(string).width <= maxWidth) break;
      size--;
    }
    context.fillText(string, x, y);
  }
  function line(y, x1 = left, x2 = right) {
    context.strokeStyle = "#d6ded7";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x1, y);
    context.lineTo(x2, y);
    context.stroke();
  }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.fillStyle = green;
  context.fillRect(left, 85, 12, 133);
  // Align the property name with the document title in the opposite column.
  text(settings.name, left + 35, 124, { size: 36, bold: true, maxWidth: 580 });
  // Keep the address within the left header column, with space for the phone below.
  context.font = '400 20px "Noto Sans Thai", Tahoma, sans-serif';
  const addressLines = [""];
  for (const word of String(details.receiptAddress || "-")
    .trim()
    .split(/\s+/)) {
    const index = addressLines.length - 1;
    const candidate = [addressLines[index], word].filter(Boolean).join(" ");
    if (index === 0 && addressLines[index] && context.measureText(candidate).width > 580) {
      addressLines.push(word);
    } else {
      addressLines[index] = candidate;
    }
  }
  addressLines.forEach((value, index) =>
    text(value, left + 35, 158 + index * 26, { size: 20, color: muted, maxWidth: 580 }),
  );
  text(`โทร. ${details.receiptPhone || "-"}`, left + 35, 212, {
    size: 20,
    color: muted,
    maxWidth: 580,
  });
  text(isReceipt ? "ใบเสร็จรับเงิน" : "บิลเรียกเก็บเงิน", right, 124, {
    size: 36,
    bold: true,
    align: "right",
    maxWidth: 390,
  });
  text(isReceipt ? "ชำระแล้ว" : "ยังไม่ชำระเงิน", right, 168, {
    size: 22,
    color: muted,
    align: "right",
  });
  line(240);
  text("ห้องพัก", left, 267, { size: 21, color: muted });
  text(bill.number, left, 320, { size: 42, bold: true, maxWidth: 450 });
  text("รอบบิล", 730, 267, { size: 21, color: muted });
  text(thaiDate(bill.period + "-01").replace(/^1\s/, ""), 730, 311, {
    size: 28,
    bold: true,
    maxWidth: 420,
  });
  text("ผู้เช่า", left, 380, { size: 21, color: muted });
  text(bill.tenant || "-", left, 427, { size: 30, bold: true });
  text(`วันที่ออกเอกสาร: ${thaiDate(bill.due)}`, left, 484, { size: 24, maxWidth: 650 });
  const documentNumber =
    (isReceipt ? bill.receiptNo : bill.billNo) || `${bill.number}-${bill.period}`;
  text(`${isReceipt ? "ใบเสร็จเลขที่" : "บิลเลขที่"}: ${documentNumber}`, right, 484, {
    size: 20,
    color: muted,
    align: "right",
    maxWidth: 380,
  });
  context.fillStyle = "#edf3ec";
  context.fillRect(left, 535, right - left, 68);
  text("รายการ", left + 22, 579, { size: 24, bold: true });
  text("จำนวนเงิน (บาท)", right - 22, 579, { size: 24, bold: true, align: "right" });
  const rows = [
    { label: "ค่าเช่าห้องพักรายเดือน", amount: bill.rent, detail: "" },
    {
      label: "ค่าน้ำประปา",
      amount: bill.water,
      detail:
        Number.isFinite(bill.waterUnits) && Number.isFinite(bill.rates?.water)
          ? `${bill.waterUnits} หน่วย × ${currency(bill.rates.water)} บาท`
          : "ตามยอดที่บันทึกในบิล",
    },
    {
      label: "ค่าไฟฟ้า",
      amount: bill.electric,
      detail:
        Number.isFinite(bill.electricUnits) && Number.isFinite(bill.rates?.electric)
          ? `${bill.electricUnits} หน่วย × ${currency(bill.rates.electric)} บาท`
          : "ตามยอดที่บันทึกในบิล",
    },
  ];
  rows.forEach((row, index) => {
    const y = 658 + index * 120;
    text(row.label, left + 22, y, { size: 28 });
    text(currency(row.amount), right - 22, y, { size: 29, bold: true, align: "right" });
    if (row.detail) text(row.detail, left + 22, y + 40, { size: 22, color: muted });
    line(y + 75);
  });
  context.fillStyle = green;
  context.fillRect(left, 1020, right - left, 100);
  text("ยอดรวมทั้งสิ้น", left + 24, 1083, { size: 28, bold: true, color: "#fff" });
  text(`${currency(bill.total)} บาท`, right - 24, 1083, {
    size: 38,
    bold: true,
    color: "#fff",
    align: "right",
    maxWidth: 680,
  });
  text(thaiBahtText(bill.total), right, 1163, { size: 22, color: muted, align: "right" });
  text("สถานะการชำระเงิน", left, 1220, { size: 22, color: muted });
  text(isReceipt ? "ชำระแล้ว" : "ยังไม่ชำระเงิน", left, 1265, {
    size: 29,
    bold: true,
    color: isReceipt ? green : "#9b6b34",
  });
  text(`ผู้รับเงิน: ${details.receiptReceiver || "-"}`, left, 1340, { size: 24, maxWidth: 1060 });
  text(`เลขประจำตัวผู้เสียภาษี: ${details.receiptTaxId || "-"}`, left, 1385, { size: 24 });
  // Preserve the image aspect ratio inside the signing area.
  if (isReceipt && signature && !settings.receiptSignatureDisabled) {
    const scale = Math.min(330 / signature.width, 115 / signature.height);
    const width = signature.width * scale,
      height = signature.height * scale;
    context.drawImage(signature, 930 - width / 2, 1458 + (115 - height) / 2, width, height);
  }
  line(1575, 725, right);
  text("ลงชื่อผู้รับเงิน", left, 1575, { size: 23, color: muted });
  text(`( ${details.receiptReceiver || "................................"} )`, 938, 1620, {
    size: 23,
    align: "center",
    maxWidth: 425,
  });
  text("1 / 1", right, 1680, { size: 19, color: muted, align: "right" });
  return canvas;
}

// Minimal PDF container with a single JPEG page. Offsets count binary bytes, not characters.
export function jpegToPdf(jpegBytes, width = PAGE_WIDTH, height = PAGE_HEIGHT) {
  return jpegPagesToPdf([{ bytes: jpegBytes, width, height }]);
}

export function jpegPagesToPdf(pages) {
  if (!pages.length) throw Error("ไม่มีหน้ารายงาน");
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (number, body) => {
    offsets[number] = length;
    append(`${number} 0 obj\n${body}\nendobj\n`);
  };
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  pages.forEach(({ bytes: jpegBytes, width, height }, index) => {
    const pageObject = 3 + index * 3;
    object(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /BillImage ${pageObject + 1} 0 R >> >> /Contents ${pageObject + 2} 0 R >>`,
    );
    offsets[pageObject + 1] = length;
    append(
      `${pageObject + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    );
    append(jpegBytes);
    append("\nendstream\nendobj\n");
    const drawing = "q\n595.28 0 0 841.89 0 0 cm\n/BillImage Do\nQ\n";
    object(
      pageObject + 2,
      `<< /Length ${encoder.encode(drawing).length} >>\nstream\n${drawing}endstream`,
    );
  });
  const objectCount = 3 + pages.length * 3;
  const xref = length;
  append(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let number = 1; number < objectCount; number++)
    append(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}

export async function createBillPdf(bill, settings, documentType) {
  await document.fonts?.ready;
  const resolvedType = documentType ?? (bill.paid ? "receipt" : "bill");
  const signatureSource =
    settings.receiptSignature ||
    (document.querySelector('meta[name="roomwise-storage"]')?.content === "browser"
      ? null
      : new URL("../assets/receipt-signature.png", import.meta.url).href);
  const signature =
    resolvedType !== "receipt" || settings.receiptSignatureDisabled || !signatureSource
      ? null
      : await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(Error("โหลดลายเซ็นไม่สำเร็จ กรุณาโหลดหน้าใหม่"));
          image.src = signatureSource;
        });
  const canvas = renderBillCanvas(
    bill,
    settings,
    document.createElement("canvas"),
    signature,
    resolvedType,
  );
  const jpeg = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("สร้างภาพบิลไม่สำเร็จ"))),
      "image/jpeg",
      0.96,
    ),
  );
  return jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()));
}

export async function downloadBillPdf(
  bill,
  settings,
  documentType = bill.paid ? "receipt" : "bill",
) {
  const pdf = await createBillPdf(structuredClone(bill), structuredClone(settings), documentType);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  const roomNumber = String(bill.number).replace(/[^\p{L}\p{N}_-]/gu, "_");
  link.href = url;
  link.download = `Roomwise-${documentType}-${roomNumber}-${bill.period}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
