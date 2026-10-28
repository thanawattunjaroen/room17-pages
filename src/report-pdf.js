import { jpegPagesToPdf } from "./bill-pdf.js";

const money = (value) =>
  Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function createReportPdf(report, settings) {
  await document.fonts?.ready;
  const sourceRows = [
    { heading: "สรุปยอดรายเดือน (รายรับ / รายจ่าย / สุทธิ)" },
    ...report.months.map((row) => ({
      description: `${row.month}   รับ ${money(row.income)}   จ่าย ${money(row.expenses)}`,
      amount: row.net,
    })),
    { heading: "รายรับจริง (วันที่ / เลขใบเสร็จ / รายการ / บาท)" },
    ...(report.income.length
      ? report.income.map((row) => ({
          ...row,
          description: `${row.date}  ${row.number}  ${row.description}`,
        }))
      : [{ description: "ไม่มีรายรับในช่วงนี้" }]),
    { heading: "รายจ่าย (วันที่ / หมวดหมู่ / รายการ / บาท)" },
    ...(report.expenses.length
      ? report.expenses.map((row) => ({
          ...row,
          description: `${row.date}  ${row.category}  ${row.description}`,
        }))
      : [{ description: "ไม่มีรายจ่ายในช่วงนี้" }]),
  ];
  const pageSize = 23;
  const measuring = document.createElement("canvas").getContext("2d");
  measuring.font = '400 22px "Noto Sans Thai", Tahoma, sans-serif';
  const rows = [];
  for (const row of sourceRows) {
    if (row.heading) {
      if (rows.length % pageSize === pageSize - 1) rows.push({ description: "" });
      rows.push(row);
      continue;
    }
    let line = "";
    let first = true;
    for (const character of row.description) {
      if (line && measuring.measureText(line + character).width > 810) {
        rows.push({ description: line, amount: first ? row.amount : undefined });
        line = "";
        first = false;
      }
      line += character;
    }
    rows.push({ description: line, amount: first ? row.amount : undefined });
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pages = [];
  for (let page = 0; page < totalPages; page++) {
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const context = canvas.getContext("2d");
    if (!context) throw Error("เบราว์เซอร์ไม่รองรับการสร้างรายงาน");
    const text = (value, x, y, size = 24, bold = false, align = "left", width = 1060) => {
      context.textAlign = align;
      context.fillStyle = "#293b32";
      do {
        context.font = `${bold ? 700 : 400} ${size}px "Noto Sans Thai", Tahoma, sans-serif`;
        if (context.measureText(String(value)).width <= width || size <= 12) break;
        size--;
      } while (true);
      context.fillText(String(value), x, y);
    };
    context.fillStyle = "white";
    context.fillRect(0, 0, 1240, 1754);
    text(settings.name, 90, 110, 34, true);
    text(
      `รายงานรายรับ / รายจ่าย ${report.mode === "year" ? "ปี" : "เดือน"} ${report.period}`,
      90,
      168,
      30,
      true,
    );
    text("รายรับนับตามวันที่รับชำระ (เวลาไทย) · ยอดสุทธิ = รายรับ - รายจ่ายที่บันทึก", 90, 213, 21);
    text(`รายรับจริง ${money(report.received)} บาท`, 90, 278, 27, true);
    text(`รายจ่าย ${money(report.spent)} บาท`, 90, 325, 27, true);
    text(`คงเหลือสุทธิ ${money(report.net)} บาท`, 90, 372, 27, true);
    if (report.missingDates)
      text(
        `มีบิลชำระแล้ว ${report.missingDates} ใบที่ไม่มีวันที่รับชำระ จึงยังไม่รวมในรายงาน`,
        90,
        416,
        21,
      );
    rows.slice(page * pageSize, (page + 1) * pageSize).forEach((row, index) => {
      const y = 490 + index * 49;
      if (row.heading) {
        context.fillStyle = "#edf3ec";
        context.fillRect(90, y - 31, 1060, 43);
        text(row.heading, 105, y, 23, true);
      } else {
        text(row.description, 105, y, 22, false, "left", 820);
        if (row.amount !== undefined) text(money(row.amount), 1135, y, 23, false, "right", 185);
      }
    });
    text(`${page + 1} / ${totalPages}`, 1150, 1680, 20, false, "right");
    const jpeg = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("สร้างภาพรายงานไม่สำเร็จ"))),
        "image/jpeg",
        0.96,
      ),
    );
    pages.push({
      bytes: new Uint8Array(await jpeg.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return jpegPagesToPdf(pages);
}

export async function downloadReportPdf(report, settings) {
  const pdf = await createReportPdf(report, settings);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Report-${report.mode}-${report.period}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
