<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>دستیار کدنویسی Gemini</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body class="bg-body-tertiary">

<div class="d-flex vh-100 overflow-hidden">
    <!-- سایدبار -->
    <aside id="sidebar" class="bg-dark text-light d-flex flex-column border-start border-secondary-subtle" style="width: 320px; min-width: 280px;">
        <div class="p-3 border-bottom border-secondary d-flex justify-content-between align-items-center">
            <h6 class="m-0 fw-bold"><i class="bi bi-code-slash text-info me-2"></i>پروژه‌ها و چت‌ها</h6>
            <button id="newProjectBtn" class="btn btn-sm btn-outline-info" title="پروژه جدید">
                <i class="bi bi-folder-plus"></i> پروژه
            </button>
        </div>

        <div class="p-2 border-bottom border-secondary">
            <button id="newChatBtn" class="btn btn-primary w-100 btn-sm">
                <i class="bi bi-plus-lg me-1"></i> گفتگوی جدید
            </button>
        </div>

        <!-- لیست پروژه‌ها و چت‌ها -->
        <div class="flex-grow-1 overflow-auto p-2" id="sidebarContent"></div>

        <div class="p-2 border-top border-secondary d-flex gap-2">
            <button class="btn btn-sm btn-outline-light flex-grow-1" data-bs-toggle="modal" data-bs-target="#apiKeyModal">
                <i class="bi bi-key me-1"></i> تنظیم API Key
            </button>
            <button id="exportDataBtn" class="btn btn-sm btn-outline-secondary" title="خروجی بکاپ JSON">
                <i class="bi bi-download"></i>
            </button>
            <label class="btn btn-sm btn-outline-secondary m-0" title="ورود بکاپ JSON">
                <i class="bi bi-upload"></i>
                <input type="file" id="importDataInput" accept=".json,application/json" class="d-none">
            </label>
        </div>
    </aside>

    <!-- بخش اصلی -->
    <main class="flex-grow-1 d-flex flex-column overflow-hidden">
        <!-- نوار ابزار بالا -->
        <header class="bg-white border-bottom px-3 py-2 d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-2">
                <button id="toggleSidebarBtn" class="btn btn-sm btn-outline-secondary d-lg-none">
                    <i class="bi bi-list"></i>
                </button>
                <span id="activeContextBadge" class="badge text-bg-secondary">بدون پروژه (چت عمومی)</span>
            </div>

            <div class="d-flex align-items-center gap-2 flex-wrap">
                <div class="input-group input-group-sm" style="width: 260px;">
                    <span class="input-group-text">مدل</span>
                    <select id="modelSelect" class="form-select">
                        <option value="">در انتظار API Key...</option>
                    </select>
                    <button id="refreshModelsBtn" class="btn btn-outline-secondary" type="button" title="بروزرسانی لیست مدل‌ها از سرور">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                </div>

                <div class="d-flex align-items-center gap-1" style="width: 140px;" title="Temperature">
                    <small class="text-muted">Temp:</small>
                    <input id="tempRange" type="range" class="form-range" min="0" max="2" step="0.1" value="0.4">
                    <small id="tempValue" class="fw-bold">0.4</small>
                </div>
            </div>
        </header>

        <!-- محیط پیام‌ها -->
        <div id="chatMessages" class="flex-grow-1 overflow-auto p-3 p-md-4"></div>

        <!-- پیش‌نمایش فایل‌های متنی پیوست‌شده به پیام -->
        <div id="attachedFilesBar" class="px-3 py-1 bg-light border-top d-none flex-wrap gap-2 align-items-center"></div>

        <!-- فرم ارسال پیام -->
        <footer class="bg-white border-top p-3">
            <form id="chatForm" class="d-flex gap-2 align-items-end">
                <label class="btn btn-outline-secondary" title="افزودن فایل متنی به پیام">
                    <i class="bi bi-paperclip"></i>
                    <input type="file" id="chatTextFileInput" multiple class="d-none">
                </label>

                <textarea id="promptInput" rows="2" class="form-control" placeholder="سوال کدنویسی خود را بنویسید... (Enter برای ارسال، Shift+Enter برای خط جدید)"></textarea>

                <button id="sendBtn" type="submit" class="btn btn-primary px-3">
                    <i class="bi bi-send-fill"></i>
                </button>
            </form>
        </footer>
    </main>
</div>

<!-- مودال تنظیم API Key -->
<div class="modal fade" id="apiKeyModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h6 class="modal-title"><i class="bi bi-shield-lock me-1"></i> ذخیره امن کلید API گوگل</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p class="small text-muted">
                    کلید روی سرور ذخیره نمی‌شود؛ در مرورگر شما کدگذاری شده و فقط هنگام درخواست به عنوان هدر ارسال می‌شود.
                </p>
                <div class="mb-3">
                    <label class="form-label">Gemini API Key</label>
                    <input type="password" id="apiKeyInput" class="form-control dir-ltr" placeholder="AIzaSy...">
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="rememberKeyCheck" checked>
                    <label class="form-check-label small" for="rememberKeyCheck">
                        نگهداری رمزنگاری‌شده در مرورگر پس از بستن تب
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" id="clearApiKeyBtn" class="btn btn-outline-danger btn-sm">پاک کردن</button>
                <button type="button" id="saveApiKeyBtn" class="btn btn-primary btn-sm">ذخیره و دریافت مدل‌ها</button>
            </div>
        </div>
    </div>
</div>

<!-- مودال ایجاد / ویرایش پروژه -->
<div class="modal fade" id="projectModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h6 class="modal-title" id="projectModalTitle">پروژه جدید</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" id="projectIdInput">
                <div class="mb-3">
                    <label class="form-label">نام پروژه</label>
                    <input type="text" id="projectNameInput" class="form-control" placeholder="مثال: سیستم احراز هویت PHP">
                </div>
                <div class="mb-3">
                    <label class="form-label">دستورالعمل سیستم (System Instructions)</label>
                    <textarea id="projectInstructionsInput" rows="4" class="form-control" placeholder="قوانین کدنویسی، سبک پاسخ‌گویی، نسخه PHP/JS و محدودیت‌ها را بنویسید..."></textarea>
                </div>
                <div class="mb-2 d-flex justify-content-between align-items-center">
                    <label class="form-label m-0">فایل‌های مرجع متنی پروژه (همراه با هر چت این پروژه ارسال می‌شوند)</label>
                    <label class="btn btn-sm btn-outline-primary">
                        <i class="bi bi-file-earmark-plus me-1"></i> افزودن فایل متنی
                        <input type="file" id="projectFilesInput" multiple class="d-none">
                    </label>
                </div>
                <div id="projectFilesList" class="border rounded p-2 bg-light small" style="max-height: 220px; overflow-y: auto;"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">انصراف</button>
                <button type="button" id="saveProjectBtn" class="btn btn-success btn-sm">ذخیره پروژه</button>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
<script src="/assets/js/db.js"></script>
<script src="/assets/js/app.js"></script>
</body>
</html>
