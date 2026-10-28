import { RECEIPT_DEFAULTS } from "./receipt-template.js";
import { downloadBillPdf } from "./bill-pdf.js";
import { localDate } from "./finance.js";
import { renderReportsPage } from "./reports.js";
import { previousReading, calculateBill, reconcileRoomBills } from "./workflow.js";
import {
  state,
  saveState,
  replaceState,
  initializeStore,
  getLegacyData,
  ROOM_STATUS_LABELS,
  storageMode,
} from "./store.js";
import { $, formatMoney, escapeHtml, getCurrentMonth, showToast } from "./utils.js";

// Navigation and room filters are temporary UI state; they are not saved.
let page = "rooms";
let filter = "all";
let search = "";

function renderPageHeading(eyebrow, heading, description, action = "") {
  return /* HTML */ `<div class="heading">
    <div>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${heading}</h1>
      <p>${description}</p>
    </div>
    ${action}
  </div>`;
}
function renderSummaryCards() {
  const occupiedRooms = state.rooms.filter((room) => room.status === "occupied");
  const emptyRooms = state.rooms.filter((room) => room.status === "empty");
  const monthlyRent = occupiedRooms.reduce((total, room) => total + room.rent, 0);
  const cards = [
    { label: "ห้องพักทั้งหมด", value: state.rooms.length, description: "ห้องในโครงการ" },
    { label: "มีผู้เช่า", value: occupiedRooms.length, description: "ห้องที่กำลังพักอาศัย" },
    { label: "ห้องว่าง", value: emptyRooms.length, description: "พร้อมรับผู้เช่าใหม่" },
    {
      label: "ค่าเช่ารวม / เดือน",
      value: "฿ " + formatMoney(monthlyRent),
      description: "เฉพาะค่าเช่าห้องที่มีผู้เช่า",
    },
  ];
  return /* HTML */ `<div class="stats">
    ${cards
      .map(
        (card) => /* HTML */ `
          <div class="stat">
            <label>${card.label}</label>
            <strong>${card.value}</strong>
            <small>${card.description}</small>
          </div>
        `,
      )
      .join("")}
  </div>`;
}

// Entry point: update the shell, then render the selected page.
function renderApp() {
  document.querySelectorAll("nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  $(".property").innerHTML =
    `🏡 ${escapeHtml(state.settings.name)}<small>ระบบจัดการห้องพักรายเดือน</small>`;
  const content = $("#content");
  const pageRenderers = {
    rooms: renderRoomsPage,
    dashboard: renderDashboardPage,
    meters: renderMetersPage,
    bills: renderBillsPage,
    settings: renderSettingsPage,
    reports: renderReportsPage,
  };
  pageRenderers[page](content);
  content.insertAdjacentHTML(
    "afterbegin",
    storageMode === "browser"
      ? '<div class="test-banner">ข้อมูลเก็บเฉพาะเบราว์เซอร์นี้ · ไม่ซิงก์ข้ามเครื่อง · สำรองหรือย้ายข้อมูลผ่าน ตั้งค่า → ส่งออก / นำเข้า JSON</div>'
      : '<div class="test-banner">โหมดทดสอบ · ข้อมูลแก้ไขได้ · บิลเป็นฉบับร่าง · ข้อมูลเก็บในไฟล์โปรเจกต์ · commit / push เพื่อส่งไปอีกเครื่อง</div>',
  );
}

function renderRoomsPage(content) {
  content.innerHTML =
    renderPageHeading(
      "YOUR PROPERTY",
      "จัดการห้องพัก",
      "ทุกห้อง ทุกข้อมูล จัดการได้ในที่เดียว",
      '<button class="primary" id="add">＋ เพิ่มห้องพัก</button>',
    ) +
    renderSummaryCards() +
    /* HTML */ `<div class="toolbar">
        <div class="filters">
          ${[
            ["all", "ห้องทั้งหมด"],
            ["occupied", "มีผู้เช่า"],
            ["empty", "ห้องว่าง"],
            ["repair", "ซ่อมบำรุง"],
          ]
            .map(
              ([k, v]) =>
                /* HTML */ `<button
                  class="filter ${filter === k ? "active" : ""}"
                  data-filter="${k}"
                >
                  ${v}
                </button>`,
            )
            .join("")}
        </div>
        <input
          id="search"
          placeholder="ค้นหาห้อง หรือชื่อผู้เช่า…"
          value="${escapeHtml(search)}"
          aria-label="ค้นหาห้อง"
        />
      </div>
      <div class="room-grid" id="room-list"></div>`;
  renderRoomList();
  $("#add").onclick = async () => openRoomDialog();
  $("#search").oninput = (e) => {
    search = e.target.value;
    renderRoomList();
  };
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = async () => {
        filter = b.dataset.filter;
        renderApp();
      }),
  );
}

function renderDashboardPage(content) {
  content.innerHTML =
    renderPageHeading("AT A GLANCE", "ภาพรวม Roomwise", "พื้นที่เล็ก ๆ สำหรับดูแลทุกห้องของคุณ") +
    /* HTML */ `<div class="welcome">
      <h2>${escapeHtml(state.settings.name)}</h2>
      <p>
        ออกบิลวันที่ ${state.settings.billDay} ของทุกเดือน ·
        ${new Date().toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
      </p>
    </div>` +
    renderSummaryCards() +
    /* HTML */ `<div class="panel">
      <h2>การชำระเงินทั้งหมด</h2>
      <div class="bill-total">
        ฿ ${formatMoney(state.bills.filter((b) => !b.paid).reduce((s, b) => s + b.total, 0))}
      </div>
      <p>ยอดบิลค้างชำระ ${state.bills.filter((b) => !b.paid).length} รายการ</p>
    </div>`;
}

function renderSettingsPage(content) {
  content.innerHTML =
    renderPageHeading("PROPERTY SETTINGS", "ตั้งค่าหอพัก", "กำหนดอัตราค่าสาธารณูปโภคและรอบบิล") +
    /* HTML */ `<form id="settings-form" class="panel settings-form">
        <label
          >ชื่อหอพัก<input name="name" required value="${escapeHtml(state.settings.name)}"
        /></label>
        <div class="fields">
          <label
            >วันออกบิลทุกเดือน (1–28)<input
              name="billDay"
              type="number"
              min="1"
              max="28"
              required
              value="${state.settings.billDay}" /></label
          ><label
            >ค่าน้ำ / หน่วย<input
              name="water"
              type="number"
              min="0"
              step="0.01"
              required
              value="${state.settings.water}" /></label
          ><label
            >ค่าไฟ / หน่วย<input
              name="electric"
              type="number"
              min="0"
              step="0.01"
              required
              value="${state.settings.electric}"
          /></label>
        </div>
        <h2>ข้อมูลหัวใบเสร็จ</h2>
        ${Object.entries({
          receiptBusinessName: "ชื่อสถานประกอบการ",
          receiptAddress: "ที่อยู่สถานประกอบการ",
          receiptPhone: "โทรศัพท์สถานประกอบการ",
          receiptReceiver: "ชื่อผู้รับเงิน",
          receiptTaxId: "เลขผู้เสียภาษีผู้รับเงิน",
        })
          .map(
            ([name, label]) =>
              /* HTML */ `<label
                >${label}<input
                  name="${name}"
                  value="${escapeHtml(state.settings[name] ?? RECEIPT_DEFAULTS[name])}"
              /></label>`,
          )
          .join("")}
        <label
          >รูปลายเซ็นผู้รับเงิน (PNG / JPEG ไม่เกิน 1 MB)<input
            id="receipt-signature-file"
            type="file"
            accept="image/png,image/jpeg"
        /></label>
        <label
          ><span
            ><input
              type="checkbox"
              name="receiptSignatureDisabled"
              ${state.settings.receiptSignatureDisabled ? "checked" : ""}
            />
            ไม่แสดงลายเซ็นใน PDF</span
          ></label
        >
        <p class="note">
          ${storageMode === "browser" ? "แนบลายเซ็นแล้วกดบันทึก รูปจะเก็บในเบราว์เซอร์นี้และไฟล์สำรอง JSON" : "ใช้ลายเซ็นจากแบบที่ให้เป็นค่าเริ่มต้น หรือแนบลายเซ็นใหม่แล้วกดบันทึก"}
        </p>
        <p class="note">
          ใช้วันที่ 1–28 เพื่อให้มีวันออกบิลตรงกันได้ทุกเดือน บิลที่ออกแล้วจะคงอัตราเดิม
        </p>
        <button class="primary">บันทึกการตั้งค่า</button>
      </form>
      <div class="panel">
        <h2>${storageMode === "browser" ? "ข้อมูลในเบราว์เซอร์" : "ข้อมูลในโปรเจกต์"}</h2>
        <p class="note">
          ${
            storageMode === "browser"
              ? "ข้อมูลอยู่ในเบราว์เซอร์และเครื่องนี้เท่านั้น การล้างข้อมูลเว็บไซต์จะลบข้อมูลที่เก็บไว้ ควรส่งออก JSON สำรองเป็นประจำ การนำเข้าจะแทนที่ข้อมูลปัจจุบัน"
              : "ข้อมูลบันทึกลง data/roomwise.json · pull ก่อนเริ่มใช้งาน และ commit / push หลังใช้งาน การนำเข้าจะแทนที่ข้อมูลในไฟล์"
          }
        </p>
        <button class="secondary" id="migrate-browser">ย้ายข้อมูลเดิมจากเบราว์เซอร์นี้</button>
        <button class="secondary" id="export">ส่งออกข้อมูล JSON</button>
        <label class="secondary" style="display:inline-block;cursor:pointer"
          >นำเข้าข้อมูล<input type="file" id="import" accept="application/json" hidden
        /></label>
      </div>
      <div class="panel">
        <h2>เริ่มทดสอบใหม่</h2>
        <p class="note">
          ล้างห้อง มิเตอร์ และบิลทั้งหมด โดยเก็บสำเนาก่อนล้างไว้ให้กู้คืนได้หนึ่งครั้ง
          การตั้งค่าหอพักยังอยู่
        </p>
        <button class="secondary danger" id="reset-test">ล้างข้อมูลทดสอบ</button>
        <button class="secondary" id="undo-reset">กู้คืนก่อนล้าง</button
        ><button class="secondary" id="restore-room">กู้คืนห้องที่ลบล่าสุด</button>
      </div>`;
  $("#restore-room").onclick = async () => {
    const bundle = state.deletedRooms?.at(-1);
    if (!bundle) return showToast("ไม่มีห้องที่ลบให้กู้คืน");
    if (
      state.rooms.some((room) => room.id === bundle.room.id || room.number === bundle.room.number)
    )
      return showToast("มีหมายเลขห้องนี้อยู่แล้ว กรุณาแก้หมายเลขห้องปัจจุบันก่อน");
    if (!confirm(`กู้คืนห้อง ${bundle.room.number} พร้อมมิเตอร์และบิลเดิม?`)) return;
    state.rooms.push(bundle.room);
    Object.assign(state.meters, bundle.meters);
    state.bills.push(...bundle.bills);
    state.deletedRooms.pop();
    await saveState();
    renderApp();
    showToast("กู้คืนห้องแล้ว");
  };
  $("#reset-test").onclick = async () => {
    if (
      !confirm(
        "ล้างข้อมูลห้อง มิเตอร์ และบิลทั้งหมดเพื่อเริ่มทดสอบใหม่? สามารถกู้คืนก่อนล้างได้หนึ่งครั้ง",
      )
    )
      return;
    const { resetBackup, ...backup } = structuredClone(state);
    replaceState({
      rooms: [],
      meters: {},
      bills: [],
      deletedMeters: {},
      deletedBills: [],
      settings: state.settings,
      documentNumbers: state.documentNumbers || [],
      expenses: [],
      resetBackup: backup,
    });
    await saveState();
    renderApp();
    showToast("ล้างข้อมูลทดสอบแล้ว");
  };
  $("#undo-reset").onclick = async () => {
    if (!state.resetBackup) return showToast("ไม่มีข้อมูลก่อนล้างให้กู้คืน");
    if (!confirm("แทนที่ข้อมูลปัจจุบันด้วยข้อมูลก่อนล้าง?")) return;
    replaceState(structuredClone(state.resetBackup));
    await saveState();
    renderApp();
    showToast("กู้คืนข้อมูลแล้ว");
  };
  $("#settings-form").onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const signatureFile = $("#receipt-signature-file").files[0];
    let receiptSignature = state.settings.receiptSignature;
    if (signatureFile) {
      if (
        !["image/png", "image/jpeg"].includes(signatureFile.type) ||
        signatureFile.size > 1024 * 1024
      )
        return showToast("เลือกรูปลายเซ็น PNG / JPEG ไม่เกิน 1 MB");
      receiptSignature = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error("อ่านรูปลายเซ็นไม่สำเร็จ"));
        reader.readAsDataURL(signatureFile);
      });
    }
    state.settings = {
      ...state.settings,
      receiptSignature,
      receiptSignatureDisabled: formData.get("receiptSignatureDisabled") === "on",
      ...Object.fromEntries(
        Object.keys(RECEIPT_DEFAULTS).map((key) => [key, formData.get(key).trim()]),
      ),
      name: formData.get("name").trim(),
      billDay: +formData.get("billDay"),
      water: +formData.get("water"),
      electric: +formData.get("electric"),
    };
    await saveState();
    renderApp();
    showToast("บันทึกการตั้งค่าแล้ว");
  };
  $("#migrate-browser").onclick = async () => {
    const legacy = getLegacyData();
    if (!legacy)
      return showToast("ไม่พบข้อมูลเดิมที่ถูกต้องในเบราว์เซอร์นี้ ใช้นำเข้าไฟล์ JSON แทนได้");
    if (
      !confirm(
        `ย้ายข้อมูลเดิม ${legacy.rooms.length} ห้อง และ ${legacy.bills.length} บิล มาแทนที่ไฟล์ในโปรเจกต์? ข้อมูลเดิมในเบราว์เซอร์จะยังอยู่`,
      )
    )
      return;
    replaceState(structuredClone(legacy));
    await saveState();
    renderApp();
    showToast("ย้ายข้อมูลลงไฟล์แล้ว อย่าลืม commit / push");
  };
  $("#export").onclick = async () => {
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    downloadLink.download = "roomwise-backup.json";
    downloadLink.click();
    URL.revokeObjectURL(downloadLink.href);
  };
  $("#import").onchange = async (event) => {
    try {
      const importedState = JSON.parse(await event.target.files[0].text());
      if (
        !Array.isArray(importedState.rooms) ||
        !Array.isArray(importedState.bills) ||
        !importedState.settings ||
        !importedState.meters ||
        importedState.rooms.some(
          (room) =>
            !room.id ||
            !room.number ||
            !Number.isFinite(room.rent) ||
            !ROOM_STATUS_LABELS[room.status],
        ) ||
        !Number.isFinite(importedState.settings.billDay) ||
        importedState.settings.billDay < 1 ||
        importedState.settings.billDay > 28 ||
        !Number.isFinite(importedState.settings.water) ||
        !Number.isFinite(importedState.settings.electric)
      )
        throw Error();
      if (confirm("แทนที่ข้อมูลปัจจุบันด้วยไฟล์สำรองนี้?")) {
        replaceState(importedState);
        await saveState();
        renderApp();
        showToast("นำเข้าข้อมูลแล้ว");
      }
    } catch {
      showToast("ไฟล์ข้อมูลไม่ถูกต้อง");
    }
  };
}

function renderRoomList() {
  const list = state.rooms
    .filter(
      (room) =>
        (filter === "all" || room.status === filter) &&
        `${room.number} ${room.tenant}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, button) => a.number.localeCompare(button.number, undefined, { numeric: true }));
  $("#room-list").innerHTML = list.length
    ? list
        .map(
          (room) =>
            /* HTML */ `<article class="room">
              <div class="room-top">
                <div class="room-number">
                  ${escapeHtml(room.number)}<small
                    >ชั้น ${escapeHtml(room.floor)} · ${escapeHtml(room.type)}</small
                  >
                </div>
                <span class="badge ${room.status}">${ROOM_STATUS_LABELS[room.status]}</span>
              </div>
              <div class="room-body">
                <div class="tenant">
                  ${room.status === "occupied" ? "◯ " + escapeHtml(room.tenant) : "— ยังไม่มีผู้เช่า"}
                </div>
                <div class="details">
                  <div><small>ค่าเช่า / เดือน</small><b>฿ ${formatMoney(room.rent)}</b></div>
                  <div><small>รอบบิล</small><b>วันที่ ${state.settings.billDay}</b></div>
                </div>
              </div>
              <footer>
                <span>${room.phone ? escapeHtml(room.phone) : "ห้องพักรายเดือน"}</span
                ><button class="link" data-edit="${room.id}">ดูข้อมูลห้อง ↗</button>
              </footer>
            </article>`,
        )
        .join("")
    : '<div class="panel empty-state" style="grid-column:1/-1">ยังไม่มีห้องพักที่ตรงกับรายการ<br>เพิ่มห้องพักแรกเพื่อเริ่มจัดการหอพักของคุณ</div>';
  document
    .querySelectorAll("[data-edit]")
    .forEach((button) => (button.onclick = async () => openRoomDialog(button.dataset.edit)));
}
function openRoomDialog(id) {
  const room = state.rooms.find((roomData) => roomData.id === id) || {
    number: "",
    floor: 1,
    type: "ห้องมาตรฐาน",
    rent: 3000,
    status: "empty",
    tenant: "",
    phone: "",
    deposit: 0,
    start: "",
    water: 0,
    electric: 0,
  };
  const dialog = $("#modal");
  dialog.innerHTML = /* HTML */ `<form id="room-form">
    <h2>${id ? "ข้อมูลห้อง " + escapeHtml(room.number) : "เพิ่มห้องพัก"}</h2>
    <div class="fields">
      ${[
        ["number", "หมายเลขห้อง", "text"],
        ["floor", "ชั้น", "number"],
        ["type", "ประเภทห้อง", "text"],
        ["rent", "ค่าเช่ารายเดือน (บาท)", "number"],
      ]
        .map(
          ([field, t, type]) =>
            /* HTML */ `<label
              >${t}<input
                name="${field}"
                type="${type}"
                value="${escapeHtml(room[field])}"
                required
                ${type === "number" ? 'min="0" step="0.01"' : ""}
            /></label>`,
        )
        .join("")}<label
        >สถานะห้อง<select name="status">
          ${Object.entries(ROOM_STATUS_LABELS)
            .map(
              ([field, v]) =>
                /* HTML */ `<option value="${field}" ${room.status === field ? "selected" : ""}>
                  ${v}
                </option>`,
            )
            .join("")}
        </select></label
      ><label>ชื่อผู้เช่า<input name="tenant" value="${escapeHtml(room.tenant)}" /></label
      ><label>เบอร์โทร<input name="phone" type="tel" value="${escapeHtml(room.phone)}" /></label
      ><label
        >วันที่เริ่มสัญญา<input name="start" type="date" value="${escapeHtml(room.start)}" /></label
      ><label
        >เงินประกัน (บาท)<input
          name="deposit"
          type="number"
          min="0"
          value="${room.deposit}" /></label
      ><label
        >มิเตอร์น้ำตั้งต้น<input
          name="water"
          type="number"
          min="0"
          step="0.01"
          required
          value="${room.water}" /></label
      ><label
        >มิเตอร์ไฟตั้งต้น<input
          name="electric"
          type="number"
          min="0"
          step="0.01"
          required
          value="${room.electric}"
      /></label>
    </div>
    <label
      >ที่อยู่ผู้เช่า (สำหรับใบเสร็จ)<input
        name="tenantAddress"
        value="${escapeHtml(room.tenantAddress || "")}"
    /></label>
    <label
      >เลขผู้เสียภาษีผู้เช่า<input name="tenantTaxId" value="${escapeHtml(room.tenantTaxId || "")}"
    /></label>
    <div class="actions">
      ${id ? '<button type="button" class="link danger" id="delete">ลบห้อง</button>' : ""}<button
        type="button"
        class="secondary"
        id="cancel"
      >
        ยกเลิก</button
      ><button class="primary">บันทึกข้อมูล</button>
    </div>
  </form>`;
  dialog.showModal();
  $("#cancel").onclick = async () => dialog.close();
  $("#room-form").onsubmit = async (event) => {
    event.preventDefault();
    const roomData = Object.fromEntries(new FormData(event.target));
    roomData.number = roomData.number.trim();
    roomData.tenant = roomData.tenant.trim();
    if (!roomData.number) return showToast("กรุณาระบุหมายเลขห้อง");
    if (
      state.rooms.some(
        (existingRoom) => existingRoom.id !== id && existingRoom.number === roomData.number,
      )
    )
      return showToast("หมายเลขห้องนี้มีอยู่แล้ว");
    if (roomData.status === "occupied" && !roomData.tenant)
      return showToast("กรุณาระบุชื่อผู้เช่า");
    ["rent", "deposit", "water", "electric"].forEach(
      (field) => (roomData[field] = +roomData[field]),
    );
    roomData.id = id || crypto.randomUUID();
    const proposed = structuredClone(state);
    if (id) proposed.rooms[proposed.rooms.findIndex((room) => room.id === id)] = roomData;
    else proposed.rooms.push(roomData);
    const firstKey = Object.keys(proposed.meters)
      .filter((key) => key.startsWith(roomData.id + ":"))
      .sort()[0];
    if (
      firstKey &&
      (roomData.water > proposed.meters[firstKey].water ||
        roomData.electric > proposed.meters[firstKey].electric)
    )
      return showToast("มิเตอร์ตั้งต้นต้องไม่เกินเลขสิ้นเดือนแรก");
    if (id) {
      if (
        !(await commitRoomChange(
          proposed,
          id,
          "บันทึกข้อมูลห้องและตรวจสอบบิลที่เกี่ยวข้อง? ค่าเช่าบิลเดิมแก้ได้จากหน้าบิล",
        ))
      )
        return;
    } else {
      replaceState(proposed);
      await saveState();
    }
    dialog.close();
    renderApp();
    showToast("บันทึกห้องพักแล้ว");
  };
  if (id)
    $("#delete").onclick = async () => {
      if (!confirm("ลบห้องพร้อมมิเตอร์และบิลที่เกี่ยวข้อง? สามารถกู้คืนห้องล่าสุดได้จากตั้งค่า"))
        return;
      state.deletedRooms ??= [];
      state.deletedRooms.push({
        room: structuredClone(state.rooms.find((room) => room.id === id)),
        meters: Object.fromEntries(
          Object.entries(state.meters).filter(([key]) => key.startsWith(id + ":")),
        ),
        bills: state.bills.filter((bill) => bill.roomId === id),
      });
      state.rooms = state.rooms.filter((room) => room.id !== id);
      state.bills = state.bills.filter((bill) => bill.roomId !== id);
      Object.keys(state.meters).forEach((key) => {
        if (key.startsWith(id + ":")) delete state.meters[key];
      });
      await saveState();
      dialog.close();
      renderApp();
      showToast("ลบห้องแล้ว กู้คืนได้ในตั้งค่า");
    };
}
// Every bill is a revisable test draft in this version.
function getPreviousMeter(room, period) {
  return previousReading(state, room, period);
}

async function commitRoomChange(proposedState, roomId, message, requireConfirmation = false) {
  try {
    const changes = reconcileRoomBills(proposedState, roomId);
    const details = changes.length
      ? "\nบิลที่ได้รับผลกระทบ:\n" + changes.join("\n")
      : "\nไม่มียอดบิลที่เปลี่ยนแปลง";
    if (
      (requireConfirmation || changes.length > 0) &&
      !confirm(message + details + "\nยืนยันบันทึกการเปลี่ยนแปลง?")
    )
      return false;
    replaceState(proposedState);
    await saveState();
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  }
}

async function deleteMeterReading(roomId, period) {
  const key = roomId + ":" + period;
  if (!state.meters[key]) return showToast("ไม่มีข้อมูลมิเตอร์เดือนนี้ให้ลบ");
  const proposed = structuredClone(state);
  proposed.deletedMeters ??= {};
  proposed.deletedMeters[key] = { ...proposed.meters[key], deletedAt: new Date().toISOString() };
  delete proposed.meters[key];
  if (
    !(await commitRoomChange(
      proposed,
      roomId,
      `ลบมิเตอร์เดือน ${period}? เลขตั้งต้นรอบถัดไปจะคำนวณใหม่ บิลเดือนนี้จะย้ายไปถังขยะ`,
      true,
    ))
  )
    return;
  renderMetersTable();
  showToast("ลบแล้ว สามารถกู้คืนได้จากแถวห้อง");
}

async function restoreMeterReading(roomId, period) {
  const key = roomId + ":" + period;
  const reading = state.deletedMeters?.[key];
  if (!reading || state.meters[key]) return;
  const proposed = structuredClone(state);
  const { deletedAt, ...restoredReading } = reading;
  proposed.meters[key] = restoredReading;
  delete proposed.deletedMeters[key];
  const room = proposed.rooms.find((room) => room.id === roomId);
  const ordered = Object.keys(proposed.meters)
    .filter((key) => key.startsWith(roomId + ":"))
    .sort();
  let previous = { water: room.water, electric: room.electric };
  for (const meterKey of ordered) {
    const current = proposed.meters[meterKey];
    if (current.water < previous.water || current.electric < previous.electric)
      return showToast("กู้คืนไม่ได้ เลขมิเตอร์ไม่ต่อเนื่องกับเดือนอื่น");
    previous = current;
  }
  if (
    !(await commitRoomChange(
      proposed,
      roomId,
      "กู้คืนมิเตอร์และคำนวณบิลที่เกี่ยวข้องใหม่? บิลที่ลบต้องกู้คืนจากหน้าบิลแยกต่างหาก",
    ))
  )
    return;
  renderMetersTable();
  showToast("กู้คืนมิเตอร์แล้ว");
}

function renderMetersPage(content) {
  content.innerHTML =
    renderPageHeading(
      "MONTHLY UTILITIES",
      "จดมิเตอร์",
      "กรอกเลขมิเตอร์น้ำและไฟด้วยตัวเอง เพื่อคำนวณการใช้งานรายเดือน",
      '<button class="primary" id="add-meter">＋ เพิ่มข้อมูลมิเตอร์</button>',
    ) +
    /* HTML */ `<div class="toolbar">
        <input
          type="month"
          id="period"
          value="${getCurrentMonth()}"
          aria-label="เดือนมิเตอร์"
        /><span class="note">กรอกเลขสะสมบนมิเตอร์ ระบบจะคำนวณหน่วยที่ใช้จากครั้งก่อน</span>
      </div>
      <button class="secondary" id="to-bills">ดู / สร้างบิลเดือนนี้ →</button>
      <div class="panel" id="meters-table"></div>`;
  $("#to-bills").onclick = async () => {
    const period = $("#period").value;
    page = "bills";
    renderApp();
    $("#bill-period").value = period;
    renderBillList();
  };
  $("#add-meter").onclick = openMeterRoomPicker;
  $("#period").onchange = renderMetersTable;
  renderMetersTable();
}
function openMeterRoomPicker() {
  if (!state.rooms.length) {
    showToast("เพิ่มห้องพักก่อน แล้วจึงบันทึกมิเตอร์ของห้องนั้น");
    openRoomDialog();
    return;
  }
  const period = $("#period").value;
  if (!period) return showToast("กรุณาเลือกเดือนที่ต้องการบันทึก");
  const availableRooms = state.rooms;
  const dialog = $("#modal");
  dialog.innerHTML = /* HTML */ `<form id="meter-room-picker">
    <h2>เลือกห้องสำหรับบันทึกมิเตอร์</h2>
    <p>เดือน ${period} · เลือกห้องที่ต้องการเพิ่มหรือแก้ไขเลขสิ้นเดือน</p>
    <label
      >ห้องพัก<select name="roomId" required>
        ${availableRooms.map((room) => /* HTML */ `<option value="${escapeHtml(room.id)}">ห้อง ${escapeHtml(room.number)} — ${state.meters[room.id + ":" + period] ? "มีข้อมูลแล้ว · แก้ไข" : "ยังไม่บันทึก"}</option>`).join("")}
      </select></label
    >
    <div class="actions">
      <button type="button" class="secondary" id="cancel">ยกเลิก</button
      ><button class="primary">กรอกเลขมิเตอร์</button>
    </div>
  </form>`;
  $("#cancel").onclick = async () => dialog.close();
  $("#meter-room-picker").onsubmit = async (event) => {
    event.preventDefault();
    const roomId = new FormData(event.target).get("roomId");
    dialog.close();
    openMeterDialog(roomId, period);
  };
  dialog.showModal();
}

function renderMetersTable() {
  const period = $("#period").value;
  if (!period) return;
  $("#meters-table").innerHTML = /* HTML */ `<table>
      <thead>
        <tr>
          <th>ห้อง</th>
          <th>จัดการข้อมูล</th>
          <th>น้ำตั้งต้นรอบนี้</th>
          <th>น้ำสิ้นเดือน</th>
          <th>ไฟตั้งต้นรอบนี้</th>
          <th>ไฟสิ้นเดือน</th>
        </tr>
      </thead>
      <tbody>
        ${state.rooms
          .map((room) => {
            const previousMeter = getPreviousMeter(room, period),
              meterReading = state.meters[room.id + ":" + period];
            return /* HTML */ `<tr>
              <td>${escapeHtml(room.number)}</td>
              <td>
                <button class="secondary" data-meter="${room.id}">
                  ${meterReading ? "แก้ไข" : "＋ เพิ่มข้อมูล"}
                </button>
                ${
                  meterReading
                    ? /* HTML */ `<button class="secondary danger" data-delete-meter="${room.id}">
                        ลบ
                      </button>`
                    : state.deletedMeters?.[room.id + ":" + period]
                      ? /* HTML */ `<button class="secondary" data-restore-meter="${room.id}">
                          กู้คืนข้อมูลที่ลบ
                        </button>`
                      : '<small class="note">ยังไม่มีข้อมูลสิ้นเดือนให้ลบ</small>'
                }
              </td>
              <td>${previousMeter.water}</td>
              <td>${meterReading?.water ?? "—"}</td>
              <td>${previousMeter.electric}</td>
              <td>${meterReading?.electric ?? "—"}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    ${!state.rooms.length ? '<div class="empty-state">ยังไม่มีห้องพักสำหรับบันทึกมิเตอร์<br>เริ่มจากเพิ่มห้องพักและเลขมิเตอร์ตั้งต้น<br><button class="primary" id="add-meter-room">＋ เพิ่มห้องพัก</button></div>' : ""}`;
  const addRoomButton = $("#add-meter-room");
  if (addRoomButton) addRoomButton.onclick = async () => openRoomDialog();
  document
    .querySelectorAll("[data-meter]")
    .forEach(
      (button) => (button.onclick = async () => openMeterDialog(button.dataset.meter, period)),
    );
  document.querySelectorAll("[data-delete-meter]").forEach((button) => {
    button.onclick = async () => deleteMeterReading(button.dataset.deleteMeter, period);
  });
  document.querySelectorAll("[data-restore-meter]").forEach((button) => {
    button.onclick = async () => restoreMeterReading(button.dataset.restoreMeter, period);
  });
}
function openMeterDialog(id, period) {
  const room = state.rooms.find((x) => x.id === id),
    key = id + ":" + period,
    previousMeter = getPreviousMeter(room, period),
    meterReading = state.meters[key] || previousMeter,
    dialog = $("#modal");
  dialog.innerHTML = /* HTML */ `<form id="meter-form">
    <h2>${state.meters[key] ? "แก้ไข" : "เพิ่ม"}เลขมิเตอร์ ห้อง ${escapeHtml(room.number)}</h2>
    <p>${period} · กรอกเลขสะสมที่แสดงบนมิเตอร์ ไม่ใช่จำนวนหน่วยที่ใช้</p>
    <div class="fields">
      <label
        >เลขมิเตอร์น้ำสิ้นเดือน (ตั้งต้น ${previousMeter.water})<input
          name="water"
          type="number"
          min="${previousMeter.water}"
          step="0.01"
          value="${meterReading.water}"
          required /></label
      ><label
        >เลขมิเตอร์ไฟสิ้นเดือน (ตั้งต้น ${previousMeter.electric})<input
          name="electric"
          type="number"
          min="${previousMeter.electric}"
          step="0.01"
          value="${meterReading.electric}"
          required
      /></label>
    </div>
    <p class="note" id="meter-usage" aria-live="polite">
      ใช้ไป: น้ำ ${Number((meterReading.water - previousMeter.water).toFixed(2))} หน่วย · ไฟ
      ${Number((meterReading.electric - previousMeter.electric).toFixed(2))} หน่วย
    </p>
    <p class="note">
      เลขสิ้นเดือนจะเป็นเลขตั้งต้นของรอบถัดไป แก้ย้อนหลังได้และตรวจยอดบิลก่อนยืนยัน
    </p>
    <div class="actions">
      <button type="button" class="secondary" id="cancel">ยกเลิก</button
      ><button class="primary">ยืนยันค่ามิเตอร์</button>
    </div>
  </form>`;
  $("#cancel").onclick = async () => dialog.close();
  $("#meter-form").oninput = (event) => {
    const form = new FormData(event.currentTarget);
    const water = Number(form.get("water")) - previousMeter.water;
    const electric = Number(form.get("electric")) - previousMeter.electric;
    $("#meter-usage").textContent =
      water >= 0 && electric >= 0
        ? `ใช้ไป: น้ำ ${Number(water.toFixed(2))} หน่วย · ไฟ ${Number(electric.toFixed(2))} หน่วย`
        : "เลขสิ้นเดือนต้องไม่น้อยกว่าเลขตั้งต้น";
  };
  $("#meter-form").onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const water = +formData.get("water"),
      electric = +formData.get("electric");
    if (
      !Number.isFinite(water) ||
      !Number.isFinite(electric) ||
      formData.get("water").trim() === "" ||
      formData.get("electric").trim() === "" ||
      water < previousMeter.water ||
      electric < previousMeter.electric
    ) {
      return showToast("กรุณากรอกเลขมิเตอร์ให้ถูกต้อง และไม่น้อยกว่าครั้งก่อน");
    }
    const future = Object.entries(state.meters)
      .filter(([meterKey]) => meterKey.startsWith(id + ":") && meterKey.split(":")[1] > period)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))[0]?.[1];
    if (future && (water > future.water || electric > future.electric))
      return showToast("ค่าต้องไม่เกินมิเตอร์ของเดือนถัดไปที่บันทึกไว้");
    const proposed = structuredClone(state);
    proposed.meters[key] = { ...proposed.meters[key], water, electric };
    if (
      !(await commitRoomChange(
        proposed,
        id,
        `บันทึกมิเตอร์เดือน ${period} และอัปเดตเลขตั้งต้นรอบถัดไป`,
      ))
    )
      return;
    dialog.close();
    renderMetersTable();
    showToast("บันทึกมิเตอร์แล้ว");
  };
  dialog.showModal();
}
function openBillDialog(id) {
  const bill = state.bills.find((bill) => bill.id === id);
  const rates = bill.rates || state.settings;
  const dialog = $("#modal");
  dialog.innerHTML = /* HTML */ `<form id="bill-form">
    <h2>แก้ไขบิลฉบับร่าง · ห้อง ${escapeHtml(bill.number)}</h2>
    <p>เดือน ${bill.period} · หน่วยน้ำและไฟอ้างอิงจากมิเตอร์ แก้เลขได้ในหน้าจดมิเตอร์</p>
    <label
      >เลขที่บิล (อัตโนมัติ)<input
        readonly
        value="${escapeHtml(bill.billNo || "สร้างอัตโนมัติเมื่อบันทึก")}"
    /></label>
    <label
      >เลขที่ใบเสร็จ (อัตโนมัติ)<input
        readonly
        value="${escapeHtml(bill.receiptNo || "ออกเลขเมื่อรับชำระเงิน")}"
    /></label>
    ${bill.paid ? `<label>วันที่รับชำระเงินจริง<input name="paidDate" type="date" required value="${escapeHtml(localDate(bill.paidAt))}" /></label>` : ""}
    <label
      >ที่อยู่ผู้เช่าในบิล<input
        name="tenantAddress"
        value="${escapeHtml(bill.tenantAddress || "")}"
    /></label>
    <label
      >เลขผู้เสียภาษีผู้เช่าในบิล<input
        name="tenantTaxId"
        value="${escapeHtml(bill.tenantTaxId || "")}"
    /></label>
    <div class="fields">
      <label
        >ค่าเช่า<input name="rent" type="number" min="0" step="0.01" required value="${bill.rent}"
      /></label>
      <label>วันที่ออกบิล<input name="due" type="date" required value="${bill.due}" /></label>
      <label
        >ค่าน้ำต่อหน่วย<input
          name="water"
          type="number"
          min="0"
          step="0.01"
          required
          value="${rates.water}"
      /></label>
      <label
        >ค่าไฟต่อหน่วย<input
          name="electric"
          type="number"
          min="0"
          step="0.01"
          required
          value="${rates.electric}"
      /></label>
    </div>
    <p class="note">บันทึกแล้วจะคำนวณยอดใหม่ หากยอดเปลี่ยนจะยกเลิกสถานะชำระเงินของบิลนี้</p>
    <div class="actions">
      <button type="button" class="secondary" id="cancel">ยกเลิก</button
      ><button class="primary">ตรวจสอบและบันทึก</button>
    </div>
  </form>`;
  $("#cancel").onclick = async () => dialog.close();
  $("#bill-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const rent = Number(form.get("rent"));
    const water = Number(form.get("water"));
    const electric = Number(form.get("electric"));
    if ([rent, water, electric].some((value) => !Number.isFinite(value) || value < 0))
      return showToast("กรุณากรอกจำนวนเงินที่ถูกต้อง");
    const room = state.rooms.find((room) => room.id === bill.roomId);
    const updated = calculateBill(state, room, bill.period, {
      ...bill,
      rent,
      rates: { water, electric },
      due: form.get("due"),
      paidAt:
        bill.paid && form.get("paidDate") ? `${form.get("paidDate")}T12:00:00+07:00` : bill.paidAt,
      tenantAddress: form.get("tenantAddress")?.trim() || "",
      tenantTaxId: form.get("tenantTaxId")?.trim() || "",
    });
    if (!updated) return showToast("ไม่มีมิเตอร์เดือนนี้ กรุณาเพิ่มหรือกู้คืนมิเตอร์ก่อน");
    if (
      !confirm(
        `ยอดเดิม ฿${formatMoney(bill.total)} → ยอดใหม่ ฿${formatMoney(updated.total)} ยืนยันบันทึก?`,
      )
    )
      return;
    if (updated.total !== bill.total) {
      updated.paid = false;
      updated.paidAt = null;
    }
    state.bills[state.bills.findIndex((item) => item.id === id)] = updated;
    await saveState();
    dialog.close();
    renderBillList();
    showToast("บันทึกบิลฉบับร่างแล้ว");
  };
  dialog.showModal();
}

function renderDeletedBills(period) {
  const deleted = (state.deletedBills || []).filter((bill) => bill.period === period);
  if (!deleted.length) return;
  $("#bill-list").insertAdjacentHTML(
    "beforeend",
    /* HTML */ `<div class="panel">
      <h2>บิลที่ลบ · ${period}</h2>
      ${deleted.map((bill, index) => /* HTML */ `<p>ห้อง ${escapeHtml(bill.number)} · ฿${formatMoney(bill.total)} <button class="secondary" data-restore-bill="${index}">กู้คืนบิล</button></p>`).join("")}
    </div>`,
  );
  document.querySelectorAll("[data-restore-bill]").forEach((button) => {
    button.onclick = async () => {
      const bill = deleted[Number(button.dataset.restoreBill)];
      if (state.bills.some((item) => item.roomId === bill.roomId && item.period === bill.period))
        return showToast("มีบิลห้องนี้ในเดือนนี้แล้ว ลบบิลปัจจุบันก่อนกู้คืน");
      const room = state.rooms.find((room) => room.id === bill.roomId);
      if (!room) return showToast("กรุณากู้คืนห้องพักก่อน");
      const restored = calculateBill(state, room, period, { ...bill, paid: false, paidAt: null });
      if (!restored) return showToast("กรุณาเพิ่มหรือกู้คืนมิเตอร์เดือนนี้ก่อน");
      if (
        !confirm(
          `กู้คืนบิลห้อง ${bill.number} ยอดคำนวณปัจจุบัน ฿${formatMoney(restored.total)}? สถานะจะเป็นยังไม่ชำระ`,
        )
      )
        return;
      state.bills.push(restored);
      state.deletedBills.splice(state.deletedBills.indexOf(bill), 1);
      await saveState();
      renderBillList();
      showToast("กู้คืนบิลแล้ว");
    };
  });
}

function renderBillsPage(content) {
  content.innerHTML =
    renderPageHeading(
      "BILLING & PAYMENTS",
      "บิลและการชำระเงิน",
      "ตรวจสอบค่าสาธารณูปโภค แล้วออกบิลประจำเดือน",
    ) +
    /* HTML */ `<div class="toolbar">
        <input
          type="month"
          id="bill-period"
          value="${getCurrentMonth()}"
          aria-label="เดือนออกบิล"
        /><button class="primary" id="generate">สร้างบิลฉบับร่าง</button>
      </div>
      <p class="note">
        โหมดทดสอบ · แก้ไข ลบ คำนวณใหม่ และยกเลิกชำระได้ทุกบิล ·
        สร้างบิลเฉพาะห้องที่มีผู้เช่าและมิเตอร์
      </p>
      <div class="panel" id="bill-list"></div>`;
  $("#bill-period").onchange = renderBillList;
  $("#generate").onclick = async () => {
    const period = $("#bill-period").value;
    if (!period) return;
    let count = 0;
    state.rooms
      .filter((room) => room.status === "occupied")
      .forEach((room) => {
        const meterReading = state.meters[room.id + ":" + period];
        if (
          !meterReading ||
          state.bills.some((bill) => bill.roomId === room.id && bill.period === period)
        )
          return;
        state.bills.push({ ...calculateBill(state, room, period), id: crypto.randomUUID() });
        count++;
      });
    await saveState();
    renderBillList();
    showToast(count ? `ออกบิลแล้ว ${count} รายการ` : "ไม่มีบิลใหม่ ตรวจสอบผู้เช่าและมิเตอร์");
  };
  renderBillList();
}
function renderBillList() {
  const period = $("#bill-period").value;
  $("#bill-list").innerHTML = /* HTML */ `<table>
      <thead>
        <tr>
          <th>ห้อง / ผู้เช่า</th>
          <th>วันที่ออกบิล</th>
          <th>ค่าเช่า</th>
          <th>ค่าน้ำ</th>
          <th>ค่าไฟ</th>
          <th>รวม</th>
          <th>สถานะ / จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${state.bills
          .filter((bill) => bill.period === period)
          .map(
            (bill) =>
              /* HTML */ `<tr>
                <td>
                  ${escapeHtml(bill.number)}<br /><small>${escapeHtml(bill.tenant)}</small><br />
                  <small
                    >${escapeHtml(bill.billNo || "-")}${bill.receiptNo ? `<br />${escapeHtml(bill.receiptNo)}` : ""}</small
                  >
                </td>
                <td>${bill.due}</td>
                <td>${formatMoney(bill.rent)}</td>
                <td>${formatMoney(bill.water)}</td>
                <td>${formatMoney(bill.electric)}</td>
                <td><b>฿ ${formatMoney(bill.total)}</b></td>
                <td>
                  <button class="secondary" data-paid="${bill.id}">
                    ${bill.paid ? "ยกเลิกการชำระ" : "บันทึกชำระเงิน"}
                  </button>
                  <button class="secondary" data-pdf-bill="${bill.id}" data-document-type="bill">
                    บิลเรียกเก็บเงิน PDF
                  </button>
                  ${
                    bill.paid
                      ? `<button class="secondary" data-pdf-bill="${bill.id}" data-document-type="receipt">ใบเสร็จรับเงิน PDF</button>`
                      : ""
                  }
                  <button class="secondary" data-edit-bill="${bill.id}">แก้ไขบิล</button>
                  <button class="secondary danger" data-delete-bill="${bill.id}">ลบบิล</button>
                </td>
              </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${!state.bills.some((bill) => bill.period === period) ? '<div class="empty-state">ยังไม่มีบิลในเดือนนี้</div>' : ""}`;
  document.querySelectorAll("[data-pdf-bill]").forEach((button) => {
    button.onclick = async () => {
      const bill = state.bills.find((bill) => bill.id === button.dataset.pdfBill);
      if (!bill) return showToast("ไม่พบบิลนี้ กรุณาโหลดข้อมูลใหม่");
      const label = button.textContent;
      button.disabled = true;
      button.textContent = "กำลังสร้าง PDF…";
      try {
        await saveState();
        const room = state.rooms.find((room) => room.id === bill.roomId);
        await downloadBillPdf(
          {
            ...bill,
            tenantAddress: bill.tenantAddress ?? room?.tenantAddress,
            tenantTaxId: bill.tenantTaxId ?? room?.tenantTaxId,
            tenantPhone: bill.tenantPhone ?? room?.phone,
          },
          state.settings,
          button.dataset.documentType,
        );
        showToast("สร้าง PDF แล้ว หากแก้ไขบิลให้สร้างไฟล์ใหม่อีกครั้ง");
      } catch (error) {
        showToast("สร้าง PDF ไม่สำเร็จ: " + error.message);
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    };
  });
  document.querySelectorAll("[data-edit-bill]").forEach((button) => {
    button.onclick = async () => openBillDialog(button.dataset.editBill);
  });
  document.querySelectorAll("[data-delete-bill]").forEach((button) => {
    button.onclick = async () => {
      const bill = state.bills.find((bill) => bill.id === button.dataset.deleteBill);
      if (
        !confirm(
          `ลบบิลห้อง ${bill.number} เดือน ${bill.period}? ข้อมูลมิเตอร์ยังอยู่ สามารถสร้างบิลใหม่หรือกู้คืนได้`,
        )
      )
        return;
      state.deletedBills ??= [];
      state.deletedBills.push(bill);
      state.bills = state.bills.filter((item) => item.id !== bill.id);
      await saveState();
      renderBillList();
    };
  });
  renderDeletedBills(period);
  document.querySelectorAll("[data-paid]").forEach(
    (button) =>
      (button.onclick = async () => {
        const bill = state.bills.find((x) => x.id === button.dataset.paid);
        if (
          confirm(
            bill.paid
              ? "ยกเลิกสถานะชำระเงิน?"
              : `ยืนยันรับชำระห้อง ${bill.number} จำนวน ฿ ${formatMoney(bill.total)}?`,
          )
        ) {
          bill.paid = !bill.paid;
          bill.paidAt = bill.paid ? new Date().toISOString() : null;
          await saveState();
          renderBillList();
        }
      }),
  );
}
document.querySelectorAll("nav button").forEach(
  (b) =>
    (b.onclick = async () => {
      page = b.dataset.page;
      renderApp();
    }),
);
$("#date").textContent = new Date().toLocaleDateString("th-TH", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
window.addEventListener("unhandledrejection", (event) => {
  if (!event.reason?.isPersistenceError) return;
  event.preventDefault();
  $("#modal").close();
  renderApp();
  showToast("ยังไม่ได้บันทึก: " + event.reason.message);
});
try {
  await initializeStore();
  renderApp();
  const legacy = getLegacyData();
  if (legacy && legacy.rooms.length && !state.rooms.length) {
    $("#content").insertAdjacentHTML(
      "afterbegin",
      `<div class="test-banner">พบข้อมูลเดิมในเบราว์เซอร์ ไปที่ตั้งค่า → ย้ายข้อมูลเดิมจากเบราว์เซอร์นี้ ${storageMode === "browser" ? "เพื่อนำมาใช้งานต่อ" : "เพื่อบันทึกลงไฟล์โปรเจกต์"}</div>`,
    );
  }
} catch (error) {
  $("#content").innerHTML =
    `<div class="panel"><h2>ยังเปิดข้อมูลไม่ได้</h2><p>${escapeHtml(error.message)}</p><p>${storageMode === "browser" ? "ตรวจว่าเบราว์เซอร์อนุญาตให้เว็บไซต์บันทึกข้อมูล แล้วโหลดหน้าใหม่ ข้อมูลที่มีปัญหาจะไม่ถูกเขียนทับ" : "หยุดเซิร์ฟเวอร์เก่าด้วย Ctrl+C แล้วรัน npm run dev จากนั้นโหลดหน้านี้ใหม่"}</p></div>`;
}
