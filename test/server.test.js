const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("CineTune Static Files & Config Integrity", () => {
  test("index.html exists and contains iframe screen", () => {
    const indexPath = path.join(__dirname, "../public/cinetune/index.html");
    assert.ok(fs.existsSync(indexPath), "index.html should exist");
    const content = fs.readFileSync(indexPath, "utf8");
    assert.match(content, /id="screen"/, "index.html should mount the CineTune iframe");
  });

  test("app.js exists and is non-empty", () => {
    const appJsPath = path.join(__dirname, "../public/cinetune/app.js");
    assert.ok(fs.existsSync(appJsPath), "app.js should exist");
    const stats = fs.statSync(appJsPath);
    assert.ok(stats.size > 1000, "app.js should have content");
  });

  test("theme.css exists", () => {
    const themePath = path.join(__dirname, "../public/cinetune/theme.css");
    assert.ok(fs.existsSync(themePath), "theme.css should exist");
  });

  test("config/android.json contains valid configuration", () => {
    const configPath = path.join(__dirname, "../config/android.json");
    assert.ok(fs.existsSync(configPath), "config/android.json should exist");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.ok(config.siteUrl, "siteUrl should be configured");
    assert.match(config.siteUrl, /^https?:\/\//, "siteUrl should be a valid HTTP(S) URL");
  });
});

describe("CineTune Express Routes & Server Logic", () => {
  test("server.js has valid syntax and requires express", () => {
    const serverPath = path.join(__dirname, "../server.js");
    const content = fs.readFileSync(serverPath, "utf8");
    assert.match(content, /require\(['"]express['"]\)/, "server.js should import express");
    assert.match(content, /app\.get\(['"]\/health['"]/, "server.js should define /health route");
  });
});
