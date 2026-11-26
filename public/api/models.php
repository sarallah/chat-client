<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
requireApiAuth();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'متد درخواست مجاز نیست.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$apiKey = trim($_SERVER['HTTP_X_GEMINI_API_KEY'] ?? '');
if ($apiKey === '') {
    $apiKey = trim((string)(getenv('GEMINI_API_KEY') ?: ''));
}

if ($apiKey === '') {
    http_response_code(401);
    echo json_encode(['error' => 'کلید API تنظیم نشده است.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$url = 'https://generativelanguage.googleapis.com/v1beta/models';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'x-goog-api-key: ' . $apiKey,
        'Content-Type: application/json'
    ],
]);

$response = curl_exec($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false || $curlError !== '') {
    http_response_code(502);
    echo json_encode(['error' => 'خطا در ارتباط با سرور گوگل: ' . $curlError], JSON_UNESCAPED_UNICODE);
    exit;
}

$decoded = json_decode($response, true);
if ($httpCode < 200 || $httpCode >= 300) {
    $msg = $decoded['error']['message'] ?? 'خطا در دریافت لیست مدل‌ها از گوگل.';
    http_response_code($httpCode ?: 400);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

$models = [];
foreach ($decoded['models'] ?? [] as $item) {
    $methods = $item['supportedGenerationMethods'] ?? [];
    if (!in_array('generateContent', $methods, true)) {
        continue;
    }

    $rawName = (string)($item['name'] ?? '');
    $modelId = preg_replace('#^models/#', '', $rawName);
    if ($modelId === '') {
        continue;
    }

    $models[] = [
        'id' => $modelId,
        'displayName' => (string)($item['displayName'] ?? $modelId),
        'description' => (string)($item['description'] ?? ''),
        'inputTokenLimit' => (int)($item['inputTokenLimit'] ?? 1048576),
        'outputTokenLimit' => (int)($item['outputTokenLimit'] ?? 65536),
    ];
}

echo json_encode(['models' => $models], JSON_UNESCAPED_UNICODE);
