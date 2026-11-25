<?php
declare(strict_types=1);

@ini_set('output_buffering', 'Off');
@ini_set('zlib.output_compression', 'Off');
@ini_set('implicit_flush', '1');

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');

while (ob_get_level() > 0) {
    ob_end_flush();
}
ob_implicit_flush(true);

function sendSse(string $event, array $payload): void
{
    echo "event: {$event}\n";
    echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE) . "\n\n";
    flush();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendSse('error', ['message' => 'فقط درخواست POST مجاز است.']);
    exit;
}

$apiKey = trim($_SERVER['HTTP_X_GEMINI_API_KEY'] ?? '');
if ($apiKey === '') {
    $apiKey = trim((string)(getenv('GEMINI_API_KEY') ?: ''));
}

if ($apiKey === '') {
    sendSse('error', ['message' => 'کلید API گوگل وارد نشده است.']);
    exit;
}

$rawInput = file_get_contents('php://input');
$input = json_decode((string)$rawInput, true);

if (!is_array($input)) {
    sendSse('error', ['message' => 'ساختار JSON ارسالی نامعتبر است.']);
    exit;
}

$model = trim((string)($input['model'] ?? ''));
if ($model === '') {
    sendSse('error', ['message' => 'مدل انتخاب نشده است.']);
    exit;
}

$contents = $input['contents'] ?? [];
if (!is_array($contents) || count($contents) === 0) {
    sendSse('error', ['message' => 'هیچ پیامی برای ارسال وجود ندارد.']);
    exit;
}

$temperature = isset($input['temperature']) ? max(0.0, min(2.0, (float)$input['temperature'])) : 0.4;
$systemInstructionText = trim((string)($input['systemInstruction'] ?? ''));

$payload = [
    'contents' => $contents,
    'generationConfig' => [
        'temperature' => $temperature,
    ],
];

if ($systemInstructionText !== '') {
    $payload['systemInstruction'] = [
        'parts' => [
            ['text' => $systemInstructionText]
        ]
    ];
}

$encodedModel = rawurlencode($model);
$url = "https://generativelanguage.googleapis.com/v1beta/models/{$encodedModel}:streamGenerateContent?alt=sse";

$buffer = '';
$httpErrorText = '';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_TIMEOUT => 300,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-goog-api-key: ' . $apiKey,
    ],
    CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$buffer, &$httpErrorText): int {
        $buffer .= $chunk;
        $lines = explode("\n", $buffer);
        $buffer = array_pop($lines);

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || !str_starts_with($line, 'data:')) {
                continue;
            }
            $jsonStr = trim(substr($line, 5));
            if ($jsonStr === '' || $jsonStr === '[DONE]') {
                continue;
            }

            $data = json_decode($jsonStr, true);
            if (!is_array($data)) {
                continue;
            }

            if (isset($data['error']['message'])) {
                $httpErrorText = (string)$data['error']['message'];
                sendSse('error', ['message' => $httpErrorText]);
                continue;
            }

            $parts = $data['candidates'][0]['content']['parts'] ?? [];
            foreach ($parts as $part) {
                if (isset($part['text']) && $part['text'] !== '') {
                    sendSse('chunk', ['text' => (string)$part['text']]);
                }
            }
        }

        return strlen($chunk);
    },
]);

curl_exec($ch);
$curlErr = curl_error($ch);
$statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curlErr !== '') {
    sendSse('error', ['message' => 'خطای شبکه در اتصال به Gemini: ' . $curlErr]);
    exit;
}

if ($statusCode >= 400 && $httpErrorText === '') {
    $parsedErr = json_decode($buffer, true);
    $msg = $parsedErr['error']['message'] ?? ("خطای API با کد {$statusCode}");
    sendSse('error', ['message' => $msg]);
    exit;
}

sendSse('done', ['status' => 'completed']);
