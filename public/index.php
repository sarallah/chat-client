<?php
declare(strict_types=1);
require_once __DIR__ . '/api/auth.php';

header('Content-Type: text/html; charset=utf-8');

$loginError = '';

if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: /');
    exit;
}

if (isAppLockEnabled() && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['app_password'])) {
    $submitted = (string)$_POST['app_password'];
    if (hash_equals(getAppPassword(), $submitted)) {
        session_regenerate_id(true);
        $_SESSION['gemini_client_auth'] = true;
        header('Location: /');
        exit;
    } else {
        $loginError = 'رمز عبور اشتباه است.';
    }
}

if (!isAuthenticated()):
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ورود به دستیار کدنویسی Gemini</title>
    <link rel="stylesheet" href="/assets/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="/assets/css/bootstrap-icons.min.css">
</head>
<body class="bg-dark d-flex align-items-center justify-content-center vh-100">
    <div class="card shadow-lg border-0" style="width: 100%; max-width: 390px;">
        <div class="card-body p-4">
            <div class="text-center mb-3">
                <i class="bi bi-shield-lock-fill text-primary fs-1"></i>
                <h5 class="mt-2 fw-bold">دستیار کدنویسی Gemini</h5>
                <p class="text-muted small">این محیط با رمز عبور محافظت شده است.</p>
            </div>
            <?php if ($loginError !== ''): ?>
                <div class="alert alert-danger py-2 small"><?= htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') ?></div>
            <?php endif; ?>
            <form method="POST" action="/">
                <div class="mb-3">
                    <label class="form-label small fw-bold">رمز عبور برنامه</label>
                    <input type="password" name="app_password" class="form-control" style="direction: ltr; text-align: left;" required autofocus>
                </div>
                <button type="submit" class="btn btn-primary w-100">
                    <i class="bi bi-box-arrow-in-left me-1"></i> ورود
                </button>
            </form>
        </div>
    </div>
</body>
</html>
<?php
exit;
endif;
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>دستیار کدنویسی Gemini</title>
    <link rel="stylesheet" href="/assets/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="/assets/css/bootstrap-icons.min.css">
    <link rel="stylesheet" href="/assets/css/github-dark.min.css">
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

        <div class="p-2 border-top border-secondary d-flex gap-1 flex-wrap">
            <button class="btn btn-sm btn-outline-light flex-grow-1" data-bs-toggle="modal" data-bs-target="#apiKeyModal">
                <i class="bi bi-key me-1"></i> API Key
            </button>
            <button id="exportDataBtn" class="btn btn-sm btn-outline-secondary" title="خروجی بکاپ JSON">
                <i class="bi bi-download"></i>
            </button>
            <label class="btn btn-sm btn-outline-secondary m-0" title="ورود بکاپ JSON">
                <i class="bi bi-upload"></i>
                <input type="file" id="importDataInput" accept=".json,application/json" class="d-none">
            </label>
            <?php if (isAppLockEnabled()): ?>
            <a href="/?logout=1" class="btn btn-sm btn-outline-danger" title="خروج از حساب">
                <i class="bi bi-box-arrow-right"></i>
            </a>
            <?php endif; ?>
        </div>
    </aside>

    <!-- بخش اصلی -->
    <main class="flex-grow-1 d-flex flex-column overflow-hidden">
        <!-- نوار ابزار بالا -->
        <header class="bg-white border-bottom px-3 py-2 d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <button id="toggleSidebarBtn" class="btn btn-sm btn-outline-secondary d-lg-none">
                    <i class="bi bi-list"></i>
                </button>
                <span id="activeContextBadge" class="badge text-bg-secondary">بدون پروژه (چت عمومی)</span>

                <!-- نمایشگر تخمین توکن و هشدار کانتکست -->
                <span id="tokenBadge" class="badge text-bg-light border text-dark" title="تخمین توکن‌های کانتکست فعلی (پروژه + تاریخچه)">
                    <i class="bi bi-cpu me-1"></i><span id="tokenCountText">0</span> توکن
                </span>

                <!-- دکمه پیام‌های پین شده -->
                <button id="togglePinnedDrawerBtn" class="btn btn-sm btn-outline-warning text-dark d-none" type="button" title="مشاهده پیام‌های پین‌شده">
                    <i class="bi bi-pin-angle-fill text-warning"></i> پین‌ها (<span id="pinnedCountBadge">0</span>)
                </button>
            </div>

            <div class="d-flex align-items-center gap-2 flex-wrap">
                <!-- انتخاب مدل -->
                <div class="input-group input-group-sm" style="width: 240px;">
                    <span class="input-group-text">مدل</span>
                    <select id="modelSelect" class="form-select">
                        <option value="">در انتظار API Key...</option>
                    </select>
                    <button id="refreshModelsBtn" class="btn btn-outline-secondary" type="button" title="بروزرسانی لیست مدل‌ها">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                </div>

                <!-- سطح تفکر -->
                <div class="input-group input-group-sm" style="width: 215px;">
                    <span class="input-group-text">تفکر</span>
                    <select id="thinkingLevelSelect" class="form-select" title="سطح تفکر برای این چت">
                        <option value="">پیش‌فرض مدل</option>
                        <option value="minimal">Minimal</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="xhigh">XHigh</option>
                    </select>
                    <button id="saveModelThinkingBtn" class="btn btn-outline-secondary" type="button" title="ذخیره به عنوان پیش‌فرض این مدل">
                        <i class="bi bi-bookmark-check"></i>
                    </button>
                </div>

                <!-- دما -->
                <div class="d-flex align-items-center gap-1" style="width: 130px;" title="Temperature">
                    <small class="text-muted">Temp:</small>
                    <input id="tempRange" type="range" class="form-range" min="0" max="2" step="0.1" value="0.4">
                    <small id="tempValue" class="fw-bold">0.4</small>
                </div>
            </div>
        </header>

        <!-- نوار هشدار پر شدن کانتکست -->
        <div id="contextWarningBanner" class="alert alert-warning rounded-0 m-0 py-1 px-3 small d-none d-flex justify-content-between align-items-center">
            <span id="contextWarningText"></span>
            <button type="button" class="btn-close btn-sm" onclick="document.getElementById('contextWarningBanner').classList.add('d-none')"></button>
        </div>

        <!-- پنل پیام‌های پین‌شده -->
        <div id="pinnedMessagesPanel" class="bg-warning-subtle border-bottom px-3 py-2 d-none">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <strong class="small"><i class="bi bi-pin-angle-fill me-1"></i>پیام‌های پین‌شده این گفتگو</strong>
                <button type="button" class="btn btn-sm btn-link text-dark p-0" id="closePinnedPanelBtn">بستن</button>
            </div>
            <div id="pinnedMessagesList" class="d-flex flex-column gap-1 small" style="max-height: 160px; overflow-y: auto;"></div>
        </div>

        <!-- محیط پیام‌ها -->
        <div id="chatMessages" class="flex-grow-1 overflow-auto p-3 p-md-4"></div>

        <!-- پیش‌نمایش فایل‌های متنی پیوست‌شده به پیام -->
        <div id="attachedFilesBar" class="px-3 py-1 bg-light border-top d-none flex-wrap gap-2 align-items-center"></div>

        <!-- نوار قالب‌های آماده پرامپت کدنویسی -->
        <div id="promptSnippetsBar" class="bg-light border-top px-3 py-1 d-flex align-items-center gap-1 overflow-x-auto">
            <span class="small text-muted text-nowrap me-1"><i class="bi bi-lightning-charge text-warning"></i> قالب‌ها:</span>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 text-nowrap snippet-btn" data-snippet="debug">دیباگ و رفع خطا</button>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 text-nowrap snippet-btn" data-snippet="refactor">بازنویسی و بهینه‌سازی</button>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 text-nowrap snippet-btn" data-snippet="security">بررسی امنیت</button>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 text-nowrap snippet-btn" data-snippet="explain">توضیح خط‌به‌خط</button>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 text-nowrap snippet-btn" data-snippet="zipformat">خروجی فایل‌بندی‌شده برای ZIP</button>
            <button type="button" id="manageSnippetsBtn" class="btn btn-sm btn-link py-0 px-1 text-decoration-none text-nowrap" title="افزودن/ویرایش قالب شخصی">+ قالب جدید</button>
        </div>

        <!-- فرم ارسال پیام -->
        <footer class="bg-white border-top p-3">
            <form id="chatForm" class="d-flex gap-2 align-items-end">
                <label class="btn btn-outline-secondary" title="افزودن فایل متنی به پیام">
                    <i class="bi bi-paperclip"></i>
                    <input type="file" id="chatTextFileInput" multiple class="d-none">
                </label>

                <textarea id="promptInput" rows="2" class="form-control" placeholder="سوال کدنویسی خود را بنویسید... (Enter برای ارسال، Shift+Enter برای خط جدید)"></textarea>

                <button id="stopBtn" type="button" class="btn btn-danger px-3 d-none" title="توقف تولید پاسخ">
                    <i class="bi bi-stop-circle-fill"></i> توقف
                </button>

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

<!-- مودال ایجاد / ویرایش پروژه + پروفایل تنظیمات + ویرایشگر فایل‌های پروژه -->
<div class="modal fade" id="projectModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h6 class="modal-title" id="projectModalTitle">پروژه جدید</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" id="projectIdInput">

                <div class="row g-3 mb-3">
                    <div class="col-md-4">
                        <label class="form-label small fw-bold">نام پروژه</label>
                        <input type="text" id="projectNameInput" class="form-control form-control-sm" placeholder="مثال: پنل مدیریت CodeIgniter">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold">مدل پیش‌فرض پروژه</label>
                        <select id="projectDefaultModelSelect" class="form-select form-select-sm">
                            <option value="">استفاده از مدل فعال فعلی</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold">سطح تفکر پروژه</label>
                        <select id="projectDefaultThinkingSelect" class="form-select form-select-sm">
                            <option value="">استفاده از پیش‌فرض مدل</option>
                            <option value="minimal">Minimal</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="xhigh">XHigh</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small fw-bold">Temperature</label>
                        <input type="number" id="projectDefaultTempInput" class="form-control form-control-sm dir-ltr" min="0" max="2" step="0.1" placeholder="0.4">
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">دستورالعمل سیستم (System Instructions)</label>
                    <textarea id="projectInstructionsInput" rows="3" class="form-control form-control-sm" placeholder="قوانین کدنویسی، سبک پاسخ‌گویی، نسخه PHP/JS و محدودیت‌ها را بنویسید..."></textarea>
                </div>

                <div class="mb-2 d-flex justify-content-between align-items-center">
                    <label class="form-label m-0 small fw-bold">فایل‌های مرجع متنی پروژه (امکان مشاهده و ویرایش مستقیم محتوا)</label>
                    <div class="d-flex gap-2">
                        <button type="button" id="createEmptyProjectFileBtn" class="btn btn-sm btn-outline-secondary">
                            <i class="bi bi-file-earmark-code me-1"></i> ساخت فایل جدید
                        </button>
                        <label class="btn btn-sm btn-outline-primary m-0">
                            <i class="bi bi-file-earmark-plus me-1"></i> آپلود فایل متنی
                            <input type="file" id="projectFilesInput" multiple class="d-none">
                        </label>
                    </div>
                </div>

                <div class="row g-2">
                    <div class="col-md-4">
                        <div id="projectFilesList" class="border rounded p-2 bg-light small" style="height: 260px; overflow-y: auto;"></div>
                    </div>
                    <div class="col-md-8">
                        <div id="projectFileEditorPane" class="border rounded p-2 bg-dark text-light d-none flex-column" style="height: 260px;">
                            <div class="d-flex justify-content-between align-items-center mb-1 gap-2">
                                <input type="text" id="editingProjectFileName" class="form-control form-control-sm bg-secondary text-white border-0 dir-ltr" placeholder="path/to/file.php">
                                <button type="button" id="applyProjectFileEditBtn" class="btn btn-sm btn-info text-nowrap">اعمال تغییر فایل</button>
                            </div>
                            <textarea id="editingProjectFileContent" class="form-control form-control-sm bg-black text-light border-secondary flex-grow-1 dir-ltr font-monospace" style="resize: none;"></textarea>
                        </div>
                        <div id="projectFileEditorPlaceholder" class="border rounded p-4 bg-light text-muted text-center d-flex align-items-center justify-content-center" style="height: 260px;">
                            برای مشاهده یا ویرایش کد، یکی از فایل‌های لیست سمت راست را انتخاب کنید یا فایل جدید بسازید.
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">انصراف</button>
                <button type="button" id="saveProjectBtn" class="btn btn-success btn-sm">ذخیره پروژه و تنظیمات</button>
            </div>
        </div>
    </div>
</div>

<!-- مودال افزودن قالب پرامپت شخصی -->
<div class="modal fade" id="customSnippetModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h6 class="modal-title">افزودن قالب پرامپت کدنویسی</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-2">
                    <label class="form-label small">عنوان دکمه</label>
                    <input type="text" id="newSnippetTitle" class="form-control form-control-sm" placeholder="مثال: نوشتن تست PHPUnit">
                </div>
                <div class="mb-2">
                    <label class="form-label small">متن پرامپت</label>
                    <textarea id="newSnippetPrompt" rows="4" class="form-control form-control-sm" placeholder="متنی که با کلیک روی دکمه به کادر پیام اضافه شود..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" id="saveCustomSnippetBtn" class="btn btn-primary btn-sm">ذخیره قالب</button>
            </div>
        </div>
    </div>
</div>

<script src="/assets/js/bootstrap.bundle.min.js"></script>
<script src="/assets/js/marked.min.js"></script>
<script src="/assets/js/highlight.min.js"></script>
<script src="/assets/js/jszip.min.js"></script>
<script src="/assets/js/db.js"></script>
<script src="/assets/js/app.js"></script>
</body>
</html>
