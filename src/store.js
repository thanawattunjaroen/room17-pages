import { INITIAL_STATE, validateData } from "./data-schema.js";
import { ensureDocumentNumbers } from "./finance.js";

export const ROOM_STATUS_LABELS = {
  occupied: "มีผู้เช่า",
  empty: "ห้องว่าง",
  repair: "ซ่อมบำรุง",
};
export let state = structuredClone(INITIAL_STATE);
export const storageMode =
  document.querySelector('meta[name="roomwise-storage"]')?.content === "browser"
    ? "browser"
    : "file";
const browserKey = `roomwise-pages:${new URL("../", import.meta.url).pathname}`;
let lastSavedState = structuredClone(state);
let revision;
let saveQueue = Promise.resolve();
let needsReload = false;

function showSaveStatus(message, failed = false) {
  const element = document.querySelector("#data-status");
  if (element) {
    element.textContent = message;
    element.classList.toggle("danger", failed);
  }
}

export async function initializeStore() {
  if (storageMode === "browser") {
    showSaveStatus("กำลังอ่านข้อมูลในเบราว์เซอร์…");
    revision = localStorage.getItem(browserKey);
    state = revision === null ? structuredClone(INITIAL_STATE) : validateData(JSON.parse(revision));
    ensureDocumentNumbers(state);
    lastSavedState = structuredClone(state);
    needsReload = false;
    showSaveStatus("✓ ข้อมูลเก็บในเบราว์เซอร์นี้ · สำรองด้วยส่งออก JSON");
    return;
  }
  showSaveStatus("กำลังอ่านไฟล์ข้อมูล…");
  const response = await fetch("/api/data", { cache: "no-store" });
  if (!response.ok) throw Error("อ่านไฟล์ไม่ได้ กรุณาเปิดด้วย npm run dev เวอร์ชันใหม่");
  const data = validateData(await response.json());
  const etag = response.headers.get("ETag");
  if (!etag)
    throw Error(
      "เซิร์ฟเวอร์ไม่รองรับการบันทึกไฟล์ กรุณาหยุดเซิร์ฟเวอร์เดิมแล้วรัน npm run dev ใหม่",
    );
  state = data;
  ensureDocumentNumbers(state);
  lastSavedState = structuredClone(data);
  revision = etag;
  needsReload = false;
  showSaveStatus("✓ อ่านข้อมูลจากไฟล์แล้ว");
}

// Snapshot at click time, then save sequentially with optimistic concurrency control.
export function saveState() {
  ensureDocumentNumbers(state);
  const snapshot = structuredClone(state);
  showSaveStatus(storageMode === "browser" ? "กำลังบันทึกในเบราว์เซอร์…" : "กำลังบันทึกลงไฟล์…");
  const operation = saveQueue.then(async () => {
    try {
      if (needsReload) throw Error("กรุณาโหลดหน้าใหม่ก่อนบันทึกอีกครั้ง");
      validateData(snapshot);
      if (storageMode === "browser") {
        const write = () => {
          if (localStorage.getItem(browserKey) !== revision)
            throw Error("ข้อมูลเปลี่ยนจากอีกแท็บ กรุณาโหลดหน้าใหม่ก่อนบันทึก");
          const bytes = JSON.stringify(snapshot);
          localStorage.setItem(browserKey, bytes);
          revision = bytes;
        };
        if (globalThis.navigator?.locks) {
          let writeError;
          await navigator.locks.request(browserKey, () => {
            try {
              write();
            } catch (error) {
              writeError = error;
            }
          });
          if (writeError) throw writeError;
        } else write();
        lastSavedState = snapshot;
        showSaveStatus("✓ บันทึกในเบราว์เซอร์แล้ว · สำรองด้วยส่งออก JSON");
        return;
      }
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": revision },
        body: JSON.stringify(snapshot),
      });
      if (!response.ok) {
        let message = "บันทึกไฟล์ไม่สำเร็จ";
        try {
          message = (await response.json()).error || message;
        } catch {}
        throw Error(message);
      }
      revision = response.headers.get("ETag");
      lastSavedState = snapshot;
      showSaveStatus("✓ บันทึกลงไฟล์แล้ว · ยังต้อง commit / push");
    } catch (error) {
      state = structuredClone(lastSavedState);
      needsReload = true;
      showSaveStatus(error.message + " · โหลดหน้าใหม่เพื่อลองอีกครั้ง", true);
      error.isPersistenceError = true;
      throw error;
    }
  });
  saveQueue = operation.catch(() => {});
  return operation;
}

export function replaceState(importedState) {
  const reservedNumbers = state.documentNumbers || [];
  state = validateData(importedState);
  if (reservedNumbers.length)
    state.documentNumbers = [...new Set([...reservedNumbers, ...(state.documentNumbers || [])])];
}

// Legacy data remains untouched until the owner explicitly chooses to migrate it.
export function getLegacyData() {
  try {
    const value = JSON.parse(localStorage.getItem("roomwise-v1"));
    return value ? validateData(value) : null;
  } catch {
    return null;
  }
}
