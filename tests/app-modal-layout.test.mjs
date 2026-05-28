import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("product create and edit form is presented in a centered modal with blurred backdrop", async () => {
  const [tsx, css] = await Promise.all([readFile("src/App.tsx", "utf8"), readFile("src/App.css", "utf8")]);

  assert.match(tsx, /className="modal-backdrop"/);
  assert.match(tsx, /role="dialog"/);
  assert.match(tsx, /className="modal-card product-modal"/);
  const detailPaneStart = tsx.indexOf('<aside className={`detail-pane');
  const detailPaneEnd = tsx.indexOf("</aside>", detailPaneStart);
  assert.notEqual(detailPaneStart, -1);
  assert.notEqual(detailPaneEnd, -1);
  assert.doesNotMatch(tsx.slice(detailPaneStart, detailPaneEnd), /ProductForm/);
  assert.match(css, /\.modal-backdrop/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /\.product-modal/);
});

test("permanent delete confirmation uses the same modal system instead of window confirm", async () => {
  const tsx = await readFile("src/App.tsx", "utf8");

  assert.doesNotMatch(tsx, /window\.confirm/);
  assert.match(tsx, /confirmPermanentDeleteItemId/);
  assert.match(tsx, /确认永久删除/);
});

test("product stats and search are only rendered on the items page", async () => {
  const tsx = await readFile("src/App.tsx", "utf8");

  assert.match(tsx, /view === "items" \? \(\s*<div className="topbar-actions">/);
  assert.match(tsx, /view === "items" \? \(\s*<section className="header-summary"/);
});

test("settings page groups categories in their own column", async () => {
  const [tsx, css] = await Promise.all([readFile("src/App.tsx", "utf8"), readFile("src/App.css", "utf8")]);

  assert.match(tsx, /className="settings-column category-column"/);
  assert.match(tsx, /className="settings-column secondary-settings-column"/);
  assert.match(
    tsx,
    /<div className="settings-column category-column">[\s\S]*?<ManagementSection[\s\S]*?title="分类"[\s\S]*?<\/div>\s*<div className="settings-column secondary-settings-column">/,
  );
  assert.match(tsx, /className="settings-column secondary-settings-column"[\s\S]*?title="存放位置"/);
  assert.match(css, /\.settings-column/);
  assert.match(css, /\.category-column/);
});

test("desktop sidebar stays fixed while main content owns vertical scrolling", async () => {
  const css = await readFile("src/App.css", "utf8");

  assert.match(css, /\.app-shell\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(css, /\.app-shell\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?height:\s*calc\(100dvh - var\(--shell-vertical-padding\)\)/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.app-main\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width:\s*980px\)[\s\S]*?\.app-shell\s*\{[\s\S]*?height:\s*auto/);
  assert.doesNotMatch(css, /\.sidebar\s*\{[\s\S]*?min-height:\s*640px/);
});

test("management items move delete and migration into a centered modal", async () => {
  const [tsx, css] = await Promise.all([readFile("src/App.tsx", "utf8"), readFile("src/App.css", "utf8")]);

  assert.match(tsx, /className="management-name-row"/);
  assert.match(tsx, /className="management-row-footer"/);
  assert.match(tsx, /className="management-delete-trigger danger"/);
  assert.match(tsx, /deleteCandidateId/);
  assert.match(tsx, /className="modal-card management-delete-modal"/);
  assert.match(tsx, /删除\{title\}/);
  assert.match(tsx, /保存名称/);
  assert.match(tsx, /被 \$\{usageCount\} 件商品使用/);
  assert.match(tsx, /选择迁移目标/);
  assert.match(tsx, /迁移并删除/);
  assert.match(tsx, /直接删除/);
  assert.doesNotMatch(tsx, /className="management-delete-row"/);
  assert.match(css, /\.management-name-row/);
  assert.match(css, /\.management-row-footer/);
  assert.match(css, /\.management-delete-modal/);
  assert.match(css, /\.management-delete-summary/);
  assert.match(css, /white-space:\s*nowrap/);
});
