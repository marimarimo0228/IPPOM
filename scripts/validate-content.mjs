// content/odai.json の形式を検証する。
// `npm run dev` と `npm run build` の前に自動で走り、問題があれば起動・ビルドを止める。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

let list;
try {
  list = JSON.parse(readFileSync(join(root, "content", "odai.json"), "utf8"));
} catch (e) {
  console.error(`content/odai.json を読めません: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(list)) {
  console.error("content/odai.json は配列にしてください。");
  process.exit(1);
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const seen = new Set();

list.forEach((item, i) => {
  const where = `odai.json の ${i + 1} 件目${item && item.id ? `（${item.id}）` : ""}`;
  if (typeof item !== "object" || item === null) {
    errors.push(`${where}: オブジェクトではありません`);
    return;
  }
  if (!isText(item.id)) errors.push(`${where}: id がありません`);
  else if (seen.has(item.id)) errors.push(`${where}: id が重複しています`);
  else seen.add(item.id);

  if (item.type !== "text" && item.type !== "image") {
    errors.push(`${where}: type は "text" か "image" にしてください`);
  }
  if (!isText(item.text)) errors.push(`${where}: text がありません`);
  if (typeof item.enabled !== "boolean") {
    errors.push(`${where}: enabled は true か false にしてください`);
  }

  if (item.type === "image") {
    if (!isText(item.alt)) errors.push(`${where}: 画像お題には alt が必要です`);
    if (!isText(item.credit)) errors.push(`${where}: 画像お題には credit が必要です`);
    if (!isText(item.image) || !item.image.startsWith("/odai/")) {
      errors.push(`${where}: image は "/odai/ファイル名" の形にしてください`);
    } else if (!existsSync(join(root, "public", ...item.image.split("/").filter(Boolean)))) {
      errors.push(`${where}: 画像ファイル public${item.image} が見つかりません`);
    }
  }
});

if (list.filter((o) => o && o.enabled === true).length === 0) {
  errors.push("enabled が true のお題が1件もありません");
}

if (errors.length > 0) {
  console.error("お題データに問題があります:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`お題データ OK（${list.length} 件）`);
