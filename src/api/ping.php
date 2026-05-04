<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "DB error"]);
    exit;
}

// Add last_seen column if it doesn't exist
$conn->query("ALTER TABLE users ADD COLUMN last_seen DATETIME DEFAULT NULL");

$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare(
    "SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())"
);
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$row = $tokenStmt->get_result()->fetch_assoc();
$tokenStmt->close();

if (!$row) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$me = $row["username"];

$updateStmt = $conn->prepare("UPDATE users SET last_seen = NOW() WHERE username = ?");
$updateStmt->bind_param("s", $me);
$updateStmt->execute();
$updateStmt->close();

$conn->close();

http_response_code(200);
echo json_encode(["ok" => true]);
?>