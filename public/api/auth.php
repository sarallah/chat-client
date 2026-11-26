<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params([
        'lifetime' => 86400 * 7,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function getAppPassword(): string
{
    return trim((string)(getenv('APP_PASSWORD') ?: ''));
}

function isAppLockEnabled(): bool
{
    return getAppPassword() !== '';
}

function isAuthenticated(): bool
{
    if (!isAppLockEnabled()) {
        return true;
    }
    return !empty($_SESSION['gemini_client_auth']) && $_SESSION['gemini_client_auth'] === true;
}

function requireApiAuth(): void
{
    if (!isAuthenticated()) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'دسترسی غیرمجاز. لطفاً ابتدا وارد برنامه شوید.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
