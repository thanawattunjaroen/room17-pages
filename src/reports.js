import { state, saveState } from "./store.js";
import { buildReport, localDate } from "./finance.js";
import { downloadReportPdf } from "./report-pdf.js";
import { $, escapeHtml, showToast } from "./utils.js";

const formatMoney = (value) =>
  Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function renderReportsPage(content) {
  const today = localDate(new Date().toISOString());
  content.innerHTML = `<div class="heading"><div><div class="eyebrow">REPORTS</div><h1>รายรับ / รายจ่าย</h1>
    <p>รายรับตามวันที่รับชำระเงินจริง และรายจ่ายที่บันทึก</p></div></div>
    <div class="toolbar">
      <label>รูปแบบ<select id="report-mode"><option value="month">รายเดือน</option><option value="year">รายปี</option></select></label>
      <label>เดือน / ปี<input id="report-period" type="month" value="${today.slice(0, 7)}" required /></label>
      <button class="secondary" id="report-pdf">ส่งออก PDF</button>
      <button class="primary" id="expense-add">＋ บันทึกรายจ่าย</button>
    </div>
    <p class="note">รายรับรวมเฉพาะบิลที่บันทึกชำระเต็มยอดแล้ว ตามวันที่รับชำระเวลาไทย รวมบิลในถังขยะที่ยังมีสถานะชำระแล้ว
    การยกเลิกชำระหรือแก้ยอดจนยกเลิกชำระจะนำยอดนั้นออกจากรายงาน</p>
    <div id="report-result"></div>`;
  $("#report-mode").onchange = () => {
    const yearly = $("#report-mode").value === "year";
    const previous = $("#report-period").value;
    $("#report-period").type = yearly ? "number" : "month";
    $("#report-period").min = yearly ? "1900" : "1900-01";
    $("#report-period").max = yearly ? "9999" : "9999-12";
    $("#report-period").value = yearly ? previous.slice(0, 4) : `${previous}-01`;
    renderReport();
  };
  $("#report-period").onchange = renderReport;
  $("#expense-add").onclick = () => openExpenseDialog();
  $("#report-pdf").onclick = async () => {
    const button = $("#report-pdf");
    button.disabled = true;
    try {
      await saveState();
      await downloadReportPdf(
        buildReport(state, $("#report-mode").value, $("#report-period").value),
        structuredClone(state.settings),
      );
      showToast("สร้างรายงาน PDF แล้ว");
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  };
  renderReport();
}

function renderReport() {
  let report;
  try {
    report = buildReport(state, $("#report-mode").value, $("#report-period").value);
  } catch (error) {
    $("#report-result").textContent = error.message;
    return;
  }
  const e = escapeHtml;
  $("#report-result").innerHTML = `
    <div class="stats">${[
      ["รายรับจริง", report.received],
      ["รายจ่าย", report.spent],
      ["คงเหลือสุทธิ", report.net],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat"><label>${label}</label><strong>฿ ${formatMoney(value)}</strong></div>`,
      )
      .join("")}</div>
    ${report.missingDates ? `<p class="note">มีบิลชำระแล้ว ${report.missingDates} ใบที่ไม่มีวันที่รับชำระ จึงยังไม่รวมในรายงาน เติมวันที่ได้ที่ บิลและการชำระเงิน → แก้ไขบิล</p>` : ""}
    <div class="panel"><h2>สรุปยอดรายเดือน</h2><table><thead><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th><th>สุทธิ</th></tr></thead><tbody>
      ${report.months.map((row) => `<tr><td>${row.month}</td><td>${formatMoney(row.income)}</td><td>${formatMoney(row.expenses)}</td><td>${formatMoney(row.net)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="panel"><h2>รายการรับชำระ</h2><table><thead><tr><th>วันที่รับเงิน</th><th>ใบเสร็จเลขที่</th><th>รายการ</th><th>จำนวนเงิน</th></tr></thead><tbody>
      ${report.income.map((row) => `<tr><td>${row.date}</td><td>${e(row.number)}</td><td>${e(row.description)}</td><td>${formatMoney(row.amount)}</td></tr>`).join("") || `<tr><td colspan="4">ไม่มีรายรับในช่วงนี้</td></tr>`}
    </tbody></table></div>
    <div class="panel"><h2>รายการจ่าย</h2><table><thead><tr><th>วันที่จ่าย</th><th>หมวดหมู่</th><th>รายการ</th><th>จำนวนเงิน</th><th>จัดการ</th></tr></thead><tbody>
      ${report.expenses.map((row) => `<tr><td>${row.date}</td><td>${e(row.category)}</td><td>${e(row.description)}</td><td>${formatMoney(row.amount)}</td><td><button class="secondary" data-edit-expense="${e(row.id)}">แก้ไข</button> <button class="secondary danger" data-delete-expense="${e(row.id)}">ลบ</button></td></tr>`).join("") || `<tr><td colspan="5">ไม่มีรายจ่ายในช่วงนี้</td></tr>`}
    </tbody></table></div>`;
  document
    .querySelectorAll("[data-edit-expense]")
    .forEach((button) => (button.onclick = () => openExpenseDialog(button.dataset.editExpense)));
  document.querySelectorAll("[data-delete-expense]").forEach(
    (button) =>
      (button.onclick = async () => {
        if (!confirm("ลบรายจ่ายรายการนี้?")) return;
        try {
          state.expenses = state.expenses.filter(
            (item) => item.id !== button.dataset.deleteExpense,
          );
          await saveState();
          renderReport();
        } catch (error) {
          showToast(error.message);
        }
      }),
  );
}

function openExpenseDialog(id) {
  const item = state.expenses?.find((expense) => expense.id === id);
  const date = localDate(new Date().toISOString());
  const e = escapeHtml;
  const dialog = $("#modal");
  dialog.innerHTML = `<form id="expense-form"><h2>${item ? "แก้ไข" : "บันทึก"}รายจ่าย</h2>
    <label>วันที่จ่าย<input name="date" type="date" required value="${e(item?.date || date)}" /></label>
    <label>หมวดหมู่<input name="category" required maxlength="80" placeholder="เช่น ซ่อมบำรุง ค่าน้ำ ค่าไฟ" value="${e(item?.category || "")}" /></label>
    <label>รายการ<input name="description" required maxlength="300" value="${e(item?.description || "")}" /></label>
    <label>จำนวนเงิน (บาท)<input name="amount" type="number" min="0.01" step="0.01" required value="${item?.amount ?? ""}" /></label>
    <div class="actions"><button type="button" class="secondary" id="expense-cancel">ยกเลิก</button><button class="primary">บันทึก</button></div></form>`;
  $("#expense-cancel").onclick = () => dialog.close();
  $("#expense-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const expense = {
      id: item?.id || crypto.randomUUID(),
      date: form.get("date"),
      category: form.get("category").trim(),
      description: form.get("description").trim(),
      amount: Math.round(Number(form.get("amount")) * 100) / 100,
    };
    if (
      !expense.category ||
      !expense.description ||
      !Number.isFinite(expense.amount) ||
      expense.amount <= 0
    )
      return showToast("กรุณากรอกรายจ่ายให้ครบและจำนวนเงินมากกว่า 0");
    try {
      state.expenses ??= [];
      if (item) state.expenses[state.expenses.findIndex((row) => row.id === item.id)] = expense;
      else state.expenses.push(expense);
      await saveState();
      dialog.close();
      renderReport();
      showToast("บันทึกรายจ่ายแล้ว");
    } catch (error) {
      showToast(error.message);
    }
  };
  dialog.showModal();
}
